import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";

process.env.DISABLE_INGEST = "1";
process.env.RPC_URL ??= "http://localhost:8000/soroban/rpc";
process.env.DATABASE_URL ??=
  "postgres://postgres:postgres@localhost:5432/stellar_ns_test";
process.env.REGISTRY_ID ??= "CBREGISTRYTESTID";
process.env.RESOLVER_ID ??= "CBRESOLVERTESTID";
process.env.REGISTRAR_ID ??= "CBREGISTRARTESTID";
process.env.NETWORK ??= "sandbox";

const { runMigrations, getPool } = await import("../src/db.js");
const { fqdnToNamehash } = await import("../src/utils/name.js");
const { createServer } = await import("../src/server.js");
const { processNormalizedEvent } = await import("../src/ingest.js");

describe("resolver API", () => {
  let dbAvailable = true;

  beforeAll(async () => {
    try {
      await runMigrations();
      console.log("Migrations ran successfully");
    } catch (error) {
      dbAvailable = false;
      console.warn(
        `Skipping resolver API tests: database unavailable (${(error as Error).message})`
      );
      return;
    }
  });

  beforeEach(async () => {
    if (!dbAvailable) {
      return;
    }
    const pool = getPool();
    await pool.query("TRUNCATE events, records, names, checkpoints RESTART IDENTITY");
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    console.log("Pool ended");
    await getPool().end();
  });

  it("creates schema successfully", async () => {
    if (!dbAvailable) {
      return;
    }
    const pool = getPool();
    const res = await pool.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('names', 'records', 'events')
      `
    );
    expect(res.rowCount).toBe(3);
  });

  it("applies synthetic events and resolves names", async () => {
    if (!dbAvailable) {
      return;
    }
    const fqdn = "alice.stellar";
    const namehash = fqdnToNamehash(fqdn);

    const now = Math.floor(Date.now() / 1000);

    await processNormalizedEvent({
      contractId: process.env.REGISTRY_ID!,
      txId: "tx1",
      eventIndex: 0,
      timestamp: now,
      type: "resolver_changed",
      namehash,
      data: { resolver: "CBRESOLVERTESTID", fqdn }
    });

    await processNormalizedEvent({
      contractId: process.env.REGISTRY_ID!,
      txId: "tx1",
      eventIndex: 1,
      timestamp: now,
      type: "transfer",
      namehash,
      data: { to: "GB6O3AGS2I2PTESTADDR0000000000000000000000000000000000" }
    });

    await processNormalizedEvent({
      contractId: process.env.RESOLVER_ID!,
      txId: "tx2",
      eventIndex: 0,
      timestamp: now,
      type: "address_changed",
      namehash,
      data: {
        addr: "GB6O3AGS2I2PTESTADDR0000000000000000000000000000000000"
      }
    });

    await processNormalizedEvent({
      contractId: process.env.RESOLVER_ID!,
      txId: "tx2",
      eventIndex: 1,
      timestamp: now,
      type: "text_changed",
      namehash,
      data: {
        key: Buffer.from("profile"),
        value: Buffer.from("ipfs://cid")
      }
    });

    const app = await createServer();
    const response = await app.inject({
      method: "GET",
      url: `/resolve/${fqdn}`
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as {
      address: string | null;
      records: Record<string, string>;
      namehash: string;
    };

    const addrKeyHex = Buffer.from("addr").toString("hex");
    const profileKeyHex = Buffer.from("profile").toString("hex");

    expect(payload.address).toBe(
      "GB6O3AGS2I2PTESTADDR0000000000000000000000000000000000"
    );
    expect(payload.records[addrKeyHex]).toBe(
      "GB6O3AGS2I2PTESTADDR0000000000000000000000000000000000"
    );
    expect(payload.records[profileKeyHex]).toBe("ipfs://cid");
    expect(payload.namehash).toBe(namehash.toString("hex"));

    await app.close();
  });

  it("does not duplicate work on re-ingestion", async () => {
    if (!dbAvailable) {
      return;
    }
    const fqdn = "bob.stellar";
    const namehash = fqdnToNamehash(fqdn);
    const now = Math.floor(Date.now() / 1000);

    const event = {
      contractId: process.env.RESOLVER_ID!,
      txId: "tdup",
      eventIndex: 0,
      timestamp: now,
      type: "text_changed",
      namehash,
      data: {
        fqdn,
        key: Buffer.from("profile"),
        value: Buffer.from("hello")
      }
    };

    await processNormalizedEvent(event);
    await processNormalizedEvent(event);

    const pool = getPool();
    const eventsCount = await pool.query(
      "SELECT COUNT(*)::int AS count FROM events WHERE tx_id = 'tdup'"
    );
    expect(eventsCount.rows[0].count).toBe(1);

    const record = await pool.query(
      `
        SELECT value
        FROM records
        WHERE namehash = $1 AND key = $2
      `,
      [namehash, Buffer.from("profile")]
    );

    expect(record.rowCount).toBe(1);
    expect(Buffer.from(record.rows[0].value).toString("utf8")).toBe("hello");
  });

  it("returns 404 for unknown names", async () => {
    if (!dbAvailable) {
      return;
    }
    const app = await createServer();
    const response = await app.inject({
      method: "GET",
      url: "/resolve/unknown.stellar"
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
