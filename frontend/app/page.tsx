"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getHealth,
  resolveName,
  type HealthResponse,
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

      <div className="space-y-6">
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
