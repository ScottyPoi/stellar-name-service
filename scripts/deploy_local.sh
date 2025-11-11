#!/usr/bin/env bash
# Automate local sandbox deployment for the registry, resolver, and registrar contracts.
# Usage:
#   ./scripts/deploy_local.sh [--identity alias] [--network sandbox] [--tld stellar] [--admin alias|G...]

set -euo pipefail

IDENTITY="${IDENTITY:-local-user}"
NETWORK="${NETWORK:-sandbox}"
TLD="${TLD:-stellar}"
ADMIN_INPUT="${ADMIN:-}"
SKIP_BUILD=0

usage() {
  cat <<'EOF'
Usage: scripts/deploy_local.sh [options]

Options:
  --identity <alias>   Soroban identity alias to use/create (default: local-user)
  --network <name>     Soroban network profile (default: sandbox)
  --tld <label>        Top-level domain to own (default: stellar)
  --admin <alias|G..>  Admin address or identity alias (default: identity address)
  --skip-build         Skip rebuilding contract WASM artifacts
  -h, --help           Show this help and exit

Environment overrides:
  IDENTITY, NETWORK, TLD, ADMIN behave like the flags above.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --identity)
      IDENTITY="$2"
      shift 2
      ;;
    --network)
      NETWORK="$2"
      shift 2
      ;;
    --tld)
      TLD="$2"
      shift 2
      ;;
    --admin)
      ADMIN_INPUT="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd soroban
require_cmd just
require_cmd xxd
require_cmd tee
require_cmd mktemp

log() {
  echo "$@" >&2
}

ensure_identity() {
  if ! soroban keys ls | grep -qx "$IDENTITY"; then
    echo "Creating identity \"$IDENTITY\"..."
    soroban keys generate "$IDENTITY" >/dev/null
  fi
}

fund_identity() {
  log "Funding identity \"$IDENTITY\" on $NETWORK..."
  soroban keys fund "$IDENTITY" --network "$NETWORK" >/dev/null
}

compute_address() {
  local input="$1"
  if [[ "$input" =~ ^G[A-Z0-9]{55}$ ]]; then
    echo "$input"
    return
  fi
  if soroban keys ls | grep -qx "$input"; then
    soroban keys address "$input"
    return
  fi
  echo "Unable to resolve address for \"$input\". Provide an identity alias or G-address." >&2
  exit 1
}

ensure_network() {
  log "Checking network \"$NETWORK\" health..."
  soroban network health --network "$NETWORK" >/dev/null
}

build_contracts() {
  [[ "$SKIP_BUILD" -eq 1 ]] && return
  log "Building registry..."
  just build-contract registry >/dev/null
  log "Building resolver..."
  just build-contract resolver >/dev/null
  log "Building registrar..."
  just build-contract registrar >/dev/null
}

deploy_contract() {
  local crate="$1"
  local wasm="target/wasm32v1-none/release/${crate}.wasm"
  if [[ ! -f "$wasm" ]]; then
    echo "WASM artifact not found: $wasm" >&2
    exit 1
  fi

  log "Deploying ${crate}..."
  local log
  log=$(mktemp)
  soroban contract deploy \
    --wasm "$wasm" \
    --network "$NETWORK" \
    --source "$IDENTITY" | tee "$log" >&2

  local id
  id=$(grep -E '^[A-Z0-9]{56}$' "$log" | tail -n1 || true)
  rm -f "$log"

  if [[ -z "$id" ]]; then
    echo "Failed to capture contract ID for ${crate}." >&2
    exit 1
  fi
  echo "$id"
}

init_resolver() {
  local resolver_id="$1"
  local registry_id="$2"
  log "Initializing resolver with registry $registry_id..."
  soroban contract invoke \
    --id "$resolver_id" \
    --network "$NETWORK" \
    --source "$IDENTITY" \
    -- \
    init --registry "$registry_id" >/dev/null
}

init_registrar() {
  local registrar_id="$1"
  local registry_id="$2"
  local admin_addr="$3"
  local tld_hex
  tld_hex=$(printf "%s" "$TLD" | xxd -p -c256)
  if [[ -z "$tld_hex" ]]; then
    echo "Failed to encode TLD \"$TLD\"." >&2
    exit 1
  fi

  log "Initializing registrar with registry $registry_id, admin $admin_addr, TLD \"$TLD\"..."
  soroban contract invoke \
    --id "$registrar_id" \
    --network "$NETWORK" \
    --source "$IDENTITY" \
    -- \
    init \
      --registry "$registry_id" \
      --tld "$tld_hex" \
      --admin "$admin_addr" >/dev/null
}

main() {
  ensure_identity
  ensure_network
  fund_identity

  SIGNER_ADDR=$(soroban keys address "$IDENTITY")
  if [[ -z "$ADMIN_INPUT" ]]; then
    ADMIN_ADDR="$SIGNER_ADDR"
  else
    ADMIN_ADDR=$(compute_address "$ADMIN_INPUT")
  fi

  build_contracts

  REGISTRY_ID=$(deploy_contract registry)
  log "  -> Registry ID: $REGISTRY_ID"
  RESOLVER_ID=$(deploy_contract resolver)
  log "  -> Resolver ID: $RESOLVER_ID"
  init_resolver "$RESOLVER_ID" "$REGISTRY_ID"

  REGISTRAR_ID=$(deploy_contract registrar)
  log "  -> Registrar ID: $REGISTRAR_ID"
  init_registrar "$REGISTRAR_ID" "$REGISTRY_ID" "$ADMIN_ADDR"

  cat <<EOF

Deployment complete!
  Registry : $REGISTRY_ID
  Resolver : $RESOLVER_ID
  Registrar: $REGISTRAR_ID
Signer: $SIGNER_ADDR
Admin : $ADMIN_ADDR
EOF
}

main "$@"
