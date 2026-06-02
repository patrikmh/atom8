#!/usr/bin/env bash
# Fetch Google Sheets spreadsheets from Drive
# Usage: fetch_sheets.sh [format] [options]
#   format: json, table, csv, tsv, markdown, compact (default: json)
#   -n, --number N         Limit to N sheets
#   -q, --query STRING     Search query
#   --shared               Show only shared sheets
#   --owned                Show only owned sheets

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

FORMAT="${1:-json}"
shift || true

LIMIT=""
QUERY=""
SHARED=""
OWNED=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -n|--number) LIMIT="$2"; shift 2 ;;
        -q|--query) QUERY="$2"; shift 2 ;;
        --shared) SHARED="1"; shift ;;
        --owned) OWNED="1"; shift ;;
        *) shift ;;
    esac
done

# Build query
DRIVE_QUERY="mimeType='application/vnd.google-apps.spreadsheet'"

if [[ -n "$QUERY" ]]; then
    DRIVE_QUERY="${DRIVE_QUERY} and name contains '${QUERY}'"
fi

if [[ -n "$SHARED" ]]; then
    DRIVE_QUERY="${DRIVE_QUERY} and sharedWithMe=true"
fi

if [[ -n "$OWNED" ]]; then
    DRIVE_QUERY="${DRIVE_QUERY} and 'me' in owners"
fi

URL="https://www.googleapis.com/drive/v3/files?q=$(urlencode "$DRIVE_QUERY")&fields=files(id,name,modifiedTime,createdTime,ownedByMe,shared,webViewLink,owners(displayName))&orderBy=modifiedTime desc"

if [[ -n "$LIMIT" ]]; then
    URL="${URL}&pageSize=${LIMIT}"
fi

log "Fetching Google Sheets..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "$RESPONSE" | jq -r '.error.message' >&2
    exit 1
fi

OUTPUT=$(echo "$RESPONSE" | jq '
    [ (.files // [])[] |
        {
            id: .id,
            name: .name,
            modified: .modifiedTime,
            created: .createdTime,
            owned: .ownedByMe,
            shared: .shared,
            owner: (.owners[0].displayName // ""),
            link: .webViewLink
        }
    ]
')

COUNT=$(echo "$OUTPUT" | jq 'length')
log "Found $COUNT spreadsheets"

format_output "$OUTPUT" "$FORMAT" "id name modified created owned shared owner link"
