#!/usr/bin/env bash
# List all sheet/tab names in a spreadsheet
# Usage: fetch_sheet_names.sh <spreadsheetId> [--numbered]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_PATH="${SCRIPT_DIR}/../../common/lib.sh"

if [[ -f "$LIB_PATH" ]]; then
    source "$LIB_PATH"
else
    echo "Error: Shared library not found at $LIB_PATH" >&2
    exit 1
fi

# Get token
TOKEN=$(get_token) || exit 1

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <spreadsheetId> [--numbered]"
    exit 1
fi

SPREADSHEET_ID="$1"
NUMBERED=""

if [[ "${2:-}" == "--numbered" ]]; then
    NUMBERED="1"
fi

URL="https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets(properties(title))"

log "Fetching sheet names for $SPREADSHEET_ID..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "$RESPONSE" | jq -r '.error.message' >&2
    exit 1
fi

if [[ -n "$NUMBERED" ]]; then
    echo "$RESPONSE" | jq -r '.sheets | to_entries | .[] | "\(.key + 1). \(.value.properties.title)"'
else
    echo "$RESPONSE" | jq -r '.sheets[].properties.title'
