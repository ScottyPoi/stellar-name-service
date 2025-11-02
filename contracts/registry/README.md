# Stellar Name Service Registry

The Registry contract is the authoritative source of ownership, resolver routing, and expiration data for the Stellar Name Service. Each entry is keyed by a 32-byte `namehash` derived from the hierarchical labels of a name.

## Features

- **Ownership tracking** – stores the account or contract address that currently controls a name. Zero-address owners are rejected.
- **Resolver pointer** – records the contract responsible for resolving addresses and records. Zero-address resolvers are rejected.
- **Expiration policy** – maintains an `expires_at` timestamp in seconds; renewals extend the lifetime by a fixed interval.
- **Strict authorization** – every mutating method requires the current owner (or the initial registrant) to authorize the call.
- **Event emission** – emits `transfer`, `resolver_changed`, and `renew` events so off-chain observers can index state transitions.

## Storage Layout

Persistent storage is partitioned by the `DataKey` enum:

| Key                     | Value type | Description                          |
|-------------------------|------------|--------------------------------------|
| `Owner(BytesN<32>)`     | `Address`  | Current owner for the `namehash`.    |
| `Resolver(BytesN<32>)`  | `Address`  | Resolver contract for the `namehash`.|
| `Expires(BytesN<32>)`   | `u64`      | UNIX timestamp for expiry.           |

Separate namespaces ensure that writes to one field do not collide with others. Unknown `namehash` values return `None` internally and cause the public getters to panic.

## Contract API

| Function | Description | Auth requirements | Errors / Panics |
|----------|-------------|-------------------|-----------------|
| `version() -> u32` | Returns the contract version (currently `1`). | None | – |
| `set_owner(namehash, new_owner)` | Registers or transfers ownership. Emits `transfer`. | Current owner for existing records, or `new_owner` for first assignment. | Panics if `new_owner` is the zero strkey. |
| `owner(namehash) -> Address` | Reads the owner. | None | Panics if unset. |
| `transfer(namehash, to)` | Convenience method that calls `set_owner`. | Current owner. | Panics if owner unset. |
| `set_resolver(namehash, resolver)` | Sets the resolver address. Emits `resolver_changed`. | Current owner. | Panics if owner unset or resolver is zero address. |
| `resolver(namehash) -> Address` | Reads the resolver. | None | Panics if unset. |
| `renew(namehash)` | Extends `expires_at` by the fixed interval (one year). Emits `renew`. | Current owner. | Panics if owner unset or expiry overflows `u64`. |
| `expires(namehash) -> u64` | Reads the expiry timestamp. | None | Panics if unset. |
| `namehash(labels: Vec<Bytes>) -> BytesN<32>` | Computes the hierarchical namehash helper used in tests. | None | Panics on empty labels or labels longer than 63 bytes. |

### Authorization model

- Initial registration: the first call to `set_owner` must be authorized by the address being set as owner.
- Subsequent mutations (`set_owner`, `transfer`, `set_resolver`, `renew`) require authorization from the currently stored owner.
- Tests rely on Soroban’s `mock_all_auths` helper; production usage must provide real signatures.

## Events

| Event | Topics | Payload fields | Trigger |
|-------|--------|----------------|---------|
| `transfer` | `["transfer", namehash]` | `{ from: Address, to: Address }` | After ownership is created or transferred. |
| `resolver_changed` | `["resolver_changed", namehash]` | `{ resolver: Address }` | After the resolver pointer changes. |
| `renew` | `["renew", namehash]` | `{ expires_at: u64 }` | After a successful renewal. |

Tests verify that emitted events match the live storage state to guard regressions in serialization.

## Renewal Policy

- Renewal interval: `31_536_000` seconds (365 days).
- The new expiry is `max(current_expiry, ledger_timestamp) + interval`.
- Renewal panics on arithmetic overflow, preventing the timestamp from wrapping near `u64::MAX`.

## Testing

Run the full registry test suite from the repository root:

```bash
just test registry
```

The suite covers:

- Namehash helper behavior and error cases.
- Ownership lifecycle, transfers, and cross-name isolation.
- Resolver pointer updates, authorization, and event payload validation.
- Renewal semantics before and after expiry, access control, and event payload validation.
- Storage layout sanity checks and negative cases (unknown namehashes, zero-address guards).

Test snapshots under `contracts/registry/test_snapshots/` capture Soroban environment state for debugging and regression tracking.

## Development Notes

- The `FLAGS` namespace is reserved for future use but currently unused.
- Contract code panics on authorization failures and invalid inputs, mirroring Soroban’s expectation that callers sign transactions correctly.
- Additional policies (e.g., registrar overrides, grace periods) can be layered on top of the current primitives without altering storage keys.
