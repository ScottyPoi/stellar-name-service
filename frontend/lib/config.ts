export interface AppConfig {
  indexerUrl: string;
  registryId: string;
  resolverId: string;
  registrarId: string;
  rpcUrl: string;
  network: "sandbox" | "testnet" | string;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    return `Missing required env var: ${name}`
    // throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config: AppConfig = {
  indexerUrl: requiredEnv("NEXT_PUBLIC_INDEXER_URL"),
  registryId: requiredEnv("NEXT_PUBLIC_REGISTRY_ID"),
  resolverId: requiredEnv("NEXT_PUBLIC_RESOLVER_ID"),
  registrarId: requiredEnv("NEXT_PUBLIC_REGISTRAR_ID"),
  rpcUrl: requiredEnv("NEXT_PUBLIC_RPC_URL"),
  network: process.env.NEXT_PUBLIC_NETWORK ?? "sandbox",
};
