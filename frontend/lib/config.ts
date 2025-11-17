export interface AppConfig {
  indexerUrl: string;
  registryId: string;
  resolverId: string;
  registrarId: string;
  rpcUrl: string;
  network: "sandbox" | "testnet" | string;
}

function requirePublicEnv(
  value: string | undefined,
  name: string,
): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config: AppConfig = {
  indexerUrl: requirePublicEnv(
    process.env.NEXT_PUBLIC_INDEXER_URL,
    "NEXT_PUBLIC_INDEXER_URL",
  ),
  registryId: requirePublicEnv(
    process.env.NEXT_PUBLIC_REGISTRY_ID,
    "NEXT_PUBLIC_REGISTRY_ID",
  ),
  resolverId: requirePublicEnv(
    process.env.NEXT_PUBLIC_RESOLVER_ID,
    "NEXT_PUBLIC_RESOLVER_ID",
  ),
  registrarId: requirePublicEnv(
    process.env.NEXT_PUBLIC_REGISTRAR_ID,
    "NEXT_PUBLIC_REGISTRAR_ID",
  ),
  rpcUrl: requirePublicEnv(
    process.env.NEXT_PUBLIC_RPC_URL,
    "NEXT_PUBLIC_RPC_URL",
  ),
  network: process.env.NEXT_PUBLIC_NETWORK ?? "sandbox",
};
