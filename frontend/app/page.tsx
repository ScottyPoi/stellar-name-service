export default function Home() {
  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold">Welcome to Stellar Name Service</h1>
        <p className="text-lg text-slate-300">
          Resolve, register, and manage .stellar names (coming soon). This page will
          grow as we wire up the on-chain indexer and Soroban contracts.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/50 p-6">
        <p className="text-sm font-semibold text-slate-200">Indexer status</p>
        <p className="text-sm text-slate-400">
          Indexer health and synchronization details will appear here in Step 2.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6">
        <p className="text-sm font-semibold text-slate-200">Name tools</p>
        <p className="text-sm text-slate-400">
          Search, resolve, and registration flows will land here shortly.
        </p>
      </div>
    </section>
  );
}
