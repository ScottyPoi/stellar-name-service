interface ResultCardProps {
  fqdn: string;
  data: Record<string, unknown>;
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

export function ResultCard({ fqdn, data }: ResultCardProps) {
  const owner = (data.owner as string | undefined) ?? null;
  const resolver = (data.resolver as string | undefined) ?? null;
  const address = (data.address as string | undefined) ?? null;
  const expiresAt =
    (data.expiresAt as string | undefined) ??
    (data.expires_at as string | undefined) ??
    null;
  const namehash = (data.namehash as string | undefined) ?? null;
  const recordsEntries =
    typeof data.records === "object" && data.records !== null
      ? Object.entries(data.records as Record<string, string>)
      : [];

  return (
    <div className="motion-safe:animate-fade-in rounded-2xl border border-slate-800/70 bg-slate-900/60 p-6 shadow-lg shadow-slate-950/30">
      <div className="flex flex-col gap-2 pb-4">
        <p className="text-xs uppercase tracking-wide text-sky-300">Result</p>
        <h2 className="text-2xl font-semibold text-white">{fqdn}</h2>
        {namehash ? (
          <p className="font-mono text-xs text-slate-500">namehash: {namehash}</p>
        ) : null}
      </div>

      <dl className="grid gap-4 border-t border-slate-800/60 pt-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-400">Owner</dt>
          <dd className="font-mono text-slate-100">
            {owner ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Resolver</dt>
          <dd className="font-mono text-slate-100">
            {resolver ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Address</dt>
          <dd className="font-mono text-slate-100">
            {address ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Expires</dt>
          <dd className="text-slate-100">
            {formatDate(expiresAt) ?? "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-6 border-t border-slate-800/60 pt-4">
        <p className="text-sm font-medium text-slate-200">Records</p>
        {recordsEntries.length === 0 ? (
          <p className="text-sm text-slate-500">No records were found.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {recordsEntries.map(([key, value]) => (
              <li
                key={key}
                className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs uppercase tracking-wide text-slate-400">
                  {key}
                </span>
                <span className="text-slate-100">{value}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
