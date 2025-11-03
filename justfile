# === Stellar Name Service Automation Commands ===
# Usage:
#   just build                  # compile all crates
#   just test                   # run tests for all crates
#   just build-contract registry # build registry Wasm
#   just deploy registry         # deploy registry to sandbox/testnet
#   just invoke registry version # invoke contract function
#   just clean                   # clean build artifacts
#   just fmt                     # format all Rust code
#   just check                   # quick compile check

set shell := ["bash", "-cu"]

# Default recipe
default:
    @echo "Available commands:"
    @echo "  just build                    – build all crates"
    @echo "  just test                     – run tests for all crates"
    @echo "  just test registry             – run only registry tests"
    @echo "  just build-contract registry   – build Wasm for contract"
    @echo "  just deploy registry           – deploy to sandbox/testnet"
    @echo "  just invoke registry version   – call contract function"
    @echo "  just clean                     – remove build artifacts"
    @echo "  just fmt                       – format Rust code"
    @echo "  just check                     – syntax check only"

# --- Cargo build/test ---
build:
    cargo build --workspace

test *args:
	if [ "{{args}}" = "" ]; then cargo test --workspace; else cargo test -p {{args}}; fi

# Run tests for a single crate
test-crate crate:
    cargo test -p {{crate}}

check:
    cargo check --workspace

fmt:
    cargo fmt --all

clean:
    cargo clean

# --- Soroban CLI commands ---
# You can use `--network sandbox` (local) or `--network testnet`
# Modify NETWORK variable below if you want a default.
NETWORK := "sandbox"
SOURCE_ACCOUNT ?= ""

# Build contract to Wasm (output to target/wasm32v1-none/release/)
build-contract crate:
    cd contracts/{{crate}} && soroban contract build

# Deploy contract (returns contract ID)
deploy crate:
    if [ -n "{{SOURCE_ACCOUNT}}" ]; then \
        source_arg="--source-account {{SOURCE_ACCOUNT}}"; \
    else \
        source_arg=""; \
    fi; \
    soroban contract deploy \
        --wasm target/wasm32v1-none/release/{{crate}}.wasm \
        --network {{NETWORK}} \
        ${source_arg}

# Invoke a method (example: just invoke registry version)
invoke crate method filter='':
    if [ -z "${CONTRACT_ID:-}" ]; then \
        echo "Set CONTRACT_ID to the deployed {{crate}} contract id before invoking."; \
        exit 1; \
    fi; \
    if [ -n "{{filter}}" ]; then \
        filter_arg="{{filter}}"; \
    else \
        filter_arg="--filter-logs ${SOROBAN_FILTER_LOGS:-warn}"; \
    fi; \
    soroban contract invoke \
        ${filter_arg} \
        --id ${CONTRACT_ID} \
        --network {{NETWORK}} \
        -- \
        {{method}}

# Shortcut to reset local sandbox (optional)
sandbox-reset:
    soroban network clean sandbox
