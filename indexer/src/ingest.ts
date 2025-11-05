import { setTimeout as delay } from "node:timers/promises";
import { PoolClient } from "pg";
import { rpc, scValToNative, xdr, Address } from "@stellar/stellar-sdk";
import { getConfig } from "./config.js";
import { getPool, runMigrations, withTransaction } from "./db.js";
import { extractMutations, NormalizedEvent, Mutation } from "./parse.js";
import { logger } from "./utils/logger.js";

type RpcEvent = rpc.Api.EventResponse;
type RpcServer = rpc.Server;

const STREAM_KEY = "rpc:main";
const EVENTS_LIMIT = 50;
const INITIAL_LEDGER_WINDOW = 2000;

export async function startIndexer(): Promise<void> {
  const config = getConfig();

  await runMigrations();

  const allowHttp = config.rpcUrl.startsWith("http://");
  const server = new rpc.Server(config.rpcUrl, { allowHttp });

  logger.info(
    {
      rpcUrl: config.rpcUrl,
      contracts: [config.registryId, config.resolverId],
      network: config.network
    },
    "starting indexer"
  );

  let cursor = await loadCheckpoint(STREAM_KEY);

  while (true) {
    try {
      cursor = await pollOnce(server, cursor);
    } catch (error) {
      logger.error({ err: error }, "event polling failed");
      await delay(5_000);
    }
  }
}

async function pollOnce(
  server: RpcServer,
  cursor: string | null
): Promise<string | null> {
  const config = getConfig();

  const filters: rpc.Api.EventFilter[] = [
    {
      type: "contract",
      contractIds: [config.registryId, config.resolverId]
    }
  ];

  let request: rpc.Api.GetEventsRequest;
  if (cursor) {
    request = {
      filters,
      cursor,
      limit: EVENTS_LIMIT
    };
  } else {
    const startLedger = await inferStartingLedger(server);
    if (typeof startLedger === "number") {
      request = {
        filters,
        startLedger,
        endLedger: startLedger + INITIAL_LEDGER_WINDOW,
        limit: EVENTS_LIMIT
      };
    } else {
      request = {
        filters,
        cursor: "0",
        limit: EVENTS_LIMIT
      };
    }
  }

  const response = await server.getEvents(request);
  const events = response.events ?? [];

  if (events.length === 0) {
    await delay(2_000);
    if (response.cursor) {
      await storeCheckpoint(STREAM_KEY, response.cursor);
      return response.cursor;
    }
    return cursor;
  }

  for (const raw of events) {
    const normalized = normalizeEvent(raw);
    if (!normalized) {
      continue;
    }
    await processNormalizedEvent(normalized);
  }

  if (response.cursor) {
    await storeCheckpoint(STREAM_KEY, response.cursor);
    return response.cursor;
  }

  return cursor;
}

async function inferStartingLedger(
  server: RpcServer
): Promise<number | undefined> {
  try {
    const ledger = await server.getLatestLedger();
    return Math.max(0, ledger.sequence - 200);
  } catch (error) {
    logger.warn({ err: error }, "unable to resolve latest ledger");
    return undefined;
  }
}

function normalizeEvent(raw: RpcEvent): NormalizedEvent | null {
  try {
    const txId = raw.txHash ?? "unknown";
    const eventIndex = extractEventIndex(raw);

    const topics = raw.topic ?? [];
    if (topics.length < 2) {
      logger.warn({ raw }, "discarding event without expected topics");
      return null;
    }
    const eventType = decodeTopicSymbol(topics[0]);
    const namehash = decodeTopicBytes(topics[1]);
    const data = decodeEventData(raw.value);
    const timestamp = parseTimestamp(raw.ledgerClosedAt);
    const contractId = raw.contractId ? raw.contractId.toString() : "unknown";
    const serialized = serializeEvent(raw);

    return {
      contractId,
      txId,
      eventIndex,
      timestamp,
      type: eventType,
      namehash,
      data,
      raw: serialized
    };
  } catch (error) {
    logger.error({ err: error, raw }, "failed to normalize event");
    return null;
  }
}

function extractEventIndex(event: RpcEvent): number {
  const fromId = parseEventId(event.id);
  if (fromId !== null) {
    return fromId;
  }
  if (typeof event.operationIndex === "number") {
    return event.operationIndex;
  }
  return 0;
}

function parseEventId(id?: string): number | null {
  if (!id) {
    return null;
  }
  const parts = id.split("-");
  const last = parts[parts.length - 1];
  const parsed = Number.parseInt(last, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function decodeTopicSymbol(value: xdr.ScVal): string {
  const native = scValToNative(value);
  if (typeof native !== "string") {
    throw new Error("expected symbol topic to decode to string");
  }
  return native;
}

function decodeTopicBytes(value: xdr.ScVal): Buffer {
  const native = scValToNative(value);
  if (native instanceof Buffer) {
    return Buffer.from(native);
  }
  if (native instanceof Uint8Array) {
    return Buffer.from(native);
  }
  if (typeof native === "string") {
    return Buffer.from(native, "utf8");
  }
  throw new Error("unable to decode bytes topic");
}

function decodeEventData(value: xdr.ScVal): Record<string, unknown> {
  const native = scValToNative(value);
  return mapLikeToRecord(native);
}

function mapLikeToRecord(value: unknown): Record<string, unknown> {
  if (value instanceof Map) {
    const record: Record<string, unknown> = {};
    for (const [key, val] of value.entries()) {
      record[normalizeKey(key)] = normalizeValue(val);
    }
    return record;
  }

  if (isPlainObject(value)) {
    const record: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(
      value as Record<string, unknown>
    )) {
      record[key] = normalizeValue(val);
    }
    return record;
  }

  return { value: normalizeValue(value) };
}

function serializeEvent(event: RpcEvent): Record<string, unknown> {
  return {
    id: event.id,
    type: event.type,
    ledger: event.ledger,
    ledgerClosedAt: event.ledgerClosedAt,
    transactionIndex: event.transactionIndex,
    operationIndex: event.operationIndex,
    inSuccessfulContractCall: event.inSuccessfulContractCall,
    txHash: event.txHash,
    contractId: event.contractId ? event.contractId.toString() : null,
    topic: event.topic.map((topic) => toJsonValue(scValToNative(topic))),
    value: toJsonValue(scValToNative(event.value))
  };
}

function toJsonValue(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [key, val] of value.entries()) {
      obj[normalizeKey(key)] = toJsonValue(val);
    }
    return obj;
  }
  if (value instanceof Address) {
    return value.toString();
  }
  if (value instanceof Buffer) {
    return value.toString("hex");
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("hex");
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
  }
  if (isPlainObject(value)) {
    const obj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(
      value as Record<string, unknown>
    )) {
      obj[key] = toJsonValue(val);
    }
    return obj;
  }
  return value;
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Map) {
    return mapLikeToRecord(value);
  }
  if (value instanceof Address) {
    return value.toString();
  }
  if (value instanceof Buffer) {
    return Buffer.from(value);
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
  }
  if (isPlainObject(value)) {
    const record: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(
      value as Record<string, unknown>
    )) {
      record[key] = normalizeValue(val);
    }
    return record;
  }
  return value;
}

function normalizeKey(key: unknown): string {
  if (typeof key === "string") {
    return key;
  }
  if (key instanceof Buffer) {
    return key.toString("hex");
  }
  if (key instanceof Uint8Array) {
    return Buffer.from(key).toString("hex");
  }
  if (key instanceof Address) {
    return key.toString();
  }
  if (typeof key === "object" && key !== null) {
    const maybeString = (key as { toString?: () => string }).toString?.();
    if (maybeString && maybeString !== "[object Object]") {
      return maybeString;
    }
  }
  return JSON.stringify(key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function parseTimestamp(value?: string): number {
  if (!value) {
    return Math.floor(Date.now() / 1000);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    return Math.floor(Date.now() / 1000);
  }
  return Math.floor(ms / 1000);
}

export async function processNormalizedEvent(
  event: NormalizedEvent
): Promise<void> {
  const mutations = extractMutations(event);
  if (mutations.length === 0) {
    logger.debug({ eventType: event.type }, "no mutations extracted");
  }

  await withTransaction(async (client) => {
    const inserted = await client.query(
      `
        INSERT INTO events (tx_id, ev_index, ev_type, payload, ts)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tx_id, ev_index) DO NOTHING
      `,
      [
        event.txId,
        event.eventIndex,
        event.type,
        event.raw ?? {},
        event.timestamp
      ]
    );

    if (inserted.rowCount === 0) {
      logger.debug(
        { txId: event.txId, index: event.eventIndex },
        "event already processed"
      );
      return;
    }

    for (const mutation of mutations) {
      await applyMutation(client, mutation);
    }
  });
}

async function applyMutation(client: PoolClient, mutation: Mutation) {
  switch (mutation.kind) {
    case "ensureName": {
      await ensureName(client, mutation.namehash, mutation.fqdn);
      break;
    }
    case "setResolver": {
      await ensureName(client, mutation.namehash);
      await client.query(
        `UPDATE names SET resolver = $2 WHERE namehash = $1`,
        [mutation.namehash, mutation.resolver]
      );
      break;
    }
    case "setOwner": {
      await ensureName(client, mutation.namehash);
      await client.query(
        `UPDATE names SET owner = $2 WHERE namehash = $1`,
        [mutation.namehash, mutation.owner]
      );
      break;
    }
    case "setExpiry": {
      await ensureName(client, mutation.namehash);
      await client.query(
        `UPDATE names SET expires_at = $2 WHERE namehash = $1`,
        [mutation.namehash, mutation.expiresAt]
      );
      break;
    }
    case "setRecord": {
      await ensureName(client, mutation.namehash);
      await client.query(
        `
          INSERT INTO records (namehash, key, value)
          VALUES ($1, $2, $3)
          ON CONFLICT (namehash, key) DO UPDATE SET value = EXCLUDED.value
        `,
        [mutation.namehash, mutation.key, mutation.value]
      );
      break;
    }
    case "deleteRecord": {
      await client.query(
        `DELETE FROM records WHERE namehash = $1 AND key = $2`,
        [mutation.namehash, mutation.key]
      );
      break;
    }
    default:
      logger.warn({ mutation }, "unsupported mutation");
  }
}

async function ensureName(
  client: PoolClient,
  namehash: Buffer,
  fqdn?: string
): Promise<void> {
  const placeholder = `[unknown::${namehash.toString("hex")}]`;
  await client.query(
    `
      INSERT INTO names (namehash, fqdn)
      VALUES ($1, $2)
      ON CONFLICT (namehash) DO NOTHING
    `,
    [namehash, fqdn ?? placeholder]
  );

  if (fqdn) {
    await client.query(
      `UPDATE names SET fqdn = $2 WHERE namehash = $1`,
      [namehash, fqdn]
    );
  }
}

async function loadCheckpoint(stream: string): Promise<string | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT cursor FROM checkpoints WHERE stream = $1`,
    [stream]
  );
  if (result.rowCount === 0) {
    return null;
  }
  return result.rows[0].cursor as string;
}

async function storeCheckpoint(stream: string, cursor?: string | null) {
  if (!cursor) {
    return;
  }
  const pool = getPool();
  await pool.query(
    `
      INSERT INTO checkpoints (stream, cursor)
      VALUES ($1, $2)
      ON CONFLICT (stream) DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = NOW()
    `,
    [stream, cursor]
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startIndexer().catch((error) => {
    logger.error({ err: error }, "indexer crashed");
    process.exitCode = 1;
  });
}
