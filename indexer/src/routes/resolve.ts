import { FastifyInstance } from "fastify";
import { getPool } from "../db.js";
import { getConfig } from "../config.js";
import {
  fqdnToNamehash,
  normalizeFqdn,
  validateFqdn
} from "../utils/name.js";

const ADDR_KEY_HEX = Buffer.from("addr", "utf8").toString("hex");

type ResolveResponse = {
  address: string | null;
  records: Record<string, string>;
  owner: string | null;
  resolver: string | null;
  expires_at: string | null;
  fqdn: string;
  namehash: string;
};

type NamesByOwnerResponse = {
  names: Array<{
    fqdn: string;
    owner: string | null;
    resolver: string | null;
    expires_at: string | null;
    namehash: string;
  }>;
};

export async function registerResolveRoutes(app: FastifyInstance) {
  app.get<{ Params: { owner: string } }>(
    "/names/:owner",
    async (request, reply): Promise<NamesByOwnerResponse | void> => {
      const owner = request.params.owner;
      if (!owner || owner.trim().length === 0) {
        reply.code(400);
        return reply.send({
          error: "invalid_owner",
          message: "Owner address is required"
        });
      }

      const config = getConfig();
      const pool = getPool();
      const nameResult = await pool.query(
        `
          SELECT fqdn, owner, resolver, expires_at, namehash
          FROM names
          WHERE owner = $1 AND registry_contract_id = $2
          ORDER BY fqdn ASC
        `,
        [owner.trim(), config.registryId]
      );

      const names = nameResult.rows.map((row) => {
        const expiresRaw = row.expires_at;
        const expiresSeconds =
          expiresRaw === null
            ? null
            : Number.parseInt(expiresRaw.toString(), 10);
        const expiresIso =
          expiresSeconds === null || Number.isNaN(expiresSeconds)
            ? null
            : new Date(expiresSeconds * 1000).toISOString();

        const namehashBuffer = row.namehash as Buffer;
        const namehashHex = namehashBuffer.toString("hex");

        return {
          fqdn: row.fqdn,
          owner: row.owner,
          resolver: row.resolver,
          expires_at: expiresIso,
          namehash: namehashHex,
        };
      });

      reply.header("Cache-Control", "public, max-age=5");

      return { names };
    }
  );

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

      const config = getConfig();
      const pool = getPool();
      const nameResult = await pool.query(
        `
          SELECT fqdn, owner, resolver, expires_at
          FROM names
          WHERE namehash = $1 AND registry_contract_id = $2
        `,
        [namehashBuffer, config.registryId]
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

      const nameRow = nameResult.rows[0] as {
        fqdn: string;
        owner: string | null;
        resolver: string | null;
        expires_at: string | number | null;
      };

      const expiresRaw = nameRow.expires_at;
      const expiresSeconds =
        expiresRaw === null
          ? null
          : Number.parseInt(expiresRaw.toString(), 10);
      const expiresIso =
        expiresSeconds === null || Number.isNaN(expiresSeconds)
          ? null
          : new Date(expiresSeconds * 1000).toISOString();

      const address = records[ADDR_KEY_HEX] ?? nameResult.rows[0].owner ?? null;

      reply.header("Cache-Control", "public, max-age=5");

      const response: ResolveResponse = {
        address,
        records,
        owner: nameRow.owner ?? null,
        resolver: nameRow.resolver ?? null,
        expires_at: expiresIso,
        fqdn: nameRow.fqdn ?? normalized,
        namehash: namehashHex
      };

      return response;
    }
  );
}
