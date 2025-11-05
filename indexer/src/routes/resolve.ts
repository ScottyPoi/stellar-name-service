import { FastifyInstance } from "fastify";
import { getPool } from "../db.js";
import {
  fqdnToNamehash,
  normalizeFqdn,
  validateFqdn
} from "../utils/name.js";
import { logger } from "../utils/logger.js";

const ADDR_KEY_HEX = Buffer.from("addr", "utf8").toString("hex");

type ResolveResponse = {
  address: string | null;
  records: Record<string, string>;
  namehash: string;
};

export async function registerResolveRoutes(app: FastifyInstance) {
  app.get<{ Params: { name: string } }>(
    "/resolve/:name",
    async (request, reply): Promise<ResolveResponse | void> => {
      const fqdn = request.params.name;
      try {
        validateFqdn(fqdn);
      } catch (error) {
        reply.code(400);
        return reply.send({
          error: "invalid_name",
          message: (error as Error).message
        });
      }

      const normalized = normalizeFqdn(fqdn);
      const namehashBuffer = fqdnToNamehash(normalized);
      const namehashHex = namehashBuffer.toString("hex");

      const pool = getPool();
      const nameResult = await pool.query(
        `
          SELECT fqdn, owner, resolver, expires_at
          FROM names
          WHERE namehash = $1
        `,
        [namehashBuffer]
      );

      if (nameResult.rowCount === 0) {
        reply.code(404);
        return reply.send({ error: "not_found" });
      }

      const recordsResult = await pool.query(
        `
          SELECT key, value
          FROM records
          WHERE namehash = $1
        `,
        [namehashBuffer]
      );

      const records: Record<string, string> = {};

      for (const row of recordsResult.rows) {
        const keyHex = Buffer.from(row.key).toString("hex");
        const valueBuffer = Buffer.from(row.value);
        records[keyHex] = valueBuffer.toString("utf8");
      }

      const address = records[ADDR_KEY_HEX] ?? nameResult.rows[0].owner ?? null;

      reply.header("Cache-Control", "public, max-age=5");

      const response: ResolveResponse = {
        address,
        records,
        namehash: namehashHex
      };

      return response;
    }
  );
}
