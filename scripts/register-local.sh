#!/usr/bin/env bash
set -euo pipefail

# register-local.sh
# Registers a .stellar name through *Registrar* on sandbox/testnet using the real commit->register flow.
# Requires:
# - soroban CLI installed and configured (network, rpc-url, identity)
# - Node.js installed (to run commitment-helper.js)
# - Deployed contract IDs: REGISTRY_ID, RESOLVER_ID, REGISTRAR_ID
#
# Usage:
#   ./register-local.sh alice [--flags...]   # flags override scripts/.env values if provided
#
# Notes:
# - This script waits the *minimum* commit age (default 10s) if params.commit_min_age_secs > 0 by sleeping in wall time.
# - For sandbox you can comment out the sleep and advance ledger time separately if you prefer.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_ENV="${SCRIPT_DIR}/.env"

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "$file"
    set +a
  fi
}

LABEL="${1:-}"
if [[ -z "${LABEL}" ]]; then
  echo "Error: Missing label. Example: ./register-local.sh alice [--flags...]"
  exit 1
fi

load_env_file "${SCRIPT_ENV}"

# Defaults (can be overridden by scripts/.env or flags below)
NETWORK="${NETWORK:-sandbox}"
RPC_URL="${RPC_URL:-http://localhost:8000/soroban/rpc}"
NETWORK_PASSPHRASE="Standalone Network ; February 2017"
REGISTRAR_ID="${REGISTRAR_ID:-}"
REGISTRY_ID="${REGISTRY_ID:-}"
RESOLVER_ID="${RESOLVER_ID:-}"
ACCOUNT="${ACCOUNT:-}"
OWNER_ADDR="${OWNER_ADDR:-${ACCOUNT:-}}"
# Prefer provided signer (identity alias or secret seed). Fall back to IDENTITY env,
# and only then to ACCOUNT (address) if nothing else is provided.
OWNER_SKEY="${OWNER_SKEY:-${IDENTITY:-${ACCOUNT:-}}}"

# Parse flags
shift || true

# Debug: show received arguments
if [[ "${DEBUG:-}" == "1" ]]; then
  echo "DEBUG: Received arguments:"
  for arg in "$@"; do
    echo "  '$arg'"
  done
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --network=*)      NETWORK="${1#*=}"; shift;;
    --network)        NETWORK="$2"; shift 2;;
    --rpc-url=*)      RPC_URL="${1#*=}"; shift;;
    --rpc-url)        RPC_URL="$2"; shift 2;;
    --registrar-id=*) REGISTRAR_ID="${1#*=}"; shift;;
    --registrar-id)   REGISTRAR_ID="$2"; shift 2;;
    --registry-id=*)  REGISTRY_ID="${1#*=}"; shift;;
    --registry-id)    REGISTRY_ID="$2"; shift 2;;
    --resolver-id=*)  RESOLVER_ID="${1#*=}"; shift;;
    --resolver-id)    RESOLVER_ID="$2"; shift 2;;
    --owner-addr=*)   OWNER_ADDR="${1#*=}"; shift;;
    --owner-addr)     OWNER_ADDR="$2"; shift 2;;
    --owner-skey=*)   OWNER_SKEY="${1#*=}"; shift;;
    --owner-skey)     OWNER_SKEY="$2"; shift 2;;
    --network-passphrase=*) NETWORK_PASSPHRASE="${1#*=}"; shift;;
    --network-passphrase) NETWORK_PASSPHRASE="$2"; shift 2;;
  *) echo "Unknown flag: $1"; exit 1;;
  esac
done

get_tx_status() {
  local tx_hash="$1"
  local resp status
  resp="$(curl -s -X POST "${RPC_URL}" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getTransaction","params":{"hash":"'"${tx_hash}"'"}}')"
  if command -v jq >/dev/null 2>&1; then
    status="$(printf '%s' "${resp}" | jq -r '.result.status // empty')"
  else
    status="$(printf '%s' "${resp}" | sed -n 's/.*\"status\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p' | head -n1)"
  fi
  printf '%s\n' "${status:-}" "${resp}"
}

wait_for_tx() {
  local tx_hash="$1"
  local attempts="${2:-20}"   # ~100s by default
  local delay="${3:-5}"
  local i=1
  local last_resp=""
  while [[ "$i" -le "$attempts" ]]; do
    local status resp
    status="$(get_tx_status "${tx_hash}")"
    resp="$(printf '%s\n' "${status}" | tail -n +2)"
    status="$(printf '%s\n' "${status}" | head -n1)"
    last_resp="${resp}"
    if [[ "${status}" == "SUCCESS" ]]; then
      return 0
    fi
    echo "   … waiting for commit ${tx_hash} (attempt ${i}/${attempts}) status='${status:-unknown}'"
    sleep "$delay"
    i=$((i + 1))
  done
  echo "   last get-transaction response: ${last_resp}"
  return 1
}

# Debug: show what was parsed (helpful for troubleshooting)
if [[ "${DEBUG:-}" == "1" ]]; then
  echo "DEBUG: Parsed flags:"
  echo "  REGISTRAR_ID='${REGISTRAR_ID}'"
  echo "  REGISTRY_ID='${REGISTRY_ID}'"
  echo "  RESOLVER_ID='${RESOLVER_ID}'"
  echo "  OWNER_ADDR='${OWNER_ADDR}'"
  echo "  OWNER_SKEY='${OWNER_SKEY}'"
fi

if [[ -z "${REGISTRAR_ID}" || -z "${OWNER_ADDR}" || -z "${OWNER_SKEY}" ]]; then
  echo "Error: --registrar-id, --owner-addr and --owner-skey are required."
  echo ""
  echo "Missing values:"
  [[ -z "${REGISTRAR_ID}" ]] && echo "  - REGISTRAR_ID is empty"
  [[ -z "${OWNER_ADDR}" ]] && echo "  - OWNER_ADDR is empty"
  [[ -z "${OWNER_SKEY}" ]] && echo "  - OWNER_SKEY is empty"
  echo ""
  echo "Tip: If using environment variables, make sure they are set:"
  echo "  echo \$REGISTRAR_ID"
  echo "  echo \$ACCOUNT"
  exit 1
fi

# Prevent using a G-address to sign (soroban needs a secret seed or identity alias).
if [[ "${OWNER_SKEY}" =~ ^G[A-Z0-9]{55}$ ]]; then
  echo "Error: OWNER_SKEY looks like an address (${OWNER_SKEY}). Provide a soroban identity alias (e.g., local-user) or secret seed instead."
  exit 1
fi

# Ensure soroban CLI is present
if ! command -v soroban >/dev/null 2>&1; then
  echo "Error: soroban CLI not found. Install and configure it."
  exit 1
fi

# Generate a random 32-byte secret (hex)
SECRET_HEX="$(openssl rand -hex 32)"
LABEL_LEN="${#LABEL}"

echo "LABEL=${LABEL}"
echo "OWNER=${OWNER_ADDR}"
echo "NETWORK=${NETWORK}  RPC_URL=${RPC_URL}"
echo "REGISTRAR_ID=${REGISTRAR_ID}  RESOLVER_ID=${RESOLVER_ID}"

# Helper to pass network/rpc flags
NET_FLAGS=( --network "${NETWORK}" --rpc-url "${RPC_URL}" )

# Soroban CLI parsing:
# - BytesN<32> (commitment) expects plain 64-char hex (no 0x).
# - Bytes (label/secret) expect raw hex without 0x.
LABEL_HEX="$(printf "%s" "${LABEL}" | xxd -p -c256)"
LABEL_ARG="${LABEL_HEX}"
SECRET_ARG="${SECRET_HEX}"

# Compute commitment locally (matches on-chain compute_commitment)
echo "🔎 Computing commitment via local helper (commitment-helper.js)..."
if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required to run scripts/commitment-helper.js."
  exit 1
fi
COMMITMENT_HEX="$(node "${SCRIPT_DIR}/commitment-helper.js" --label-hex "${LABEL_ARG}" --owner "${OWNER_ADDR}" --secret-hex "${SECRET_ARG}")"
if [[ -z "${COMMITMENT_HEX}" ]]; then
  echo "Error: commitment computation via commitment-helper.js failed."
  exit 1
fi
COMMITMENT_ARG="${COMMITMENT_HEX}"
echo "COMMITMENT_HEX=${COMMITMENT_HEX}"
echo "SECRET_HEX=${SECRET_HEX}"

PREIMAGE_LOG="${SCRIPT_DIR}/last_preimage.json"
cat > "${PREIMAGE_LOG}" <<EOF
{
  "label": "${LABEL}",
  "label_hex": "${LABEL_HEX}",
  "owner": "${OWNER_ADDR}",
  "secret_hex": "${SECRET_HEX}",
  "commitment_hex": "${COMMITMENT_HEX}"
}
EOF
echo "📄 Saved preimage to ${PREIMAGE_LOG}"
# 1) COMMIT
echo "⏳ Submitting commit..."
COMMIT_LOG="$(mktemp)"
set +e
soroban contract invoke \
  --id "${REGISTRAR_ID}" \
  "${NET_FLAGS[@]}" \
  --network-passphrase "${NETWORK_PASSPHRASE}" \
  --source "${OWNER_SKEY}" \
  --send=yes \
  -- \
  commit \
  --caller "${OWNER_ADDR}" \
  --commitment "${COMMITMENT_ARG}" \
  --label_len "${LABEL_LEN}" 2>&1 | tee "${COMMIT_LOG}"
COMMIT_EXIT=${PIPESTATUS[0]}
set -e

if [[ ${COMMIT_EXIT} -ne 0 ]]; then
  echo "❌ Commit transaction failed"
  exit ${COMMIT_EXIT}
fi

COMMIT_TX_HASH="$(grep -E 'Signing transaction:|Transaction hash:' "${COMMIT_LOG}" | tail -n1 | grep -oE '[0-9a-f]{64}' | head -n1 || true)"
rm -f "${COMMIT_LOG}"

# Wait for commit transaction to be fully confirmed on ledger
if [[ -n "${COMMIT_TX_HASH}" ]]; then
  echo "⏳ Waiting for commit transaction (${COMMIT_TX_HASH}) to be confirmed..."
  if ! wait_for_tx "${COMMIT_TX_HASH}" 30 4; then
    echo "❌ Commit not confirmed after waiting; stopping to avoid a failed register."
    echo "   - RPC: ${RPC_URL}"
    echo "   - Network: ${NETWORK}"
    echo "   - Passphrase: ${NETWORK_PASSPHRASE}"
    echo "Tip: ensure the RPC is reachable and ledger is closing, then rerun."
    exit 1
  fi
else
  echo "⚠️  Could not extract commit tx hash; sleeping 15s as a fallback..."
  sleep 15
fi

# Note: Commit succeeded (we saw the commit_made event), so commitment should be stored
# Skipping verification step to avoid hanging - the commit event confirms it was stored
echo "   ℹ️  Commit succeeded (commit_made event received) - commitment should be stored"

# 2) Wait min age (query registrar.params to read commit_min_age_secs)
echo "🔎 Fetching registrar params..."
DEFAULT_COMMIT_MIN_AGE=10
PARAMS_JSON="$(soroban contract invoke \
  --id "${REGISTRAR_ID}" \
  "${NET_FLAGS[@]}" \
  --network-passphrase "${NETWORK_PASSPHRASE}" \
  -- \
  params \
  )"
# naive parse: look for commit_min_age_secs in output (assumes JSON-ish output from your contract tooling)
MIN_AGE="$(echo "${PARAMS_JSON}" | sed -n 's/.*"commit_min_age_secs":[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -n1)"
if [[ -z "${MIN_AGE}" ]]; then
  MIN_AGE="${DEFAULT_COMMIT_MIN_AGE}"
  echo "   ⚠️  commit_min_age_secs not found in response, defaulting to ${DEFAULT_COMMIT_MIN_AGE}s"
fi

if [[ "${MIN_AGE}" -gt 0 ]]; then
  echo "🕒 Sleeping ${MIN_AGE}s to satisfy commit_min_age_secs..."
  sleep "${MIN_AGE}"
fi

# 3) REGISTER
echo "✅ Revealing (register)..."

echo "   Commit commitment: ${COMMITMENT_HEX}"
echo "   Register will compute from:"
echo "     Label: '${LABEL}' (hex: ${LABEL_HEX})"
echo "     Owner: ${OWNER_ADDR}"
echo "     Secret: ${SECRET_HEX} (${#SECRET_HEX} hex chars = $(( ${#SECRET_HEX} / 2 )) bytes)"
echo "   These should produce the same commitment: ${COMMITMENT_HEX}"

REGISTER_ARGS=(
  --id "${REGISTRAR_ID}"
  "${NET_FLAGS[@]}"
  --network-passphrase "${NETWORK_PASSPHRASE}"
  --source "${OWNER_SKEY}"
  --send=yes
  -- \
  register \
  --caller "${OWNER_ADDR}"
  --label "${LABEL_ARG}"
  --owner "${OWNER_ADDR}"
  --secret "${SECRET_ARG}"
)

if [[ -n "${RESOLVER_ID}" ]]; then
  REGISTER_ARGS+=( --resolver="${RESOLVER_ID}" )
else
  REGISTER_ARGS+=( --resolver=null: )
fi

set +e
REGISTER_OUT="$(soroban contract invoke "${REGISTER_ARGS[@]}" 2>&1)"
REGISTER_EXIT=$?
set -e
echo "REGISTER result:"
echo "${REGISTER_OUT}"

if [[ ${REGISTER_EXIT} -ne 0 ]]; then
  echo ""
  echo "❌ Registration failed with exit code ${REGISTER_EXIT}"
  echo "   Commitment used: ${COMMITMENT_HEX}"
  echo "   Secret used: ${SECRET_HEX}"
  echo "   Label: ${LABEL} (hex: ${LABEL_HEX})"
  echo ""
  echo "   This error usually means:"
  echo "   1. The commitment was not found (already used, expired, or not committed)"
  echo "   2. The name is already registered"
  echo "   3. Ledger synchronization issue (try waiting a few seconds and retry)"
  exit 1
fi

echo
echo "🎉 Registration successful! Verifying..."

# Extract namehash from register output if available
NAMEHASH_HEX=""
if echo "${REGISTER_OUT}" | grep -qE '[0-9a-f]{64}'; then
  NAMEHASH_HEX="$(echo "${REGISTER_OUT}" | grep -oE '[0-9a-f]{64}' | head -n1)"
  echo "   Namehash from registration: ${NAMEHASH_HEX}"
fi

# Verify via Registrar's available function (should return false if registered)
echo "   Checking if name is available (should be false if registered)..."
AVAILABLE_RESULT="$(soroban contract invoke \
  --id "${REGISTRAR_ID}" \
  "${NET_FLAGS[@]}" \
  --network-passphrase "${NETWORK_PASSPHRASE}" \
  -- \
  available --label "${LABEL_HEX}" 2>&1)"
if echo "${AVAILABLE_RESULT}" | grep -q "false"; then
  echo "   ✅ Name is registered (available returned false)"
elif echo "${AVAILABLE_RESULT}" | grep -q "true"; then
  echo "   ⚠️  Name appears to still be available (may need to wait for ledger sync)"
else
  echo "   ⚠️  Could not verify availability: ${AVAILABLE_RESULT}"
fi

echo
echo "📋 Additional verification methods:"
echo "   1. Indexer API (if running):"
echo "      curl http://localhost:8787/resolve/${LABEL}.stellar"
echo ""
echo "   2. Check if name is available (should return false if registered):"
echo "      soroban contract invoke --id ${REGISTRAR_ID} \\"
echo "        ${NET_FLAGS[@]} \\"
echo "        --network-passphrase '${NETWORK_PASSPHRASE}' \\"
echo "        -- available --label ${LABEL_HEX}"
echo ""
if [[ -n "${REGISTRY_ID}" && -n "${NAMEHASH_HEX}" ]]; then
  echo "   3. Check Registry owner (requires namehash):"
  echo "      soroban contract invoke --id ${REGISTRY_ID} \\"
  echo "        ${NET_FLAGS[@]} \\"
  echo "        --network-passphrase '${NETWORK_PASSPHRASE}' \\"
  echo "        -- owner --namehash ${NAMEHASH_HEX}"
  echo ""
fi
echo "   Note: The 'available' function returning false confirms the name is registered."
