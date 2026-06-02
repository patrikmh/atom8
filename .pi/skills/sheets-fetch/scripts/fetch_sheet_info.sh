#!/usr/bin/env bash
# Get metadata about a Google Sheet
# Usage: fetch_sheet_info.sh <spreadsheetId> [format] [options]
#   --tabs: List all sheets/tabs
#   --count: Get sheet count

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
    echo "Usage: $0 <spreadsheetId> [format] [--tabs] [--count]"
    exit 1
fi

SPREADSHEET_ID="$1"
FORMAT="${2:-json}"
shift 2 || true

TABS=""
COUNT=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --tabs) TABS="1"; shift ;;
        --count) COUNT="1"; shift ;;
        *) shift ;;
    esac
done

URL="https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=properties(title,locale,timeZone),sheets(properties(title,gridProperties(rowCount,columnCount)))"

log "Fetching sheet info for $SPREADSHEET_ID..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "$RESPONSE" | jq -r '.error.message' >&2
    exit 1
fi

if [[ -n "$TABS" ]]; then
    OUTPUT=$(echo "$RESPONSE" | jq '
        [ (.sheets // [])[] |
            {
                title: .properties.title,
                rowCount: .properties.gridProperties.rowCount,
                columnCount: .properties.gridProperties.columnCount
            }
        ]
    ')
    format_output "$OUTPUT" "$FORMAT" "title rowCount columnCount"
elif [[ -n "$COUNT" ]]; then
    echo "$RESPONSE" | jq '{ title: .properties.title, sheetCount: (.sheets | length), locale: .properties.locale, timeZone: .properties.timeZone }'
else
    echo "$RESPONSE" | jq '{
        title: .properties.title,
        locale: .properties.locale,
        timeZone: .properties.timeZone,
        sheetCount: (.sheets | length),
        sheets: [ (.sheets // [])[] | .properties.title ]
    }'
