import { config } from "@/lib/config";
import { Container } from "./Container";

export function Header() {
  return (
    <header className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur">
      <Container className="flex items-center justify-between gap-4 py-6">
        <div>
          <p className="text-base font-semibold tracking-tight text-white">
            Stellar Name Service
          </p>
          <p className="text-sm text-slate-400">
            Resolve .stellar names with confidence.
          </p>
        </div>
        <div className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-200">
          {config.network}
        </div>
      </Container>
    </header>
  );
}
