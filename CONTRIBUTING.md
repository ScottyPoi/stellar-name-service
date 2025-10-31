# Contributing

## Branch & Commit
- Feature branches; small PRs; descriptive titles.
- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.

## Testing
- Contracts: `cargo test -p registry` / `-p resolver`.
- Indexer: unit + integration (DB container).
- Frontend: unit for utils + basic e2e for flows.

## Reviews
- Keep ABI/event changes backward-compatible when possible.
- Include migration notes for any storage/schema changes.
