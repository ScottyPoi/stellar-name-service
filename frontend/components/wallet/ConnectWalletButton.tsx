"use client";

import React from "react";
import { useWallet } from "./WalletProvider";

export const ConnectWalletButton: React.FC = () => {
  const {
    isInstalled,
    isConnecting,
    publicKey,
    network,
    error,
    connect,
    disconnect,
  } = useWallet();

  if (!isInstalled) {
    return (
      <div className="p-4 border rounded space-y-2">
        <p className="text-sm">
          Freighter is not detected. Install the browser extension to continue.
        </p>
        <a
          href="https://freighter.app"
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 underline text-sm"
        >
          Install Freighter
        </a>
      </div>
    );
  }

  if (publicKey) {
    return (
      <div className="p-4 border rounded space-y-3">
        <div>
          <div className="text-xs text-gray-500">Connected account</div>
          <div className="font-mono break-all text-sm">{publicKey}</div>
        </div>
        {network && (
          <div className="text-xs text-gray-500">
            Network: <span className="font-mono">{network}</span>
          </div>
        )}
        {error && (
          <div className="text-xs text-red-600">
            {error}
          </div>
        )}
        <button
          onClick={disconnect}
          className="px-3 py-1 border rounded text-xs"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded space-y-2">
      {error && (
        <div className="text-xs text-red-600">
          {error}
        </div>
      )}
      <button
        onClick={connect}
        disabled={isConnecting}
        className="px-4 py-2 border rounded text-sm"
      >
        {isConnecting ? "Connecting..." : "Connect Freighter"}
      </button>
    </div>
  );
};
