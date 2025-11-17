import { Container } from "./Container";

export function Footer() {
  return (
    <footer className="border-t border-slate-800/60 bg-slate-950/80 py-6 text-sm text-slate-400">
      <Container className="flex items-center justify-between gap-4">
        <p>© {new Date().getFullYear()} Stellar Name Service</p>
        <p className="text-slate-500">Built for Soroban explorers</p>
      </Container>
    </footer>
  );
}
