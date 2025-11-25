"use client";

import React, { useEffect, useState } from "react";
import { useWallet } from "./WalletProvider";
import { getNamesByOwner, type NameInfo } from "@/lib/indexerClient";

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
  const [names, setNames] = useState<NameInfo[]>([]);
  const [namesLoading, setNamesLoading] = useState(false);
  const [namesError, setNamesError] = useState<string | null>(null);

  const fetchNames = React.useCallback(async () => {
    if (!publicKey) {
      setNames([]);
      setNamesError(null);
      return;
    }

    setNamesLoading(true);
    setNamesError(null);

    try {
      const response = await getNamesByOwner(publicKey);
      setNames(response.names);
      setNamesLoading(false);
    } catch (err) {
      setNamesError(err instanceof Error ? err.message : "Failed to fetch names");
      setNamesLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    fetchNames();
  }, [fetchNames]);

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
        
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-500">Registered Names</div>
            <button
              onClick={fetchNames}
              disabled={namesLoading || !publicKey}
              className="px-2 py-1 text-xs border rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh names list"
            >
              {namesLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {namesLoading ? (
            <div className="text-xs text-gray-400">Loading names...</div>
          ) : namesError ? (
            <div className="text-xs text-red-600">{namesError}</div>
          ) : names.length === 0 ? (
            <div className="text-xs text-gray-400">No names registered to this account</div>
          ) : (
            <div className="space-y-2">
              {names.map((name) => (
                <div
                  key={name.namehash}
                  className="p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs"
                >
                  <div className="font-semibold text-gray-900 dark:text-gray-100">
                    {name.fqdn}
                  </div>
                  {name.expires_at && (
                    <div className="text-gray-500 mt-1">
                      Expires: {new Date(name.expires_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

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
