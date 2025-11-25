"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StrKey } from "@stellar/stellar-sdk";
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
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";

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

  const healthPayload =
    health?.raw ??
    (healthError
      ? { error: healthError }
      : { status: healthLoading ? "checking" : "unavailable" });

  return (
    <section className="space-y-10 pb-16">
      <div className="space-y-2 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
          Stellar Name Service
        </p>
        <h1 className="text-3xl font-semibold text-white sm:text-4xl">
          Look up any .stellar name
        </h1>
        <p className="text-base text-slate-300">
          Quickly resolve owners, resolvers, and linked records directly from the
          Indexer.
        </p>
      </div>
      <div className="space-y-4">
        <ConnectWalletButton />
      </div>
      
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h2 className="text-xl font-semibold text-white">Search by Address</h2>
          <p className="text-sm text-slate-400">
            Find all names registered to a specific Stellar address
          </p>
        </div>
        
        <form
          onSubmit={(e) => {
            e.preventDefault();
            searchByAddress(addressQuery);
          }}
          className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-900/40 p-6 shadow-inner"
        >
          <label
            htmlFor="address"
            className="text-sm font-medium uppercase tracking-wide text-slate-400"
          >
            Stellar Address
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <input
                id="address"
                type="text"
                value={addressQuery}
                onChange={(e) => {
                  const value = e.target.value;
                  setAddressQuery(value);
                  const trimmed = value.trim();
                  
                  // Clear error if input becomes valid
                  if (trimmed && StrKey.isValidEd25519PublicKey(trimmed)) {
                    setAddressValidationError(null);
                    return;
                  }
                  
                  // Show early feedback for obvious errors (not just incomplete)
                  if (trimmed.length >= 2 && !trimmed.startsWith("G")) {
                    setAddressValidationError("Stellar address must start with 'G'");
                  } else if (trimmed.length > 56) {
                    setAddressValidationError("Stellar address must be 56 characters long");
                  } else if (addressValidationError && trimmed.length < 56) {
                    // Clear error if user is still typing (address might be incomplete)
                    setAddressValidationError(null);
                  }
                }}
                onBlur={(e) => {
                  // Validate on blur to show error if user leaves invalid input
                  const trimmed = e.target.value.trim();
                  if (trimmed) {
                    const error = validateStellarAddress(trimmed);
                    setAddressValidationError(error);
                  } else {
                    setAddressValidationError(null);
                  }
                }}
                placeholder="G..."
                className={`w-full rounded-xl border bg-slate-950/80 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                  addressValidationError
                    ? "border-red-500 focus:border-red-500 focus:ring-red-500/40"
                    : "border-slate-700/70 focus:border-sky-500 focus:ring-sky-500/40"
                }`}
              />
              {addressValidationError && (
                <p className="mt-1 text-sm text-red-400">{addressValidationError}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={
                addressSearchLoading ||
                !addressQuery.trim() ||
                !!addressValidationError ||
                !StrKey.isValidEd25519PublicKey(addressQuery.trim())
              }
              className="rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white shadow transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              {addressSearchLoading ? "Searching..." : "Search"}
            </button>
          </div>
        </form>

        {addressSearchError && (
          <div className="rounded-xl border border-red-800/60 bg-red-900/20 p-4">
            <p className="text-sm text-red-400">{addressSearchError}</p>
          </div>
        )}

        {addressSearchResults.length > 0 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-6 shadow-inner">
              <h3 className="text-lg font-semibold text-white mb-4">
                Names Registered to {addressQuery}
              </h3>
              <div className="space-y-2">
                {addressSearchResults.map((name) => (
                  <div
                    key={name.namehash}
                    className="p-4 bg-slate-950/80 rounded-xl border border-slate-700/70"
                  >
                    <div className="font-semibold text-white text-base">
                      {name.fqdn}
                    </div>
                    {name.expires_at && (
                      <div className="text-sm text-slate-400 mt-1">
                        Expires: {new Date(name.expires_at).toLocaleDateString()}
                      </div>
                    )}
                    {name.resolver && (
                      <div className="text-xs text-slate-500 mt-1 font-mono">
                        Resolver: {name.resolver}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!addressSearchLoading && addressQuery.trim() && addressSearchResults.length === 0 && !addressSearchError && (
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
            <p className="text-sm text-slate-400">
              No names found for address {addressQuery}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h2 className="text-xl font-semibold text-white">Resolve Name</h2>
          <p className="text-sm text-slate-400">
            Look up a .stellar name to view its details
          </p>
        </div>
        
        <SearchBox
          value={query}
          loading={resolverStatus === "loading"}
          onChange={setQuery}
          onSubmit={() => lookupName()}
          suffix={STELLAR_SUFFIX}
        />

        <div ref={resultRef} className="space-y-4">
          {renderResolverStatus()}
          {resolverStatus === "success" && resolvedName && resolvedData ? (
            <ResultCard fqdn={resolvedName} data={resolvedData} />
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800/70 bg-slate-900/40 p-6 shadow-inner">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-200">
              Indexer health
            </p>
            <p className="text-xs text-slate-500">
              Keeps the UI in sync with on-chain data.
            </p>
          </div>
        </div>
        <div className="mt-4">{renderHealthStatus()}</div>
        <pre className="mt-4 max-h-64 overflow-auto rounded-xl bg-slate-950/80 p-4 text-xs text-slate-200">
          {JSON.stringify(healthPayload, null, 2)}
        </pre>
      </div>
    </section>
  );
}
