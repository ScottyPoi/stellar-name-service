"use client";

import React from "react";
import { type NameInfo } from "@/lib/indexerClient";

interface NameCardProps {
  name: NameInfo;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function NameCard({ name }: NameCardProps) {
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

      <div className="flex gap-3 mt-auto pt-4 border-t border-slate-800/60">
        <button
          disabled
          className="flex-1 rounded-xl bg-slate-700/50 px-4 py-2 text-sm font-semibold text-slate-400 cursor-not-allowed transition"
          title="Refresh functionality coming soon"
        >
          Refresh
        </button>
        <button
          disabled
          className="flex-1 rounded-xl bg-slate-700/50 px-4 py-2 text-sm font-semibold text-slate-400 cursor-not-allowed transition"
          title="Transfer ownership functionality coming soon"
        >
          Transfer Ownership
        </button>
      </div>
    </div>
  );
}

