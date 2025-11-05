import Fastify from "fastify";
import fastifyEtag from "@fastify/etag";
import { getConfig } from "./config.js";
import { runMigrations } from "./db.js";
import { startIndexer } from "./ingest.js";
import { registerResolveRoutes } from "./routes/resolve.js";
import { logger } from "./utils/logger.js";

export async function createServer() {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ ok: true }));

  await app.register(fastifyEtag);
  await registerResolveRoutes(app);

  return app;
}

export async function startServer(): Promise<void> {
  const config = getConfig();
  await runMigrations();

  if (process.env.DISABLE_INGEST !== "1") {
    void startIndexer().catch((error) => {
      logger.error({ err: error }, "indexer worker crashed");
      process.exitCode = 1;
    });
  } else {
    logger.info("ingest worker disabled via env");
  }

  const app = await createServer();
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    logger.info({ port: config.port }, "server started");
  } catch (error) {
    logger.error({ err: error }, "failed to start server");
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    logger.error({ err: error }, "server failed");
    process.exit(1);
  });
}
