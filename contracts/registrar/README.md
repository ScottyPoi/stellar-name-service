## Registrar Contract

The Registrar manages the `.stellar` namespace within the Stellar Name Service (SNS).  
It controls first-time registrations, renewals, and availability checks while delegating
ownership/expiry storage to the Registry contract and—optionally—setting a Resolver.

### Overview

- Owns the `.stellar` TLD and issues second-level labels via commit–reveal.
- Prevents front-running by requiring callers to pre-commit salted intents.
- Tracks configurable policy parameters (label lengths, commit age window, renewal period, grace).
- Communicates with Registry using Soroban cross-contract calls.
- Emits typed events for commitment, registration, and renewal actions.

---

### Public Interface

| Function | Description |
| --- | --- |
| `init(env, registry, tld, admin)` | One-time setup that records the Registry address, fixed TLD (e.g., `"stellar"`), default parameters, and admin. Re-invocation aborts with `AlreadyInitialized`. |
| `commit(env, caller, commitment, label_len)` | Stores a SHA-256 commitment (`sha256(label || owner || secret)`) with the current ledger timestamp. Rejects duplicates via `CommitmentExists`. |
| `register(env, caller, label, owner, secret, resolver)` | Verifies commitment age, checks availability, writes owner/expiry through Registry, optionally sets Resolver, emits `EvtNameRegistered`, and returns the namehash. |
| `renew(env, caller, label)` | Validates ownership via Registry, calls `registry.renew`, and emits `EvtNameRenewed`. Extends expiry by the configured renewal extension. |
| `available(env, label)` | Returns `true` if the label is unused or expired past the grace period; otherwise `false`. |
| `set_params(env, caller, params)` | Admin-only method to tune min/max label length, commit window, renewal extension, and grace period. |
| `params(env)` | Returns the active `RegistrarParams`. |
| `registry(env)` | Returns the stored Registry contract address (ensuring the contract is initialized). |

All mutating methods take a `caller: Address` so the host can enforce `require_auth()` before the Registrar validates business logic.

---

### Storage Layout

Persistent data is pooled under byte prefixes:

| Key | Value | Notes |
| --- | --- | --- |
| `REG_ADDR` | `Address` | Registry contract singleton. |
| `REG_TLD` | `Bytes` | Static TLD (e.g., `"stellar"`). |
| `REG_PARM` | `RegistrarParams` | Policy struct. |
| `REG_ADMN` | `Address` | Admin allowed to call `set_params`. |
| `REG_COMM || commitment` | `CommitmentInfo` | Struct with `timestamp: u64` and `label_len: u32` for pending commitments. |

Helper functions in `lib.rs` centralize reading and writing these keys to avoid typos.

---

### Events

All events use `#[contractevent]` for stable topics:

```rust
EvtCommitMade { commitment, at, label_len }
EvtNameRegistered { namehash, owner, expires_at }
EvtNameRenewed { namehash, expires_at }
```

Listeners can index `commitment` or `namehash` to detect state transitions.

---

### Error Surface

`RegistrarError` is exported for deterministic error handling:

| Variant | Meaning |
| --- | --- |
| `AlreadyInitialized` | `init` was invoked more than once. |
| `NotInitialized` | Any call requiring setup before `init`. |
| `NotAdmin` | `set_params` caller differs from stored admin. |
| `NotOwner` | Renew attempted by someone other than the Registry owner. |
| `InvalidLabel` | Empty/too short/too long labels. |
| `CommitmentExists` | A commitment hash already exists in storage. |
| `CommitmentMissing` | No matching commitment found in storage. |
| `CommitmentTooFresh` | Commitment exists but is not old enough to use. |
| `CommitmentTooOld` | Commitment exists but is past the allowed age window. |
| `NameNotAvailable` | Registering a label that is still registered or within its grace period. |
| `InvalidParams` | Supplied registrar parameters violate the allowed bounds. |

Use `panic_with_error!(env, RegistrarError::...)` for consistent host-side behavior.

---

### Commit–Reveal Flow

1. **Commit:** Caller computes `sha256(label || owner || secret)` off-chain and stores it via `commit`.  
2. **Wait:** Ledger time must advance at least `commit_min_age_secs` but not exceed `commit_max_age_secs`.  
3. **Register:** Caller reveals `label`, `owner`, and `secret`. The Registrar recomputes the hash, validates availability, writes to Registry, optionally sets a Resolver, renews to `now + renew_extension_secs`, and deletes the commitment.

`available(label)` considers both current ownership and whether the grace period has elapsed after expiry.

---

### Testing Notes

Unit tests live alongside the contract and rely on `soroban-sdk`’s `testutils` feature. They provide a mock Registry to mimic owner/expiry behavior and cover:

- Single-use `init`.
- Commit–reveal success and failure windows.
- Availability transitions before/after expiry and grace.
- Resolver wiring on first registration.
- Renewals extending expiries and enforcing ownership.
- Input validation (label length, duplicate commitments).

Run locally with:

```bash
cargo fmt --all
cargo test -p registrar
```

---

### Guidance for AI Contributors

- Preserve the public API: function names and signatures are consumed by downstream clients.
- Do not bypass `caller.require_auth()` or Registry ownership checks on mutating calls.
- Use the existing helpers (`compute_commitment`, `compute_namehash`, storage writers) to keep hashing and key layout consistent.
- Clean up commitments after use to prevent replay.
- Emit the provided events whenever the associated state changes so indexers remain in sync.

Following these conventions keeps automated changes compatible with live deployments and the rest of the SNS stack.
