"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppBar, Avatar, Box, Button, IconButton, Stack, Toolbar, Typography } from "@mui/material";
import { useWallet } from "@/components/wallet/WalletProvider";
import { MenuSheet } from "./MenuSheet";

export function Header() {
  const { publicKey, isConnecting, connect, disconnect } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);

  const shortAddress = useMemo(
    () => (publicKey ? `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}` : null),
    [publicKey],
  );

  return (
    <>
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{
          borderBottom: "1px solid",
          borderColor: "divider",
          backdropFilter: "blur(16px)",
          background: "rgba(10, 16, 33, 0.9)",
        }}
      >
        <Toolbar
          sx={{
            width: "100%",
            maxWidth: "1180px",
            mx: "auto",
            px: { xs: 2, sm: 3 },
            py: 1.5,
            minHeight: 72,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flex: 1 }}>
            <Avatar
              sx={{
                width: 42,
                height: 42,
                background:
                  "linear-gradient(135deg, rgba(124,155,255,0.9), rgba(192,132,252,0.85))",
                fontWeight: 800,
                letterSpacing: 0.5,
              }}
            >
              S
            </Avatar>
            <Box>
              <Typography variant="subtitle1" fontWeight={700} color="text.primary">
                Stellar Name Service
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Personalized usernames on Stellar
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center">
            {publicKey ? (
              <>
                <Button
                  component={Link}
                  href="/my-names"
                  variant="outlined"
                  color="inherit"
                  sx={{
                    borderColor: "rgba(255,255,255,0.12)",
                    color: "text.primary",
                    px: 2.5,
                    display: { xs: "none", sm: "inline-flex" },
                    "&:hover": { borderColor: "rgba(255,255,255,0.2)" },
                  }}
                >
                  My names
                </Button>
                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={() => setMenuOpen(true)}
                  startIcon={
                    <Avatar
                      sx={{
                        width: 28,
                        height: 28,
                        background:
                          "linear-gradient(135deg, rgba(124,155,255,0.8), rgba(192,132,252,0.8))",
                      }}
                    >
                      {(publicKey ?? "S").slice(0, 1)}
                    </Avatar>
                  }
                  sx={{
                    borderColor: "rgba(255,255,255,0.12)",
                    color: "text.primary",
                    px: 2,
                    "&:hover": { borderColor: "rgba(255,255,255,0.2)" },
                  }}
                >
                  {shortAddress}
                </Button>
              </>
            ) : (
              <Button
                variant="contained"
                color="primary"
                onClick={connect}
                disabled={isConnecting}
                sx={{
                  px: 3,
                  py: 1,
                  background:
                    "linear-gradient(135deg, rgba(124,155,255,1), rgba(192,132,252,0.95))",
                }}
              >
                {isConnecting ? "Connecting…" : "Connect"}
              </Button>
            )}
            <IconButton
              onClick={() => setMenuOpen(true)}
              color="inherit"
              sx={{
                border: "1px solid rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.04)",
                "&:hover": { backgroundColor: "rgba(255,255,255,0.08)" },
              }}
              aria-label="Open menu"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </IconButton>
          </Stack>
        </Toolbar>
      </AppBar>
      <MenuSheet isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
