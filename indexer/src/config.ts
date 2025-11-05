import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const configSchema = z.object({
  rpcUrl: z
    .string()
    .url()
    .default("http://localhost:8000/soroban/rpc"),
  databaseUrl: z.string().min(1, "DATABASE_URL is required"),
  registryId: z.string().min(1, "REGISTRY_ID is required"),
  resolverId: z.string().min(1, "RESOLVER_ID is required"),
  port: z
    .string()
    .default("8787")
    .transform((value) => {
      const parsed = Number.parseInt(value, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error(`Invalid PORT value "${value}"`);
      }
      return parsed;
    }),
  network: z.enum(["sandbox", "testnet"]).default("sandbox")
});

export type Config = z.infer<typeof configSchema>;

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const parsed = configSchema.parse({
    rpcUrl: process.env.RPC_URL ?? undefined,
    databaseUrl: process.env.DATABASE_URL,
    registryId: process.env.REGISTRY_ID,
    resolverId: process.env.RESOLVER_ID,
    port: process.env.PORT ?? undefined,
    network: process.env.NETWORK ?? undefined
  });

  cachedConfig = parsed;
  return parsed;
}
