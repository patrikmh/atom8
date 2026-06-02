#!/usr/bin/env bash
# Read data from a Google Sheet
# Usage: fetch_sheet_data.sh <spreadsheetId> [range] [format] [options]
#   range: e.g., "Sheet1!A1:D10" or "Sheet1"
#   format: json, table, csv, tsv, markdown, compact (default: json)
#   --formulas             Return formulas instead of values
#   --formatting           Include formatting info
#   --transpose            Transpose output
#   --all                  Read entire sheet

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
    echo "Usage: $0 <spreadsheetId> [range] [format] [options]"
    echo "  range: e.g., Sheet1!A1:D10 (default: Sheet1!A1:Z1000)"
    echo "  format: json, table, csv, tsv, markdown, compact"
    exit 1
fi

SPREADSHEET_ID="$1"
RANGE="${2:-Sheet1!A1:Z1000}"
FORMAT="${3:-json}"
shift 3 || true

FORMULAS=""
FORMATTING=""
TRANSPOSE=""
ALL=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --formulas) FORMULAS="1"; shift ;;
        --formatting) FORMATTING="1"; shift ;;
        --transpose) TRANSPOSE="1"; shift ;;
        --all) ALL="1"; shift ;;
        *) shift ;;
    esac
done

# Determine value render option
RENDER="FORMATTED_VALUE"
if [[ -n "$FORMULAS" ]]; then
    RENDER="FORMULA"
fi

# Build URL
ENCODED_RANGE=$(echo "$RANGE" | sed 's/!/%21/g' | sed 's/ /%20/g')
URL="https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${ENCODED_RANGE}?valueRenderOption=${RENDER}"

log "Reading sheet data: $SPREADSHEET_ID / $RANGE"
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "$RESPONSE" | jq -r '.error.message' >&2
    exit 1
fi

# Extract values
VALUES=$(echo "$RESPONSE" | jq '.values // []')

if [[ -n "$TRANSPOSE" ]]; then
    VALUES=$(echo "$VALUES" | jq 'transpose')
fi

# For table/csv/tsv format, output as-is (it's already a 2D array)
if [[ "$FORMAT" == "csv" ]]; then
    echo "$VALUES" | jq -r '.[] | @csv'
elif [[ "$FORMAT" == "tsv" ]]; then
    echo "$VALUES" | jq -r '.[] | @tsv'
elif [[ "$FORMAT" == "table" ]]; then
    # Convert to table - use first row as headers
    HEADERS=$(echo "$VALUES" | jq -r '.[0] | @tsv')
    echo "$HEADERS"
    echo "$HEADERS" | sed 's/[^	]/-/g'
    echo "$VALUES" | jq -r '.[1:] | .[] | @tsv'
elif [[ "$FORMAT" == "json" ]]; then
    # Convert to array of objects using first row as keys
    echo "$VALUES" | jq '
        if length > 0 then
            .[0] as $headers |
            .[1:] | [.[] | 
                with_entries(.key = $headers[.key | tonumber] // ("col" + (.key | tonumber + 1 | tostring)))
            ]
        else
            []
        end
    '
else
    echo "$VALUES" | jq '.'
