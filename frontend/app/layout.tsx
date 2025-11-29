import type { Metadata } from "next";
import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { AppThemeProvider } from "@/components/ui/AppThemeProvider";
import { Box } from "@mui/material";
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
      <body>
        <AppThemeProvider>
          <WalletProvider>
            <Box
              sx={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                bgcolor: "background.default",
                color: "text.primary",
              }}
            >
              <Header />
              <Box component="main" sx={{ flex: 1 }}>{children}</Box>
              <Footer />
            </Box>
          </WalletProvider>
        </AppThemeProvider>
      </body>
    </html>
  );
}
