"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useWallet } from "@/components/wallet/WalletProvider";
import { getNamesByOwner, type NameInfo } from "@/lib/indexerClient";

function calculateTimeUntilExpiry(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diff = expiry.getTime() - now.getTime();

  if (diff < 0) return "Expired";

  const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30));
  const days = Math.floor((diff % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));

  if (months > 0) {
    return `${months} ${months === 1 ? "month" : "months"}`;
  }
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function formatExpiryText(expiresAt: string | null | undefined): string {
  const timeUntil = calculateTimeUntilExpiry(expiresAt);
  if (!timeUntil) return "No expiry";
  if (timeUntil === "Expired") return "Expired";
  return `Expires in ${timeUntil}`;
}

type SortOption = "name" | "expiry" | "newest";

export default function MyNamesPage() {
  const router = useRouter();
  const { publicKey, connect, isConnecting } = useWallet();
  const [names, setNames] = useState<NameInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name");

  const shortAddress = useMemo(
    () => (publicKey ? `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}` : null),
    [publicKey],
  );

  const fetchNames = useCallback(async () => {
    if (!publicKey) {
      setNames([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await getNamesByOwner(publicKey);
      setNames(response.names);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch names");
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    fetchNames();
  }, [fetchNames]);

  const filteredAndSortedNames = names
    .filter((name) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return name.fqdn.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.fqdn.localeCompare(b.fqdn);
        case "expiry":
          const aExpiry = a.expires_at ? new Date(a.expires_at).getTime() : 0;
          const bExpiry = b.expires_at ? new Date(b.expires_at).getTime() : 0;
          return aExpiry - bExpiry;
        case "newest":
          const aNew = a.expires_at ? new Date(a.expires_at).getTime() : 0;
          const bNew = b.expires_at ? new Date(b.expires_at).getTime() : 0;
          return bNew - aNew;
        default:
          return 0;
      }
    });

  if (!publicKey) {
    return (
      <Container maxWidth="md" sx={{ py: { xs: 6, md: 10 } }}>
        <Card>
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <Typography variant="h4" fontWeight={800} gutterBottom>
              My Names
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Connect your Freighter wallet to view registered names.
            </Typography>
            <Button
              variant="contained"
              sx={{ mt: 3, px: 3 }}
              onClick={connect}
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting…" : "Connect Freighter"}
            </Button>
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 6, md: 8 } }}>
      <Stack spacing={3}>
        <Stack spacing={0.75}>
          <Typography variant="h4" fontWeight={800}>
            My Names
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Connected as {shortAddress ?? publicKey}
          </Typography>
        </Stack>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ xs: "stretch", sm: "center" }}
        >
          <TextField
            fullWidth
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search names..."
            size="small"
          />
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            size="small"
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="name">Sort by Name</MenuItem>
            <MenuItem value="expiry">Sort by Expiry</MenuItem>
            <MenuItem value="newest">Sort by Newest</MenuItem>
          </Select>
          <Button
            variant="outlined"
            onClick={() => fetchNames()}
            disabled={loading}
            sx={{ minWidth: 120 }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </Stack>

        {loading && (
          <Card>
            <CardContent sx={{ textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                Loading your names...
              </Typography>
            </CardContent>
          </Card>
        )}

        {error && (
          <Alert severity="error" variant="outlined">
            {error}
          </Alert>
        )}

        {!loading && !error && filteredAndSortedNames.length === 0 && (
          <Card>
            <CardContent sx={{ textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                {searchQuery
                  ? "No names match your search."
                  : "No names registered to this account."}
              </Typography>
            </CardContent>
          </Card>
        )}

        {!loading && !error && filteredAndSortedNames.length > 0 && (
          <Stack spacing={1.5}>
            {filteredAndSortedNames.map((name) => (
              <Card key={name.namehash}>
                <CardContent>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                  >
                    <Avatar
                      sx={{
                        width: 52,
                        height: 52,
                        background:
                          "linear-gradient(135deg, rgba(124,155,255,0.95), rgba(192,132,252,0.9))",
                        fontWeight: 800,
                        fontSize: 18,
                      }}
                    >
                      {name.fqdn.charAt(0).toUpperCase()}
                    </Avatar>

                    <Box flex={1} minWidth={0}>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        flexWrap="wrap"
                        rowGap={0.5}
                      >
                        <Typography variant="h6" fontWeight={700}>
                          {name.fqdn}
                        </Typography>
                        <Chip
                          label="Owner"
                          color="primary"
                          size="small"
                          variant="outlined"
                          sx={{ fontWeight: 600 }}
                        />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {formatExpiryText(name.expires_at)}
                      </Typography>
                    </Box>

                    <Stack direction="row" spacing={1} width={{ xs: "100%", sm: "auto" }}>
                      <Button
                        variant="outlined"
                        fullWidth
                        onClick={() => router.push(`/name/${encodeURIComponent(name.fqdn)}`)}
                      >
                        Manage
                      </Button>
                      <Button
                        variant="contained"
                        color="secondary"
                        fullWidth
                        onClick={() => router.push(`/name/${encodeURIComponent(name.fqdn)}`)}
                      >
                        Renew
                      </Button>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
