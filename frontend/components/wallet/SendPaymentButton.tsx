"use client";

import React, { useState, useMemo } from "react";
import  {
  TransactionBuilder,
  Operation,
  Asset,
  BASE_FEE,
  Horizon,
} from "@stellar/stellar-sdk";
import { useWallet } from "./WalletProvider";
import { getHorizonUrl, getNetworkPassphrase, getNetworkDisplayName } from "@/lib/network";

export const SendPaymentButton: React.FC = () => {
  const { publicKey, signTx, network, networkPassphrase } = useWallet();
  const [status, setStatus] = useState<string | null>(null);

  // Create Horizon server instance based on current network
  const horizonServer = useMemo(() => {
    const horizonUrl = getHorizonUrl(network);
    return new Horizon.Server(horizonUrl, { allowHttp: true });
  }, [network]);

  // Get network passphrase for transaction building
  const passphrase = useMemo(() => {
    return getNetworkPassphrase(network, networkPassphrase);
  }, [network, networkPassphrase]);

  const handleSend = async () => {
    try {
      if (!publicKey) {
        setStatus("Connect wallet first.");
        return;
      }

      if (!network) {
        setStatus("Network not detected. Please connect your wallet.");
        return;
      }

      setStatus("Loading account...");

      const sourceAccount = await horizonServer.loadAccount(publicKey);

      const fee = BASE_FEE;

      const tx = new TransactionBuilder(sourceAccount, {
        fee,
        networkPassphrase: passphrase,
      })
        .addOperation(
          Operation.payment({
            destination: publicKey, // self-payment for demo
            asset: Asset.native(),
            amount: "1",
          })
        )
        .setTimeout(60)
        .build();

      const unsignedXdr = tx.toXDR();

      setStatus("Waiting for Freighter signature...");

      // signTx uses the network from wallet context automatically
      const signedXdr = await signTx(unsignedXdr);

      const signedTx = TransactionBuilder.fromXDR(signedXdr, passphrase);

      setStatus("Submitting transaction...");

      const res = await horizonServer.submitTransaction(signedTx);

      setStatus(`Success! Hash: ${res.hash}`);
    } catch (e: any) {
      console.error(e);
      setStatus(e?.message ?? "Error sending payment");
    }
  };

  const networkDisplayName = getNetworkDisplayName(network);

  return (
    <div className="space-y-2">
      <button
        onClick={handleSend}
        disabled={!publicKey || !network}
        className="px-4 py-2 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Send 1 XLM to myself ({networkDisplayName})
      </button>
      {status && <div className="text-xs text-gray-600">{status}</div>}
    </div>
  );
};
