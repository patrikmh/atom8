#!/usr/bin/env bash
# Get dimensions of sheets in a spreadsheet
# Usage: fetch_sheet_dimensions.sh <spreadsheetId> [sheetName]

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
    echo "Usage: $0 <spreadsheetId> [sheetName]"
    exit 1
fi

SPREADSHEET_ID="$1"
SHEET_NAME="${2:-}"

URL="https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets(properties(title,gridProperties(rowCount,columnCount)))"

log "Fetching dimensions for $SPREADSHEET_ID..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "$RESPONSE" | jq -r '.error.message' >&2
    exit 1
fi

if [[ -n "$SHEET_NAME" ]]; then
    echo "$RESPONSE" | jq --arg name "$SHEET_NAME" '
        .sheets[] | select(.properties.title == $name) |
        {
            title: .properties.title,
            rowCount: .properties.gridProperties.rowCount,
            columnCount: .properties.gridProperties.columnCount,
            totalCells: (.properties.gridProperties.rowCount * .properties.gridProperties.columnCount)
        }
    '
else
    echo "$RESPONSE" | jq '
        [ (.sheets // [])[] |
            {
                title: .properties.title,
                rowCount: .properties.gridProperties.rowCount,
                columnCount: .properties.gridProperties.columnCount,
                totalCells: (.properties.gridProperties.rowCount * .properties.gridProperties.columnCount)
            }
        ]
    ' | jq '.'
