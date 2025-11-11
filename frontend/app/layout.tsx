import type { Metadata } from "next";
import { config } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stellar Name Service",
  description: "Manage and resolve .stellar names.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
        <header className="border-b border-slate-800 px-6 py-4">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-300">
                Stellar Name Service
              </p>
              <p className="text-sm text-slate-400">
                A simple interface to resolve .stellar names.
              </p>
            </div>
            {Object.entries(config).map(([key, val]) => {
              return (
                <div key={key} className="text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    {key}: {val}
                  </p>
                </div>
              );
            })}
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
          {children}
        </main>
        <footer className="border-t border-slate-800 px-6 py-4 text-center text-sm text-slate-400">
          Powered by Stellar / Soroban
        </footer>
      </body>
    </html>
  );
}
