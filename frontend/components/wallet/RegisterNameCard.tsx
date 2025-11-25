"use client";

import React, { useMemo, useState, useCallback } from "react";
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

type StepState = "pending" | "active" | "success" | "error";

interface Step {
  key: string;
  label: string;
  state: StepState;
  detail?: string;
}

interface RegisterNameCardProps {
  onRegistered?: () => void;
}

const DEFAULT_COMMIT_WAIT_SECS = 12;

export function RegisterNameCard({ onRegistered }: RegisterNameCardProps) {
  const {
    publicKey,
    network,
    networkPassphrase,
    signTx,
  } = useWallet();

  const [label, setLabel] = useState("");
  const [resolver, setResolver] = useState(config.resolverId ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [steps, setSteps] = useState<Step[]>(() => buildDefaultSteps());
  const [commitmentHex, setCommitmentHex] = useState<string | null>(null);
  const [registerHash, setRegisterHash] = useState<string | null>(null);

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
      return "Enter a label to register (without .stellar)";
    }
    if (normalized.length < 1 || normalized.length > 63) {
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
        resolver || null
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
    resolver,
    sendOperation,
    setSteps,
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
    <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-6 shadow-inner space-y-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-white">Register a new name</h2>
        <p className="text-sm text-slate-400">
          Commits and reveals happen from your connected wallet using the registrar contract.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[2fr,1fr] md:items-end">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Name label
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value.toLowerCase())}
              placeholder="example"
              className={`flex-1 rounded-xl border bg-slate-950/80 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                labelError
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500/40"
                  : "border-slate-700/70 focus:border-sky-500 focus:ring-sky-500/40"
              }`}
            />
            <span className="rounded-xl border border-slate-800/70 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
              .stellar
            </span>
          </div>
          {labelError ? (
            <p className="text-sm text-red-400">{labelError}</p>
          ) : (
            <p className="text-xs text-slate-500">
              Lowercase letters, numbers, and interior hyphens allowed.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Resolver (optional)
          </label>
          <input
            type="text"
            value={resolver}
            onChange={(e) => setResolver(e.target.value)}
            placeholder="Leave blank to skip"
            className="w-full rounded-xl border border-slate-700/70 bg-slate-950/80 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:border-sky-500 focus:ring-sky-500/40"
          />
          <p className="text-xs text-slate-500">
            Defaults to configured resolver ID ({config.resolverId}).
          </p>
        </div>
      </div>

      <button
        onClick={handleRegister}
        disabled={buttonDisabled}
        className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-emerald-400 disabled:bg-slate-700/50 disabled:text-slate-400 disabled:cursor-not-allowed"
      >
        {isSubmitting ? "Registering…" : "Register name"}
      </button>

      <div className="space-y-3 rounded-xl border border-slate-800/60 bg-slate-950/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Registration status
        </p>
        <ul className="space-y-2">
          {steps.map((step) => (
            <li key={step.key} className="flex gap-3 text-sm">
              <StepBadge state={step.state} />
              <div className="flex flex-col gap-1">
                <span className="text-slate-100">{step.label}</span>
                {step.detail && (
                  <span
                    className={`text-xs ${
                      step.state === "error"
                        ? "text-red-300"
                        : "text-slate-400"
                    }`}
                  >
                    {step.detail}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>

        {commitmentHex && (
          <div className="rounded-lg bg-slate-900/80 p-3 text-xs text-slate-400 break-words">
            Commitment: <span className="text-slate-200">{commitmentHex}</span>
          </div>
        )}
        {registerHash && (
          <div className="rounded-lg bg-slate-900/80 p-3 text-xs text-slate-400 break-words">
            Register tx hash: <span className="text-slate-200">{registerHash}</span>
          </div>
        )}
        {statusNote && (
          <div
            className={`rounded-lg p-3 text-sm ${
              statusToneIsError
                ? "bg-red-900/30 text-red-200"
                : "bg-emerald-900/20 text-emerald-200"
            }`}
          >
            {statusNote}
          </div>
        )}
        {!publicKey && (
          <div className="rounded-lg bg-slate-900/80 p-3 text-sm text-slate-400">
            Connect Freighter to register a name.
          </div>
        )}
      </div>
    </div>
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
  const styles: Record<StepState, string> = {
    pending: "bg-slate-800/70 text-slate-400 border-slate-700/70",
    active: "bg-sky-500/20 text-sky-200 border-sky-400/70",
    success: "bg-emerald-500/20 text-emerald-200 border-emerald-400/70",
    error: "bg-red-500/20 text-red-200 border-red-400/70",
  };
  const label: Record<StepState, string> = {
    pending: "•",
    active: "…",
    success: "✓",
    error: "!",
  };

  return (
    <span
      className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${styles[state]}`}
      aria-label={state}
    >
      {label[state]}
    </span>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortHash(hash: string) {
  if (!hash) return "";
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}
