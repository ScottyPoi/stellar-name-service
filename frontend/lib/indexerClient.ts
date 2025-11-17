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
