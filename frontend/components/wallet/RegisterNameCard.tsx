"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import { BASE_FEE, TransactionBuilder, rpc, xdr, Operation } from "@stellar/stellar-sdk";
import { useWallet } from "./WalletProvider";
import { config } from "@/lib/config";
import { getNetworkPassphrase } from "@/lib/network";
import {
  bytesToHex,
  computeCommitmentHex,
  createCommitOperation,
  createRegisterOperation,
  generateSecretBytes,
  getRpcUrl,
} from "@/lib/contractUtils";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";

type StepState = "pending" | "active" | "success" | "error";

interface Step {
  key: string;
  label: string;
  state: StepState;
  detail?: string;
}

interface RegisterNameCardProps {
  onRegistered?: () => void;
  initialLabel?: string;
}

const DEFAULT_COMMIT_WAIT_SECS = 12;

export function RegisterNameCard({ onRegistered, initialLabel }: RegisterNameCardProps) {
  const {
    publicKey,
    network,
    networkPassphrase,
    signTx,
  } = useWallet();

  const [label, setLabel] = useState(initialLabel ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [steps, setSteps] = useState<Step[]>(() => buildDefaultSteps());
  const [commitmentHex, setCommitmentHex] = useState<string | null>(null);
  const [registerHash, setRegisterHash] = useState<string | null>(null);

  useEffect(() => {
    if (initialLabel) {
      setLabel(initialLabel);
    }
  }, [initialLabel]);

  const rpcServer = useMemo(() => {
    const rpcUrl = getRpcUrl(network);
    return new rpc.Server(rpcUrl, { allowHttp: true });
  }, [network]);

  const passphrase = useMemo(() => {
    return getNetworkPassphrase(network, networkPassphrase);
  }, [network, networkPassphrase]);

  const labelError = useMemo(() => {
    const normalized = label.trim().toLowerCase();
    if (!normalized) {
      return "Missing name label.";
    }
    if (normalized.length > 63) {
      return "Label must be between 1 and 63 characters.";
    }
    if (!/^[a-z0-9-]+$/.test(normalized)) {
      return "Use lowercase letters, numbers, or hyphens only.";
    }
    if (normalized.startsWith("-") || normalized.endsWith("-")) {
      return "Hyphens cannot be the first or last character.";
    }
    return null;
  }, [label]);

  const markStep = useCallback((key: string, state: StepState, detail?: string) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.key === key ? { ...step, state, detail } : step
      )
    );
  }, []);

  const resetSteps = useCallback(() => {
    setSteps(buildDefaultSteps());
  }, []);

  const sendOperation = useCallback(
    async (operation: xdr.Operation<Operation.InvokeHostFunction>) => {
      if (!publicKey) {
        throw new Error("Connect your wallet before submitting transactions.");
      }

      const sourceAccount = await rpcServer.getAccount(publicKey);
      const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: passphrase,
      })
        .addOperation(operation)
        .setTimeout(60)
        .build();

      const preparedTx = await rpcServer.prepareTransaction(tx);
      const signedXdr = await signTx(preparedTx.toXDR());
      const signedTx = TransactionBuilder.fromXDR(signedXdr, passphrase);

      const sendResp = await rpcServer.sendTransaction(signedTx);
      if (sendResp.errorResult) {
        throw new Error("Transaction failed during send (errorResult present).");
      }

      const txHash = sendResp.hash ?? signedTx.hash().toString("hex");
      let finalStatus: rpc.Api.GetTransactionStatus | rpc.Api.SendTransactionStatus =
        sendResp.status;

      if (sendResp.status === "ERROR") {
        throw new Error("Transaction submission returned ERROR.");
      }

      if (sendResp.status === "PENDING") {
        let getResp = await rpcServer.getTransaction(txHash);
        while (getResp.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
          await sleep(1000);
          getResp = await rpcServer.getTransaction(txHash);
        }
        if (getResp.status === rpc.Api.GetTransactionStatus.FAILED) {
          throw new Error("Transaction failed on-chain.");
        }
        finalStatus = getResp.status;
      }

      if (
        finalStatus === rpc.Api.GetTransactionStatus.SUCCESS ||
        finalStatus === "DUPLICATE"
      ) {
        return { hash: txHash, status: finalStatus };
      }

      throw new Error(`Unexpected transaction status: ${finalStatus}`);
    },
    [passphrase, publicKey, rpcServer, signTx]
  );

  const handleRegister = useCallback(async () => {
    if (!publicKey) {
      setStatusNote("Connect Freighter before registering a name.");
      setStatusIsError(true);
      return;
    }
    if (!network) {
      setStatusNote("Network not detected. Open Freighter and try again.");
      setStatusIsError(true);
      return;
    }
    if (labelError) {
      setStatusNote(labelError);
      setStatusIsError(true);
      return;
    }

    const normalizedLabel = label.trim().toLowerCase();
    resetSteps();
    setIsSubmitting(true);
    setStatusNote(null);
    setStatusIsError(false);
    setCommitmentHex(null);
    setRegisterHash(null);

    try {
      // 1) Prepare commitment + secret
      markStep(
        "prepare",
        "active",
        "Generating a new secret and computing the commitment..."
      );
      const secret = generateSecretBytes();
      const commitment = await computeCommitmentHex(normalizedLabel, publicKey, secret);
      const secretHex = bytesToHex(secret);
      setCommitmentHex(commitment);
      markStep(
        "prepare",
        "success",
        `Commitment ready (${commitment.slice(0, 8)}…); secret generated safely in-browser.`
      );

      // 2) Commit transaction
      markStep("commit", "active", "Submitting commit transaction to Soroban RPC...");
      const commitOp = createCommitOperation(
        config.registrarId,
        publicKey,
        commitment,
        normalizedLabel.length
      );
      const commitResult = await sendOperation(commitOp);
      markStep(
        "commit",
        "success",
        `Commit confirmed (tx ${shortHash(commitResult.hash)}).`
      );

      // 3) Wait the minimum age before revealing
      markStep(
        "wait",
        "active",
        `Waiting ${DEFAULT_COMMIT_WAIT_SECS}s for commit_min_age_secs...`
      );
      await sleep(DEFAULT_COMMIT_WAIT_SECS * 1000);
      markStep("wait", "success", "Minimum age satisfied, revealing now.");

      // 4) Register transaction
      markStep("register", "active", "Building and submitting the register transaction...");
      const registerOp = createRegisterOperation(
        config.registrarId,
        publicKey,
        normalizedLabel,
        publicKey,
        secretHex,
        config.resolverId || null
      );
      const registerResult = await sendOperation(registerOp);
      setRegisterHash(registerResult.hash);
      markStep(
        "register",
        "success",
        `Register confirmed (tx ${shortHash(registerResult.hash)}).`
      );

      // 5) Finalize + refresh
      markStep(
        "finalize",
        "active",
        "Refreshing your registrations…"
      );
      if (onRegistered) {
        setTimeout(onRegistered, 1500);
      }
      markStep("finalize", "success", `${normalizedLabel}.stellar is now registered to you.`);
      setStatusNote(`Registered ${normalizedLabel}.stellar successfully.`);
      setStatusIsError(false);
    } catch (error: any) {
      console.error("Registration failed:", error);
      setStatusNote(error?.message ?? "Registration failed");
      setStatusIsError(true);
      // Flag the active step as errored
      setSteps((prev) => {
        const next = [...prev];
        const idx = next.findIndex((s) => s.state === "active");
        if (idx >= 0) {
          next[idx] = { ...next[idx], state: "error", detail: error?.message ?? next[idx].detail };
        } else {
          const last = next.findIndex((s) => s.state === "pending");
          if (last >= 0) {
            next[last] = { ...next[last], state: "error", detail: error?.message ?? next[last].detail };
          }
        }
        return next;
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    label,
    labelError,
    markStep,
    network,
    onRegistered,
    publicKey,
    resetSteps,
    sendOperation,
  ]);

  const buttonDisabled =
    isSubmitting ||
    !publicKey ||
    !network ||
    !!labelError;

  const hasErroredStep = useMemo(
    () => steps.some((step) => step.state === "error"),
    [steps]
  );
  const statusToneIsError = hasErroredStep || statusIsError;

  return (
    <Card>
      <CardContent>
        <Stack spacing={3}>
          <Stack spacing={0.75}>
            <Typography variant="overline" color="text.secondary">
              Registration
            </Typography>
            <Typography variant="h5" fontWeight={800}>
              Register {label ? `${label}.stellar` : "this name"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Commit + reveal using your connected Freighter wallet. Default resolver will be applied automatically.
            </Typography>
          </Stack>

          <Box
            sx={{
              px: 2,
              py: 1.5,
              borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">
                Name
              </Typography>
              <Chip
                label={label ? `${label}.stellar` : "Name pending"}
                color="primary"
                variant="outlined"
                sx={{
                  borderColor: "rgba(255,255,255,0.14)",
                  fontWeight: 700,
                  px: 1,
                  height: 34,
                }}
              />
            </Stack>
            {!publicKey && (
              <Typography variant="body2" color="warning.main">
                Connect Freighter to continue.
              </Typography>
            )}
          </Box>

          <Button
            variant="contained"
            color="secondary"
            onClick={handleRegister}
            disabled={buttonDisabled}
            sx={{ py: 1.25, fontWeight: 700 }}
            fullWidth
          >
            {isSubmitting ? "Registering…" : "Register name"}
          </Button>

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 0.4 }}>
              Registration status
            </Typography>
            <Stack spacing={1.25} mt={1.25}>
              {steps.map((step) => (
                <Stack
                  key={step.key}
                  direction="row"
                  spacing={1.5}
                  alignItems="flex-start"
                  sx={{
                    px: 1.25,
                    py: 0.75,
                    borderRadius: 1.5,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <StepBadge state={step.state} />
                  <Box>
                    <Typography variant="body2" color="text.primary">
                      {step.label}
                    </Typography>
                    {step.detail && (
                      <Typography
                        variant="caption"
                        color={step.state === "error" ? "error.main" : "text.secondary"}
                      >
                        {step.detail}
                      </Typography>
                    )}
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Box>

          <Divider />

          <Stack spacing={1}>
            {commitmentHex && (
              <StatusRow label="Commitment" value={commitmentHex} />
            )}
            {registerHash && (
              <StatusRow label="Register tx hash" value={registerHash} />
            )}
            {statusNote && (
              <Alert severity={statusToneIsError ? "error" : "success"} variant="outlined">
                {statusNote}
              </Alert>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function buildDefaultSteps(): Step[] {
  return [
    { key: "prepare", label: "Prepare commitment & secret", state: "pending" },
    { key: "commit", label: "Submit commit transaction", state: "pending" },
    { key: "wait", label: "Wait for commit min age", state: "pending" },
    { key: "register", label: "Submit register transaction", state: "pending" },
    { key: "finalize", label: "Finalize & refresh", state: "pending" },
  ];
}

function StepBadge({ state }: { state: StepState }) {
  const tone: Record<StepState, { label: string; color: "default" | "info" | "success" | "error" }> = {
    pending: { label: "Pending", color: "default" },
    active: { label: "In progress", color: "info" },
    success: { label: "Done", color: "success" },
    error: { label: "Error", color: "error" },
  };

  const current = tone[state];

  return <Chip size="small" label={current.label} color={current.color} variant="outlined" />;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortHash(hash: string) {
  if (!hash) return "";
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 1.5,
        px: 1.5,
        py: 1,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        color="text.primary"
        sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
      >
        {value}
      </Typography>
    </Box>
  );
}
