import { getConfig } from "./config.js";
import { getPool } from "./db.js";
import { logger } from "./utils/logger.js";

/**
 * Backfill registry_contract_id for existing names by checking the events table.
 * 
 * Alternative approach: Instead of querying the contract on-chain, we check the events
 * table to see which contract ID emitted the "transfer" event for each name. This is
 * more efficient and doesn't require on-chain queries.
 */
export async function backfillRegistryContractIds(): Promise<void> {
  const config = getConfig();
  const pool = getPool();

  logger.info("Starting backfill of registry_contract_id for existing names");

  // Get all names that don't have a registry_contract_id set
  const result = await pool.query(
    `
      SELECT DISTINCT n.namehash, n.fqdn, n.owner
      FROM names n
      WHERE n.registry_contract_id IS NULL
      ORDER BY n.fqdn
    `
  );

  if (result.rowCount === 0) {
    logger.info("No names found without registry_contract_id");
    return;
  }

  logger.info({ count: result.rowCount }, "Found names to backfill");

  let updated = 0;
  let notFound = 0;

  for (const row of result.rows) {
    const namehash = row.namehash as Buffer;
    const fqdn = row.fqdn as string;
    const namehashHex = namehash.toString("hex");

    try {
      // Check the events table to find which contract emitted transfer events for this namehash
      // We'll look for the most recent transfer event from a registry contract
      
      // Query events table for transfer events with this namehash
      // The payload JSONB contains contractId and topic array where topic[1] is the namehash
      const eventResult = await pool.query(
        `
          SELECT DISTINCT 
            (payload->>'contractId')::text as contract_id,
            ev_type,
            ts
          FROM events
          WHERE ev_type = 'transfer'
            AND payload->'topic'->1 IS NOT NULL
            AND (payload->'topic'->>1) = $1
            AND (payload->>'contractId')::text IN ($2, $3, $4)
          ORDER BY ts DESC
          LIMIT 1
        `,
        [namehashHex, config.registryId, config.resolverId, config.registrarId]
      );

      if (eventResult.rowCount && eventResult.rowCount > 0) {
        const contractId = eventResult.rows[0].contract_id as string;
        
        // If the transfer event came from the current registry, update it
        if (contractId === config.registryId) {
          await pool.query(
            `UPDATE names SET registry_contract_id = $1 WHERE namehash = $2`,
            [config.registryId, namehash]
          );
          updated++;
          logger.debug({ fqdn, namehash: namehashHex }, "Updated registry_contract_id from events");
        } else {
          // Transfer event came from a different contract (old deployment)
          notFound++;
          logger.debug(
            { fqdn, namehash: namehashHex, contractId },
            "Name belongs to different contract (old deployment)"
          );
        }
      } else {
        // No transfer events found - might be from before we started tracking contract IDs
        // Try checking if there are any events at all for this namehash from current registry
        const anyEventResult = await pool.query(
          `
            SELECT (payload->>'contractId')::text as contract_id
            FROM events
            WHERE payload->'topic'->1 IS NOT NULL
              AND (payload->'topic'->>1) = $1
              AND (payload->>'contractId')::text = $2
            LIMIT 1
          `,
          [namehashHex, config.registryId]
        );

        if (anyEventResult.rowCount && anyEventResult.rowCount > 0) {
          // Found events from current registry, update it
          await pool.query(
            `UPDATE names SET registry_contract_id = $1 WHERE namehash = $2`,
            [config.registryId, namehash]
          );
          updated++;
          logger.debug({ fqdn, namehash: namehashHex }, "Updated registry_contract_id from any events");
        } else {
          notFound++;
          logger.debug({ fqdn, namehash: namehashHex }, "No events found for name");
        }
      }
    } catch (error: any) {
      notFound++;
      logger.debug(
        { fqdn, namehash: namehashHex, error: error?.message },
        "Error checking events for name"
      );
    }
  }

  logger.info(
    { updated, notFound, total: result.rowCount },
    "Backfill completed"
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  backfillRegistryContractIds()
    .then(() => {
      logger.info("Backfill script completed");
      return getPool().end();
    })
    .catch((err) => {
      logger.error({ err }, "Backfill script failed");
      process.exitCode = 1;
    });
}

