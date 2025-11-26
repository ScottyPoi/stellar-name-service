"use client";

import {
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import { useWallet } from "@/components/wallet/WalletProvider";
import { config } from "@/lib/config";

interface MenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MenuSheet({ isOpen, onClose }: MenuSheetProps) {
  const { publicKey, disconnect } = useWallet();

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: 380 },
          backdropFilter: "blur(18px)",
          backgroundColor: "rgba(10, 16, 33, 0.9)",
          borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
        },
      }}
    >
      <Box display="flex" flexDirection="column" height="100%">
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          px={2.5}
          py={2}
        >
          <Box>
            <Typography variant="h6" fontWeight={700}>
              Menu
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Preferences & quick links
            </Typography>
          </Box>
          <IconButton onClick={onClose} color="inherit" aria-label="Close menu">
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </IconButton>
        </Stack>

        <Divider />

        <Box flex={1} overflow="auto" px={2.5} py={3}>
          <Stack spacing={3.5}>
            <Box>
              <Typography variant="overline" color="text.secondary">
                Settings
              </Typography>
              <Stack spacing={1.5} mt={1.5}>
                <SettingRow label="Language" value="English" />
                <SettingRow label="Theme" value="Dark" />
                <SettingRow label="Currency" value="XLM" />
              </Stack>
            </Box>

            <Box>
              <Typography variant="overline" color="text.secondary">
                Resources
              </Typography>
              <Stack spacing={1.25} mt={1.5}>
                {["Support", "Community", "Documentation"].map((item) => (
                  <Link
                    key={item}
                    href="#"
                    underline="hover"
                    color="text.primary"
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderRadius: 1.5,
                      bgcolor: "rgba(255,255,255,0.03)",
                      "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                      display: "block",
                    }}
                  >
                    {item}
                  </Link>
                ))}
              </Stack>
            </Box>

            <Box>
              <Typography variant="overline" color="text.secondary">
                Social
              </Typography>
              <Stack direction="row" spacing={1.25} mt={1.5}>
                <SocialIcon label="GitHub" />
                <SocialIcon label="Discord" />
                <SocialIcon label="Twitter" />
              </Stack>
            </Box>
          </Stack>
        </Box>

        <Divider />

        <Box px={2.5} py={3} borderTop="1px solid rgba(255,255,255,0.06)">
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" color="text.secondary">
              {config.network}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              0.06 stroops
            </Typography>
          </Stack>
          {publicKey && (
            <Button
              variant="outlined"
              fullWidth
              sx={{ mt: 2 }}
              onClick={() => {
                disconnect();
                onClose();
              }}
            >
              Disconnect
            </Button>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{
        px: 1.5,
        py: 1.25,
        borderRadius: 1.5,
        bgcolor: "rgba(255,255,255,0.03)",
      }}
    >
      <Typography variant="body2" color="text.primary">
        {label}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {value}
      </Typography>
    </Stack>
  );
}

function SocialIcon({ label }: { label: string }) {
  return (
    <IconButton
      aria-label={label}
      sx={{
        border: "1px solid rgba(255,255,255,0.12)",
        bgcolor: "rgba(255,255,255,0.05)",
        "&:hover": { bgcolor: "rgba(255,255,255,0.1)" },
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="12" cy="12" r="10" opacity="0.16" />
        <path
          d="M8 12.5c.6 1 1.8 1.8 3.2 1.8 1.4 0 2.6-.8 3.2-1.8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9" cy="10" r="1" />
        <circle cx="15" cy="10" r="1" />
      </svg>
    </IconButton>
  );
}
