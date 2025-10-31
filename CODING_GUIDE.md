# Coding Guide

## Contracts (Rust / Soroban)
- Use `soroban-sdk` latest stable; pin exact versions in Cargo.toml.
- Keep public interfaces small; prefer getters/setters + events.
- Storage keys: prefix by module (e.g., `b"REG_OWNER"`, `b"RES_TXT"`).
- Emit events for: ownership, resolver updates, registrations, renewals, addr/text changes.
- Unit tests: cover happy path + auth failures + edge cases.

## Hashing & Names
- `labelhash = sha256(label)`.
- `namehash(parent, label) = sha256(parent || labelhash)`. Root = 32 zero bytes.
- Validate labels (length, allowed chars); reject empty labels.

## Indexer
- Postgres schema: `names`, `records`, `events`.
- Idempotent ingestion using `tx_id + event_index`.
- Provide `GET /resolve/:name` with caching (ETag/Cache-Control).

## Frontend (React + TS)
- Minimal deps; Freighter for signing; `stellar-sdk` for RPC/Horizon calls.
- Hooks: `useFreighter()`, `useResolve(name)`, `useRegister()`.
- Good UX for commit–reveal timing and error states.
