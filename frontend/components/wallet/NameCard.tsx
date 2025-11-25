"use client";

import React, { useState, useMemo } from "react";
import {
  TransactionBuilder,
  BASE_FEE,
  rpc,
} from "@stellar/stellar-sdk";
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
    <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-6 shadow-lg shadow-slate-950/30 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold text-white">{name.fqdn}</h3>
        {name.namehash && (
          <p className="font-mono text-xs text-slate-500">namehash: {name.namehash}</p>
        )}
      </div>

      <dl className="grid gap-3 border-t border-slate-800/60 pt-4 text-sm">
        <div>
          <dt className="text-slate-400">Owner</dt>
          <dd className="font-mono text-slate-100 break-all">
            {name.owner ?? "—"}
          </dd>
        </div>
        {name.resolver && (
          <div>
            <dt className="text-slate-400">Resolver</dt>
            <dd className="font-mono text-slate-100 break-all">
              {name.resolver}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-slate-400">Expires</dt>
          <dd className="text-slate-100">
            {formatDate(name.expires_at) ?? "—"}
          </dd>
        </div>
      </dl>

      {renewStatus && (
        <div className={`text-xs p-2 rounded ${
          renewStatus.includes("Success") 
            ? "bg-green-900/20 text-green-400" 
            : renewStatus.includes("Error") || renewStatus.includes("Missing")
            ? "bg-red-900/20 text-red-400"
            : "bg-slate-800/40 text-slate-300"
        }`}>
          {renewStatus}
        </div>
      )}
      {transferStatus && (
        <div className={`text-xs p-2 rounded ${
          transferStatus.includes("Success") 
            ? "bg-green-900/20 text-green-400" 
            : transferStatus.includes("Error") || transferStatus.includes("Missing")
            ? "bg-red-900/20 text-red-400"
            : "bg-slate-800/40 text-slate-300"
        }`}>
          {transferStatus}
        </div>
      )}

      <div className="flex flex-col gap-3 mt-auto pt-4 border-t border-slate-800/60">
        <button
          onClick={handleRenew}
          disabled={isRenewing || !publicKey || !name.fqdn || !network}
          className="flex-1 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:bg-slate-700/50 disabled:text-slate-400 disabled:cursor-not-allowed"
          title={!publicKey ? "Connect wallet to renew" : !name.fqdn ? "Name missing" : "Renew this name"}
        >
          {isRenewing ? "Renewing..." : "Renew"}
        </button>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={transferTo}
            onChange={(e) => setTransferTo(e.target.value)}
            placeholder="Destination owner address (G...)"
            className="flex-1 rounded-lg border border-slate-800/70 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
          />
          <button
            onClick={handleTransfer}
            disabled={
              isTransferring ||
              !publicKey ||
              !name.namehash ||
              !network ||
              !transferTo.trim()
            }
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:bg-slate-700/50 disabled:text-slate-400 disabled:cursor-not-allowed"
            title={!publicKey ? "Connect wallet to transfer" : !name.namehash ? "Namehash missing" : "Transfer this name"}
          >
            {isTransferring ? "Transferring..." : "Transfer Ownership"}
          </button>
        </div>
      </div>
    </div>
  );
}
