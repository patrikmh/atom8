#!/usr/bin/env bash
# Validate a Google OAuth token against Google's tokeninfo endpoint
# Usage: ./validate_token.sh [TOKEN] [format]
# If TOKEN not provided, fetches one from auth.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN="${1:-}"
FORMAT="${GSKILL_FORMAT:-json}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--format) FORMAT="$2"; shift 2 ;;
    json|compact|table|csv|tsv|markdown|md)
      if [[ -z "$TOKEN" ]]; then
        TOKEN="$1"
      else
        FORMAT="$1"
      fi
      shift ;;
    *)
      if [[ -z "$TOKEN" ]]; then
        TOKEN="$1"
      fi
      shift ;;
  esac
done

# If token is a format name, treat it as format
if [[ "$TOKEN" =~ ^(json|compact|table|csv|tsv|markdown|md)$ ]]; then
  FORMAT="$TOKEN"
  TOKEN=""
fi

if [[ -z "$TOKEN" ]]; then
  TOKEN=$(get_token) || exit 1
fi

log_debug "Validating token against Google..."

RESPONSE=$(curl -s -G \
  "https://www.googleapis.com/oauth2/v1/tokeninfo" \
  --data-urlencode "access_token=${TOKEN}" \
  -w "\n%{http_code}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" != "200" ]]; then
  # Token is invalid
  OUTPUT=$(jq -n \
    --arg code "$HTTP_CODE" \
    --arg body "$BODY" \
    '{valid: false, http_code: ($code | tonumber), error: $body}')
  format_output "$OUTPUT" "$FORMAT" "valid http_code error"
  exit 1
fi

# Token is valid — parse details
OUTPUT=$(echo "$BODY" | jq '{
  valid: true,
  email,
  scopes: (.scope | split(" ")),
  expires_in: (.expires_in | tonumber),
  audience,
  user_id,
  issued_to,
  verified_email
}')

format_output "$OUTPUT" "$FORMAT" "valid email scopes expires_in audience"
