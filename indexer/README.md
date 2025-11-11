# Stellar Name Service — Indexer

Event-driven indexer + HTTP API for the Stellar Name Service.  
Subscribes to Registry/Resolver Soroban contracts, persists state in Postgres, and exposes a simple resolution endpoint.

---

## Requirements

- Node.js 20+
- Postgres 14+ (tested against 16)
- Access to a Soroban RPC endpoint (sandbox by default)

---

## Setup

1. Copy `.env.example` → `.env` and adjust as needed:

   ```bash
   cp .env.example .env
   ```

   | Variable       | Default                                      | Notes                                      |
   | -------------- | -------------------------------------------- | ------------------------------------------ |
   | `RPC_URL`      | `http://localhost:8000/soroban/rpc`          | Sandbox Soroban RPC                        |
   | `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/stellar_ns` | Postgres connection string                 |
   | `REGISTRY_ID`  | _(required)_                                 | Registry contract ID (`0x...` or StrKey)   |
   | `RESOLVER_ID`  | _(required)_                                 | Resolver contract ID                       |
   | `REGISTRAR_ID` | _(required)_                                 | Registrar contract ID (commit/register)    |
   | `PORT`         | `8787`                                       | HTTP server port                           |
   | `NETWORK`      | `sandbox`                                    | `sandbox` or `testnet`                     |

2. Start Postgres locally (example via Docker):

   ```bash
   docker run --rm -it \
     -e POSTGRES_PASSWORD=postgres \
     -p 5432:5432 \
     postgres:16
   ```

3. Install dependencies & run migrations:

   ```bash
   pnpm install
   pnpm migrate
   ```

---

## Development

```bash
pnpm dev       # Fastify + ingestion in watch mode
pnpm build     # Type-check + emit to dist/
pnpm start     # Run compiled server (uses .env via --env-file)
```

- `GET /health` → `{ "ok": true }`
- `GET /resolve/:name` → `{ address, records, namehash }`
  - `records` map keys are hex-encoded record keys.
  - `address` resolves to the `addr` record when present.
  - Responses include `Cache-Control: public, max-age=5` for lightweight caching.

Set `DISABLE_INGEST=1` to run the API without the background worker (useful in tests).

---

## Testing

```bash
pnpm test
```

Tests expect a Postgres instance reachable via `DATABASE_URL`.  
They cover schema migration, synthetic event ingestion, idempotency, and 404 handling.

---

## Sandbox vs Testnet

The indexer defaults to the sandbox RPC and the contract IDs in `.env.example`.  
To point at Testnet:

1. Deploy (or obtain) Registry/Resolver contracts on testnet.
2. Update `.env`:

   ```env
   NETWORK=testnet
   RPC_URL=https://soroban-testnet.stellar.org
   REGISTRY_ID=...
   RESOLVER_ID=...
   ```

3. Restart the indexer (`pnpm dev` or `pnpm start`).

---

## Operational Notes

- Events are stored in the `events` table (unique on `tx_id` + `ev_index`) for auditing and replay safety.
- A `checkpoints` table tracks the latest Soroban cursor; ingestion resumes from where it left off.
- `namehash` values are stored as raw 32-byte buffers. The current `fqdnToNamehash` helper mirrors the on-chain hashing logic so lookups use the same derivation.
- Text record updates require fetching the latest value; `text_changed` events expect the worker to populate the payload before persisting.
