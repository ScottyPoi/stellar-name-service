# === Stellar Name Service Automation Commands ===
# Usage:
#   just build        # compile all crates
#   just test         # run tests for all crates
#   just test registry # run only the registry tests
#   just clean        # clean build artifacts
#   just fmt          # format all Rust code
#   just check        # quick compile check (no linking)

set shell := ["bash", "-cu"]

# Default recipe (runs when you just type `just`)
default:
    @echo "Available commands:"
    @echo "  just build        – build all crates"
    @echo "  just test         – run tests for all crates"
    @echo "  just test registry – run only registry tests"
    @echo "  just clean        – clean build artifacts"
    @echo "  just fmt          – format Rust code"
    @echo "  just check        – cargo check for syntax errors"

# --- Build & Test ---

build:
    cargo build --workspace

test:
    cargo test --workspace

# Run tests for a single crate, e.g. `just test registry`
test crate:
    cargo test -p {{crate}}

check:
    cargo check --workspace

fmt:
    cargo fmt --all

clean:
    cargo clean
