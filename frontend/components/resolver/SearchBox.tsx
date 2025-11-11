import { FormEvent } from "react";

interface SearchBoxProps {
  value: string;
  loading?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  suffix?: string;
}

export function SearchBox({
  value,
  loading = false,
  onChange,
  onSubmit,
  suffix = ".stellar",
}: SearchBoxProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim() || loading) {
      return;
    }
    onSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-900/40 p-6 shadow-inner"
    >
      <label
        htmlFor="fqdn"
        className="text-sm font-medium uppercase tracking-wide text-slate-400"
      >
        Search for a Stellar name
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 items-center rounded-xl border border-slate-700/70 bg-slate-950/80 pr-3 text-base shadow focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/40">
          <input
            id="fqdn"
            type="text"
            value={value}
            placeholder="example"
            onChange={(event) => onChange(event.target.value)}
            className="flex-1 bg-transparent px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {suffix}
          </span>
        </div>
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white shadow transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-600"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Tip: we automatically append{" "}
        <span className="font-mono text-slate-200">{suffix}</span> to your search.
      </p>
    </form>
  );
}
