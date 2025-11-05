import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { Pool, PoolClient } from "pg";
import { getConfig } from "./config.js";
import { logger } from "./utils/logger.js";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const config = getConfig();
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000
    });

    pool.on("error", (err) => {
      logger.error({ err }, "unexpected pg pool error");
    });
  }

  return pool;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function runMigrations(): Promise<void> {
  const config = getConfig();
  logger.info({ databaseUrl: config.databaseUrl }, "applying schema");
  const schemaPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "schema.sql"
  );
  const sql = await readFile(schemaPath, "utf8");

  await withTransaction(async (client) => {
    await client.query(sql);
  });

  logger.info("schema ready");
}

if (process.argv.includes("--migrate")) {
  runMigrations()
    .then(() => {
      logger.info("migration completed");
      return getPool().end();
    })
    .catch((err) => {
      logger.error({ err }, "migration failed");
      process.exitCode = 1;
    });
}
