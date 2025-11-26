"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StrKey } from "@stellar/stellar-sdk";
import { Box, Container, Paper, Stack, Typography } from "@mui/material";
import {
  getHealth,
  resolveName,
  getNamesByOwner,
  type HealthResponse,
  type NameInfo,
} from "@/lib/indexerClient";
import { SearchBox } from "@/components/resolver/SearchBox";
import { StatusBanner } from "@/components/resolver/StatusBanner";
import { ResultCard } from "@/components/resolver/ResultCard";

type ResolverState = "idle" | "loading" | "success" | "not_found" | "error";

const STELLAR_SUFFIX = ".stellar";
const STELLAR_SUFFIX_REGEX = /\.stellar$/i;

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [resolverStatus, setResolverStatus] = useState<ResolverState>("idle");
  const [resolverMessage, setResolverMessage] = useState<string | null>(null);
  const [resolvedData, setResolvedData] = useState<Record<string, unknown> | null>(
    null,
  );
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [addressQuery, setAddressQuery] = useState("");
  const [addressSearchLoading, setAddressSearchLoading] = useState(false);
  const [addressSearchResults, setAddressSearchResults] = useState<NameInfo[]>([]);
  const [addressSearchError, setAddressSearchError] = useState<string | null>(null);
  const [addressValidationError, setAddressValidationError] = useState<string | null>(null);
  const [namesRefreshToken, setNamesRefreshToken] = useState(0);
  const router = useRouter();
  const searchParams = useSearchParams();
  const resultRef = useRef<HTMLDivElement>(null);
  const prefetchedNameRef = useRef<string | null>(null);

  useEffect(() => {
    let isActive = true;
    async function fetchHealth() {
      try {
        const response = await getHealth();
        if (!isActive) {
          return;
        }
        setHealth(response);
      } catch (error) {
        if (!isActive) {
          return;
        }
        setHealthError(
          error instanceof Error ? error.message : "Unable to reach the Indexer.",
        );
      } finally {
        if (isActive) {
          setHealthLoading(false);
        }
      }
    }
    fetchHealth();
    return () => {
      isActive = false;
    };
  }, []);

  const toNormalizedFqdn = useCallback(
    (value: string) => {
      const trimmed = value.trim().toLowerCase();
      if (!trimmed) {
        return "";
      }
      return trimmed.endsWith(STELLAR_SUFFIX)
        ? trimmed
        : `${trimmed}${STELLAR_SUFFIX}`;
    },
    [],
  );

  const toInputValue = useCallback((value: string) => {
    return value.toLowerCase().replace(STELLAR_SUFFIX_REGEX, "");
  }, []);

  const lookupName = useCallback(
    async (rawName?: string, options?: { updateUrl?: boolean }) => {
      const normalized = toNormalizedFqdn(rawName ?? query);
      if (!normalized) {
        return;
      }
      prefetchedNameRef.current = normalized;
      setQuery(toInputValue(normalized));

      if (options?.updateUrl !== false) {
        const currentParams = new URLSearchParams(
          searchParams ? searchParams.toString() : "",
        );
        currentParams.set("name", normalized);
        const nextPath = currentParams.toString()
          ? `/?${currentParams.toString()}`
          : "/";
        router.replace(nextPath, { scroll: false });
      }

      setResolverStatus("loading");
      setResolverMessage(null);
      setResolvedData(null);
      setResolvedName(normalized);

      try {
        const response = await resolveName(normalized);
        if (response.status === 200) {
          setResolverStatus("success");
          setResolvedData({
            fqdn: normalized,
            ...(response.data as Record<string, unknown>),
          });
          setResolverMessage("Name resolved successfully.");
          requestAnimationFrame(() => {
            resultRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          });
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
    },
    [query, router, searchParams, toInputValue, toNormalizedFqdn],
  );

  useEffect(() => {
    const paramName = searchParams?.get("name") ?? "";
    if (!paramName) {
      return;
    }
    if (prefetchedNameRef.current === paramName) {
      return;
    }
    prefetchedNameRef.current = paramName;
    setQuery(toInputValue(paramName));
    lookupName(paramName, { updateUrl: false });
  }, [lookupName, searchParams, toInputValue]);

  const validateStellarAddress = useCallback((address: string): string | null => {
    const trimmed = address.trim();
    if (!trimmed) {
      return null; // Empty is allowed (will be handled by disabled button)
    }
    if (!StrKey.isValidEd25519PublicKey(trimmed)) {
      return "Invalid Stellar address format. Address must start with 'G' and be 56 characters long.";
    }
    return null;
  }, []);

  const searchByAddress = useCallback(async (address: string) => {
    const trimmed = address.trim();
    if (!trimmed) {
      setAddressSearchResults([]);
      setAddressSearchError(null);
      setAddressValidationError(null);
      return;
    }

    // Validate address format before making API call
    const validationError = validateStellarAddress(trimmed);
    if (validationError) {
      setAddressValidationError(validationError);
      setAddressSearchError(null);
      setAddressSearchResults([]);
      return;
    }

    setAddressValidationError(null);
    setAddressSearchLoading(true);
    setAddressSearchError(null);
    setAddressSearchResults([]);

    try {
      const response = await getNamesByOwner(trimmed);
      setAddressSearchResults(response.names);
      setAddressSearchLoading(false);
    } catch (error) {
      setAddressSearchError(
        error instanceof Error ? error.message : "Failed to search names"
      );
      setAddressSearchLoading(false);
    }
  }, [validateStellarAddress]);

  function renderResolverStatus() {
    if (resolverStatus === "loading") {
      return (
        <StatusBanner
          tone="warning"
          title="Resolving name…"
          message="Contacting the Indexer for the latest records."
        />
      );
    }

    if (resolverStatus === "success") {
      return (
        <StatusBanner
          tone="success"
          title="Name resolved!"
          message={resolverMessage ?? "Name data is up to date."}
        />
      );
    }

    if (resolverStatus === "not_found") {
      return (
        <StatusBanner
          tone="error"
          title="Name not found"
          message={resolverMessage ?? "Try a different .stellar name."}
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

    return (
      <p className="text-sm text-slate-500">
        Enter a .stellar name to view its owner, resolver, and records.
      </p>
    );
  }

  function renderHealthStatus() {
    if (healthLoading) {
      return (
        <StatusBanner
          tone="warning"
          title="Checking Indexer…"
          message="Ensuring the resolver is reachable."
        />
      );
    }
    if (healthError) {
      return (
        <StatusBanner
          tone="error"
          title="Indexer unreachable"
          message={healthError}
        />
      );
    }
    if (health?.ok) {
      return (
        <StatusBanner
          tone="success"
          title="Indexer online"
          message="Ready to resolve names."
        />
      );
    }
    return (
      <StatusBanner
        tone="error"
        title="Indexer reported an error"
        message="Resolve requests may be degraded."
      />
    );
  }

  return (
    <Container
      maxWidth="lg"
      sx={{
        minHeight: "calc(100vh - 180px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        py: { xs: 6, md: 10 },
        gap: 6,
      }}
    >
      <Stack spacing={4} alignItems="center">
        <Stack spacing={2} alignItems="center" textAlign="center" maxWidth={840}>
          <Typography
            variant="h2"
            sx={{
              fontWeight: 800,
              background:
                "linear-gradient(120deg, #7c9bff 0%, #c084fc 60%, #f472b6 100%)",
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}
          >
            Your Stellar username
          </Typography>
        </Stack>

        <Box width="100%" maxWidth={760}>
          <SearchBox
            value={query}
            loading={resolverStatus === "loading"}
            onChange={setQuery}
            onSubmit={() => {
              const normalized = toNormalizedFqdn(query);
              if (normalized) {
                router.push(`/name/${normalized}`);
              }
            }}
            suffix={STELLAR_SUFFIX}
            placeholder="Search for a name"
            size="lg"
          />
        </Box>

        <Box width="100%" maxWidth={760}>
          {renderHealthStatus()}
        </Box>
      </Stack>

      {resolverStatus !== "idle" && (
        <Stack
          spacing={2.5}
          ref={resultRef}
          sx={{ width: "100%", maxWidth: 1000, mx: "auto", pb: 6 }}
        >
          {renderResolverStatus()}
          {resolverStatus === "success" && resolvedName && resolvedData ? (
            <ResultCard fqdn={resolvedName} data={resolvedData} />
          ) : null}
        </Stack>
      )}
    </Container>
  );
}
