"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "./WalletProvider";

interface ConnectWalletButtonProps {
  variant?: "default" | "compact";
}

export const ConnectWalletButton: React.FC<ConnectWalletButtonProps> = ({
  variant = "default",
}) => {
  const {
    isInstalled,
    isConnecting,
    publicKey,
    error,
    connect,
    disconnect,
  } = useWallet();
  const router = useRouter();

  const shortAddress = publicKey
    ? `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`
    : null;

  if (!isInstalled) {
    return (
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 space-y-3">
        <p className="text-sm text-slate-300">
          Freighter is not detected. Install the browser extension to continue.
        </p>
        <a
          href="https://freighter.app"
          target="_blank"
          rel="noreferrer"
          className="inline-block rounded-lg bg-gradient-to-r from-sky-500 to-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-sky-400 hover:to-purple-500"
        >
          Install Freighter
        </a>
      </div>
    );
  }

  if (publicKey) {
    if (variant === "compact") {
      return (
        <button
          onClick={() => router.push("/my-names")}
          className="flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800/60"
        >
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-sky-400 to-purple-500"></div>
          <span>{shortAddress}</span>
        </button>
      );
    }

    return (
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-sky-400 to-purple-500"></div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Connected account
            </div>
            <div className="font-mono text-sm text-slate-100 break-all">
              {publicKey}
            </div>
          </div>
        </div>
        {error && (
          <div className="rounded-lg bg-red-900/20 border border-red-800/60 p-2">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/my-names")}
            className="flex-1 rounded-lg bg-gradient-to-r from-sky-500 to-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-sky-400 hover:to-purple-500"
          >
            My Names
          </button>
          <button
            onClick={disconnect}
            className="rounded-lg border border-slate-700/70 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700/60"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 space-y-3">
      {error && (
        <div className="rounded-lg bg-red-900/20 border border-red-800/60 p-2">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
      <button
        onClick={connect}
        disabled={isConnecting}
        className="w-full rounded-lg bg-gradient-to-r from-sky-500 to-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-sky-400 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isConnecting ? "Connecting..." : "Connect Wallet"}
      </button>
    </div>
  );
};
