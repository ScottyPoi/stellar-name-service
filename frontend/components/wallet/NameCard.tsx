"use client";

import React, { useState, useMemo } from "react";
import {
  TransactionBuilder,
  BASE_FEE,
  rpc,
} from "@stellar/stellar-sdk";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Grid,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useWallet } from "./WalletProvider";
import { type NameInfo } from "@/lib/indexerClient";
import { config } from "@/lib/config";
import { getNetworkPassphrase } from "@/lib/network";
import { createRenewOperation, createTransferOperation, getRpcUrl } from "@/lib/contractUtils";

interface NameCardProps {
  name: NameInfo;
  onRenewed?: () => void;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function NameCard({ name, onRenewed }: NameCardProps) {
  const { publicKey, signTx, network, networkPassphrase } = useWallet();
  const [isRenewing, setIsRenewing] = useState(false);
  const [renewStatus, setRenewStatus] = useState<string | null>(null);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState<string>("");
  const [isTransferring, setIsTransferring] = useState(false);

  // Create Soroban RPC server based on current network
  const rpcServer = useMemo(() => {
    const rpcUrl = getRpcUrl(network);
    return new rpc.Server(rpcUrl, { allowHttp: true });
  }, [network]);

  // Get network passphrase for transaction building
  const passphrase = useMemo(() => {
    return getNetworkPassphrase(network, networkPassphrase);
  }, [network, networkPassphrase]);

  const handleRenew = async () => {
    if (!publicKey || !name.fqdn) {
      setRenewStatus("Missing required information");
      return;
    }

    if (!network) {
      setRenewStatus("Network not detected. Please connect your wallet.");
      return;
    }

    const label = name.fqdn.split(".")[0]?.trim();
    if (!label) {
      setRenewStatus("Unable to parse label for this name.");
      return;
    }

    setIsRenewing(true);
    setRenewStatus(null);

    try {
      setRenewStatus("Loading account...");
      const sourceAccount = await rpcServer.getAccount(publicKey);

      setRenewStatus("Building transaction...");
      const renewOp = createRenewOperation(config.registrarId, publicKey, label);
      const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: passphrase,
      })
        .addOperation(renewOp)
        .setTimeout(60)
        .build();

      setRenewStatus("Preparing transaction via Soroban RPC...");
      const preparedTx = await rpcServer.prepareTransaction(tx);
      const unsignedXdr = preparedTx.toXDR();

      setRenewStatus("Waiting for Freighter signature...");
      const signedXdr = await signTx(unsignedXdr);

      const signedTx = TransactionBuilder.fromXDR(signedXdr, passphrase);

      setRenewStatus("Submitting transaction...");
      const sendResp = await rpcServer.sendTransaction(signedTx);
      if (sendResp.errorResult) {
        throw new Error("Transaction failed during send: errorResultXdr present");
      }

      const txHash = sendResp.hash ?? signedTx.hash().toString("hex");
      if (sendResp.status === "ERROR") {
        throw new Error("Transaction submission returned ERROR status");
      }

      let finalStatus: rpc.Api.GetTransactionStatus | rpc.Api.SendTransactionStatus =
        sendResp.status;
      if (sendResp.status === "PENDING") {
        setRenewStatus("Transaction pending...waiting for result");
        let getResp = await rpcServer.getTransaction(txHash);
        while (getResp.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          getResp = await rpcServer.getTransaction(txHash);
        }

        if (getResp.status === rpc.Api.GetTransactionStatus.FAILED) {
          throw new Error("Transaction failed on-chain");
        }

        finalStatus = getResp.status;
      }

      if (
        finalStatus === rpc.Api.GetTransactionStatus.SUCCESS ||
        finalStatus === "DUPLICATE"
      ) {
        setRenewStatus(`Success! Transaction: ${txHash}`);
      } else {
        throw new Error(`Unexpected transaction status: ${finalStatus}`);
      }
      
      // Call the callback to refresh the names list
      if (onRenewed) {
        setTimeout(() => {
          onRenewed();
        }, 2000); // Wait a bit for the indexer to catch up
      }
    } catch (e: any) {
      console.error("Renew error:", e);
      setRenewStatus(e?.message ?? "Error renewing name");
    } finally {
      setIsRenewing(false);
    }
  };

  const handleTransfer = async () => {
    if (!publicKey || !name.namehash) {
      setTransferStatus("Missing required information");
      return;
    }
    if (!network) {
      setTransferStatus("Network not detected. Please connect your wallet.");
      return;
    }
    if (!transferTo.trim()) {
      setTransferStatus("Enter a destination owner address.");
      return;
    }

    setIsTransferring(true);
    setTransferStatus(null);

    try {
      setTransferStatus("Loading account...");
      const sourceAccount = await rpcServer.getAccount(publicKey);

      setTransferStatus("Building transaction...");
      const transferOp = createTransferOperation(
        config.registryId,
        name.namehash,
        transferTo.trim()
      );
      const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: passphrase,
      })
        .addOperation(transferOp)
        .setTimeout(60)
        .build();

      setTransferStatus("Preparing transaction via Soroban RPC...");
      const preparedTx = await rpcServer.prepareTransaction(tx);
      const unsignedXdr = preparedTx.toXDR();

      setTransferStatus("Waiting for Freighter signature...");
      const signedXdr = await signTx(unsignedXdr);

      const signedTx = TransactionBuilder.fromXDR(signedXdr, passphrase);

      setTransferStatus("Submitting transaction...");
      const sendResp = await rpcServer.sendTransaction(signedTx);
      if (sendResp.errorResult) {
        throw new Error("Transaction failed during send: errorResultXdr present");
      }

      const txHash = sendResp.hash ?? signedTx.hash().toString("hex");
      if (sendResp.status === "ERROR") {
        throw new Error("Transaction submission returned ERROR status");
      }

      let finalStatus: rpc.Api.GetTransactionStatus | rpc.Api.SendTransactionStatus =
        sendResp.status;
      if (sendResp.status === "PENDING") {
        setTransferStatus("Transaction pending...waiting for result");
        let getResp = await rpcServer.getTransaction(txHash);
        while (getResp.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          getResp = await rpcServer.getTransaction(txHash);
        }

        if (getResp.status === rpc.Api.GetTransactionStatus.FAILED) {
          throw new Error("Transaction failed on-chain");
        }

        finalStatus = getResp.status;
      }

      if (
        finalStatus === rpc.Api.GetTransactionStatus.SUCCESS ||
        finalStatus === "DUPLICATE"
      ) {
        setTransferStatus(`Success! Transaction: ${txHash}`);
        setTransferTo("");
        // Refresh list after transfer since ownership changes
        if (onRenewed) {
          setTimeout(() => onRenewed(), 2000);
        }
      } else {
        throw new Error(`Unexpected transaction status: ${finalStatus}`);
      }
    } catch (e: any) {
      console.error("Transfer error:", e);
      setTransferStatus(e?.message ?? "Error transferring name");
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <Stack spacing={0.5}>
            <Typography variant="h6" fontWeight={800}>
              {name.fqdn}
            </Typography>
            {name.namehash && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontFamily: "monospace" }}
              >
                namehash: {name.namehash}
              </Typography>
            )}
          </Stack>
        }
        sx={{ pb: 0 }}
      />
      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              Owner
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
              {name.owner ?? "—"}
            </Typography>
          </Grid>
          {name.resolver && (
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                Resolver
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
              >
                {name.resolver}
              </Typography>
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              Expires
            </Typography>
            <Typography variant="body2">{formatDate(name.expires_at) ?? "—"}</Typography>
          </Grid>
        </Grid>

        {renewStatus && (
          <Alert severity={statusTone(renewStatus)} variant="outlined">
            {renewStatus}
          </Alert>
        )}
        {transferStatus && (
          <Alert severity={statusTone(transferStatus)} variant="outlined">
            {transferStatus}
          </Alert>
        )}

        <Divider />

        <Stack spacing={1.5}>
          <Button
            variant="contained"
            onClick={handleRenew}
            disabled={isRenewing || !publicKey || !name.fqdn || !network}
            sx={{ alignSelf: "flex-start", px: 3 }}
          >
            {isRenewing ? "Renewing…" : "Renew"}
          </Button>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems="stretch">
            <TextField
              fullWidth
              size="small"
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              placeholder="Destination owner address (G...)"
            />
            <Button
              variant="contained"
              color="secondary"
              onClick={handleTransfer}
              disabled={
                isTransferring ||
                !publicKey ||
                !name.namehash ||
                !network ||
                !transferTo.trim()
              }
              sx={{ px: 3 }}
            >
              {isTransferring ? "Transferring…" : "Transfer Ownership"}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function statusTone(message: string): "success" | "error" | "info" {
  if (message.toLowerCase().includes("success")) return "success";
  if (message.toLowerCase().includes("error") || message.toLowerCase().includes("missing")) {
    return "error";
  }
  return "info";
}
