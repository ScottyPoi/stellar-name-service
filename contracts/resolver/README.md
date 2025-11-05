## Resolver Contract

This crate implements the resolver component of the Stellar Name Service (SNS).  
The resolver sits behind the Registry contract and is responsible for storing and returning records keyed by the ENS-style `namehash`.

### Overview

- Stores a single Registry contract address on first initialization.
- Maintains per-namehash address records and arbitrary “text records”.
- Authorizes writes by querying the Registry for current ownership.
- Emits typed events so observers can track record changes.

The contract is written with Soroban SDK `v23` and is meant to compile to WASM as well as run under the SDK test utilities.

---

### Public Interface

| Function | Description |
| --- | --- |
| `init(env, registry)` | One-time initializer that stores the backing Registry contract. Subsequent calls abort with `AlreadyInitialized`. |
| `registry(env)` | Returns the configured Registry address, or aborts with `NotInitialized` if `init` has not run. |
| `addr(env, namehash)` | Returns `Some(Address)` when an address record exists, otherwise `None`. Requires prior `init`. |
| `set_addr(env, caller, namehash, addr)` | Persists an address record for `namehash` and emits an `EvtAddressChanged` event. Requires `caller.require_auth()` and ownership validation. |
| `text(env, namehash, key)` | Returns `Some(Bytes)` if the text record exists. Key must be non-empty and ≤256 bytes. |
| `set_text(env, caller, namehash, key, value)` | Persists a text record, enforcing key validation and ownership, then emits `EvtTextChanged`. |

All mutating functions take an explicit `caller: Address` so the host environment can enforce authentication before the contract verifies ownership.

---

### Storage Layout

Persistent keys are derived from static byte prefixes:

| Key | Value | Notes |
| --- | --- | --- |
| `RES_REG` | `Address` | Registry contract singleton. |
| `RES_ADDR || namehash` | `Address` | Address record for the `namehash`. |
| `RES_TEXT || namehash || key` | `Bytes` | Arbitrary text record. |

The helper functions in `lib.rs` build `Bytes` keys consistently to avoid collisions.

---

### Event Stream

Events are declared with `#[contractevent]` and publish via `.publish(&env)`:

```rust
EvtAddressChanged { namehash, addr }
EvtTextChanged { namehash, key }
```

Both include the static topic (`address_changed` or `text_changed`) plus the `namehash` as a topic so they can be indexed. The event payload is a `Map` of named fields.

---

### Error Surface

`ResolverError` is exported and used with `panic_with_error!` so callers receive deterministic error codes:

| Variant | When it occurs |
| --- | --- |
| `NotInitialized` | Any read/write prior to `init`. |
| `AlreadyInitialized` | Second call to `init`. |
| `NotOwner` | Owner validation against the Registry fails. |
| `InvalidInput` | Text key is empty or longer than 256 bytes. |

---

### Ownership Enforcement

1. Every setter begins with `caller.require_auth()`.
2. The resolver loads the Registry address from storage.
3. It performs a cross-contract call to `registry.owner(namehash)`.
4. The call must return the same `caller` address; otherwise the contract aborts with `NotOwner`.

This pattern ensures the resolver inherits whatever ownership semantics the Registry enforces.

---

### Testing Notes

Unit tests live alongside the contract under `#[cfg(test)]`. They:

- Provide a lightweight `MockRegistry` contract that returns preset owners.
- Cover initialization, read defaults, success paths, authorization failures, validation errors, data isolation, and ownership changes.
- Inspect events via `env.events().all()` to assert emitted topics and payloads.

Run the suite with:

```bash
cargo fmt --all
cargo test -p resolver
```

Tests rely on `soroban-sdk`’s `testutils` feature being enabled in `Cargo.toml`.

---

### For AI Assistants

- Maintain the existing public API signature to preserve contract clients.
- Use the provided storage key helpers to avoid namespace mismatches.
- Never bypass `caller.require_auth()` or the Registry owner check on mutating functions.
- Text keys must respect the non-empty and 256-byte limits; this is asserted in tests.
- Prefer `contractevent`-based publishing for new events to stay aligned with SDK best practices.

By following these guidelines, automated changes will remain compatible with both the Soroban host and downstream tooling.
