"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import { resolveName, type NameInfo } from "@/lib/indexerClient";
import { useWallet } from "@/components/wallet/WalletProvider";
import { StatusBanner } from "@/components/resolver/StatusBanner";
import { ResultCard } from "@/components/resolver/ResultCard";
import { NameCard } from "@/components/wallet/NameCard";
import { RegisterNameCard } from "@/components/wallet/RegisterNameCard";

type ResolverState = "idle" | "loading" | "success" | "not_found" | "error";

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function calculateTimeUntilExpiry(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diff = expiry.getTime() - now.getTime();
  
  if (diff < 0) return "Expired";
  
  const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30));
  const days = Math.floor((diff % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));
  
  if (months > 0) {
    return `Expires in ${months} ${months === 1 ? "month" : "months"}`;
  }
  return `Expires in ${days} ${days === 1 ? "day" : "days"}`;
}

export default function NameDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { publicKey } = useWallet();
  const fqdn = decodeURIComponent(params.fqdn as string);
  
  const [resolverStatus, setResolverStatus] = useState<ResolverState>("loading");
  const [resolverMessage, setResolverMessage] = useState<string | null>(null);
  const [resolvedData, setResolvedData] = useState<Record<string, unknown> | null>(null);
  const [nameInfo, setNameInfo] = useState<NameInfo | null>(null);

  const lookupName = useCallback(async () => {
    if (!fqdn) return;

    setResolverStatus("loading");
    setResolverMessage(null);
    setResolvedData(null);

    try {
      const response = await resolveName(fqdn);
      if (response.status === 200) {
        setResolverStatus("success");
        const data = {
          fqdn,
          ...(response.data as Record<string, unknown>),
        };
        setResolvedData(data);
        
        // Convert to NameInfo format for NameCard
        setNameInfo({
          fqdn,
          namehash: data.namehash as string,
          owner: data.owner as string,
          resolver: data.resolver as string,
          expires_at: data.expires_at as string,
        });
        setResolverMessage("Name resolved successfully.");
      } else if (response.status === 404) {
        setResolverStatus("not_found");
        setResolverMessage("Name not found in the registry.");
      } else {
        setResolverStatus("error");
        setResolverMessage(`Unexpected response (${response.status}).`);
      }
    } catch (error) {
      setResolverStatus("error");
      setResolverMessage(
        error instanceof Error
          ? error.message
          : "Unable to resolve the requested name.",
      );
    }
  }, [fqdn]);

  useEffect(() => {
    lookupName();
  }, [lookupName]);

  const owner = resolvedData?.owner as string | undefined;
  const isOwnedByUser = publicKey && owner && owner === publicKey;
  const isAvailable = resolverStatus === "not_found";
  const isOwnedByOther = resolverStatus === "success" && owner && !isOwnedByUser;
  const suggestedLabel =
    fqdn?.toLowerCase().endsWith(".stellar") ? fqdn.split(".")[0] : fqdn;

  function renderStatusBanner() {
    if (resolverStatus === "loading") {
      return (
        <StatusBanner
          tone="warning"
          title="Resolving name…"
          message="Contacting the Indexer for the latest records."
        />
      );
    }

    if (isAvailable) {
      return (
        <StatusBanner
          tone="success"
          title="Available"
          message="This name is available for registration."
        />
      );
    }

    if (isOwnedByUser) {
      return (
        <StatusBanner
          tone="success"
          title="Owned by you"
          message="You can manage this name below."
        />
      );
    }

    if (isOwnedByOther) {
      return (
        <StatusBanner
          tone="warning"
          title="Registered to someone else"
          message={`Owner: ${owner?.slice(0, 6)}...${owner?.slice(-4)}`}
        />
      );
    }

    if (resolverStatus === "error") {
      return (
        <StatusBanner
          tone="error"
          title="Unable to resolve name"
          message={resolverMessage ?? "An unexpected error occurred."}
        />
      );
    }

    return null;
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 6, md: 8 } }}>
      <Stack spacing={3}>
        <Stack spacing={1.5}>
          <Button
            onClick={() => router.push("/")}
            color="inherit"
            sx={{ width: "fit-content", px: 0 }}
            startIcon={
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            }
          >
            Back to search
          </Button>
          <Typography variant="h3" fontWeight={800}>
            {fqdn}
          </Typography>
          {renderStatusBanner()}
        </Stack>

        {isAvailable && (
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={700}>
              Register this name
            </Typography>
            <RegisterNameCard
              initialLabel={suggestedLabel ?? ""}
              onRegistered={() => {
                lookupName();
              }}
            />
          </Stack>
        )}

        {resolverStatus === "success" && resolvedData && (
          <Stack spacing={3}>
            <Grid container spacing={2.5}>
              {owner && (
                <Grid item xs={12} sm={6} md={4}>
                  <InfoCard
                    title="Owner"
                    value={owner}
                    helper={
                      isOwnedByUser ? "You control this name" : "Connected owner on-chain"
                    }
                  />
                </Grid>
              )}
              {resolvedData.resolver && (
                <Grid item xs={12} sm={6} md={4}>
                  <InfoCard title="Resolver" value={resolvedData.resolver as string} />
                </Grid>
              )}
              {resolvedData.expires_at && (
                <Grid item xs={12} sm={6} md={4}>
                  <InfoCard
                    title="Expiry"
                    value={formatDate(resolvedData.expires_at as string) ?? "—"}
                    helper={calculateTimeUntilExpiry(resolvedData.expires_at as string)}
                  />
                </Grid>
              )}
            </Grid>

            {resolvedData.records &&
              typeof resolvedData.records === "object" &&
              Object.keys(resolvedData.records as Record<string, string>).length > 0 && (
                <Card>
                  <CardContent>
                    <Typography variant="h6" fontWeight={700} gutterBottom>
                      Records
                    </Typography>
                    <Stack spacing={1.25}>
                      {Object.entries(resolvedData.records as Record<string, string>).map(
                        ([key, value]) => (
                          <Box
                            key={key}
                            sx={{
                              px: 1.5,
                              py: 1,
                              borderRadius: 1.5,
                              border: "1px solid rgba(255,255,255,0.08)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 2,
                              bgcolor: "rgba(255,255,255,0.03)",
                            }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontFamily: "monospace" }}
                            >
                              {key}
                            </Typography>
                            <Typography
                              variant="body2"
                              color="text.primary"
                              sx={{ textAlign: "right", wordBreak: "break-word" }}
                            >
                              {value}
                            </Typography>
                          </Box>
                        ),
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              )}

            {isOwnedByUser && nameInfo && (
              <Stack spacing={1.5}>
                <Typography variant="h6" fontWeight={700}>
                  Manage
                </Typography>
                <NameCard name={nameInfo} onRenewed={lookupName} />
              </Stack>
            )}
          </Stack>
        )}

        {resolverStatus === "success" && resolvedData && (
          <>
            <Divider sx={{ my: 2 }} />
            <ResultCard fqdn={fqdn} data={resolvedData} />
          </>
        )}
      </Stack>
    </Container>
  );
}

function InfoCard({
  title,
  value,
  helper,
}: {
  title: string;
  value: string;
  helper?: string | null;
}) {
  return (
    <Card>
      <CardContent>
        <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 0.5 }}>
          {title}
        </Typography>
        <Typography
          variant="body1"
          color="text.primary"
          sx={{ fontFamily: "monospace", wordBreak: "break-word", mt: 0.5 }}
        >
          {value}
        </Typography>
        {helper ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {helper}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}


