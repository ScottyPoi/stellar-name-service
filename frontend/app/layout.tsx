import type { Metadata } from "next";
import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";
import { Container } from "@/components/ui/Container";
import "./globals.css";
import { WalletProvider } from "@/components/wallet/WalletProvider";

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
      <body className="bg-slate-950 text-slate-100 antialiased">
        <WalletProvider>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1 py-10">
            <Container className="space-y-8">{children}</Container>
            </main>
            <Footer />
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
