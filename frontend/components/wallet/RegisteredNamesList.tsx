"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useWallet } from "./WalletProvider";
import { getNamesByOwner, type NameInfo } from "@/lib/indexerClient";
import { NameCard } from "./NameCard";

interface RegisteredNamesListProps {
  refreshToken?: number;
}

export function RegisteredNamesList({ refreshToken }: RegisteredNamesListProps) {
  const { publicKey } = useWallet();
  const [names, setNames] = useState<NameInfo[]>([]);
  const [namesLoading, setNamesLoading] = useState(false);
  const [namesError, setNamesError] = useState<string | null>(null);

  const fetchNames = useCallback(async () => {
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
  }, [fetchNames, refreshToken]);

  if (!publicKey) {
    return null;
  }

  if (namesLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h2 className="text-xl font-semibold text-white">My Registered Names</h2>
          <p className="text-sm text-slate-400">
            Loading names registered to your wallet...
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-6">
          <p className="text-sm text-slate-400 text-center">Loading...</p>
        </div>
      </div>
    );
  }

  if (namesError) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h2 className="text-xl font-semibold text-white">My Registered Names</h2>
        </div>
        <div className="rounded-xl border border-red-800/60 bg-red-900/20 p-4">
          <p className="text-sm text-red-400">{namesError}</p>
        </div>
      </div>
    );
  }

  if (names.length === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h2 className="text-xl font-semibold text-white">My Registered Names</h2>
          <p className="text-sm text-slate-400">
            Names registered to your connected wallet will appear here
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-6">
          <p className="text-sm text-slate-400 text-center">
            No names registered to this account
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-semibold text-white">My Registered Names</h2>
        <p className="text-sm text-slate-400">
          {names.length} {names.length === 1 ? "name" : "names"} registered to your wallet
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {names.map((name) => (
          <NameCard key={name.namehash} name={name} onRenewed={fetchNames} />
        ))}
      </div>
    </div>
  );
}
