import { config } from "./config";

export interface HealthResponse {
  ok: boolean;
  raw: unknown;
}

export async function getHealth(): Promise<HealthResponse> {
  const url = `${config.indexerUrl}/health`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    return { ok: false, raw: { status: res.status, body: data } };
  }

  return { ok: true, raw: data };
}

export interface ResolveResponse<T = unknown> {
  status: number;
  data: T;
}

export async function resolveName(
  fqdn: string,
): Promise<ResolveResponse> {
  const url = `${config.indexerUrl}/resolve/${encodeURIComponent(fqdn)}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, data };
}

export interface NameInfo {
  fqdn: string;
  owner: string | null;
  resolver: string | null;
  expires_at: string | null;
  namehash: string;
}

export interface NamesByOwnerResponse {
  names: NameInfo[];
}

export async function getNamesByOwner(
  owner: string,
): Promise<NamesByOwnerResponse> {
  const url = `${config.indexerUrl}/names/${encodeURIComponent(owner)}`;
  const res = await fetch(url, { cache: "no-store" });
  
  if (!res.ok) {
    if (res.status === 404) {
      return { names: [] };
    }
    throw new Error(`Failed to fetch names: ${res.statusText}`);
  }

  const data = await res.json() as NamesByOwnerResponse;
  return data;
}
