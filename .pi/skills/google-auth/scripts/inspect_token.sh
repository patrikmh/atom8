#!/usr/bin/env bash
# Inspect Google OAuth token details from auth.json
# Usage: ./inspect_token.sh [format]
# Formats: json (default), table, compact

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

FORMAT="${1:-${GSKILL_FORMAT:-json}}"

AUTH_FILE="${GSKILL_AUTH_FILE}"

if [[ ! -f "$AUTH_FILE" ]]; then
  log_err "No auth.json found at $AUTH_FILE"
  exit 1
fi

# Extract token data
ACCESS_TOKEN=$(jq -r '."google-antigravity".access // "null"' "$AUTH_FILE")
REFRESH_TOKEN=$(jq -r '."google-antigravity".refresh // "null"' "$AUTH_FILE")
EXPIRES_MS=$(jq -r '."google-antigravity".expires // "null"' "$AUTH_FILE")
SCOPES=$(jq -r '."google-antigravity".scopes // "null"' "$AUTH_FILE")

# Check validity
NOW_MS=$(date +%s)000
VALID=false
REMAINING_SEC=0
if [[ "$EXPIRES_MS" != "null" && -n "$EXPIRES_MS" && "$EXPIRES_MS" != "0" ]]; then
  REMAINING_MS=$((EXPIRES_MS - NOW_MS))
  REMAINING_SEC=$((REMAINING_MS / 1000))
  if (( REMAINING_SEC > 0 )); then
    VALID=true
  fi
fi

# Convert expiry to human-readable
EXPIRY_HUMAN="unknown"
if [[ "$EXPIRES_MS" != "null" && -n "$EXPIRES_MS" && "$EXPIRES_MS" != "0" ]]; then
  if date --version >/dev/null 2>&1; then
    EXPIRY_HUMAN=$(date -d "@$((${EXPIRES_MS}/1000))" '+%Y-%m-%d %H:%M:%S')
  else
    EXPIRY_HUMAN=$(date -r "$((${EXPIRES_MS}/1000))" '+%Y-%m-%d %H:%M:%S')
  fi
fi

# Mask tokens for security
MASK_ACCESS="${ACCESS_TOKEN:0:8}...${ACCESS_TOKEN: -8}"
MASK_REFRESH="${REFRESH_TOKEN:0:8}...${REFRESH_TOKEN: -8}"

# Build output JSON
OUTPUT=$(jq -n \
  --arg access "$MASK_ACCESS" \
  --arg refresh "$MASK_REFRESH" \
  --arg expires "$EXPIRES_MS" \
  --arg expiry "$EXPIRY_HUMAN" \
  --arg remaining "$REMAINING_SEC" \
  --arg valid "$VALID" \
  --arg scopes "$SCOPES" \
  '{
    access_token: $access,
    refresh_token: $refresh,
    expires_ms: ($expires | tonumber),
    expiry_human: $expiry,
    remaining_seconds: ($remaining | tonumber),
    valid: ($valid == "true"),
    scopes: ($scopes | split(" ") | map(select(. != "")))
  }')

# Format and output
format_output "$OUTPUT" "$FORMAT" "access_token refresh_token expires_ms expiry_human remaining_seconds valid scopes"
