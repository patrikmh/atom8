#!/usr/bin/env bash
# Write data to a Google Sheet
# Usage: write_sheet.sh <spreadsheetId> <range> <data>
#   spreadsheetId: ID of the spreadsheet
#   range: A1 notation range, e.g., "Sheet1!A1"
#   data: JSON array of arrays, e.g., '[["A","B"],["C","D"]]'

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN=$(get_token) || exit 1

if [[ $# -lt 3 ]]; then
    echo "Usage: $0 <spreadsheetId> <range> <data>"
    echo "  spreadsheetId: ID of the spreadsheet"
    echo "  range: A1 notation, e.g., Sheet1!A1"
    echo "  data: JSON array of arrays, e.g., '[[\"A\",\"B\"],[\"C\",\"D\"]]'"
    echo ""
    echo "Example:"
    echo "  $0 123abc Sheet1!A1 '[[\"Name\",\"Age\"],[\"Alice\",\"30\"]]'"
    exit 1
fi

SPREADSHEET_ID="$1"
RANGE="$2"
DATA="$3"

# Validate data is valid JSON
if ! echo "$DATA" | jq -e '.' >/dev/null 2>&1; then
    echo "Error: Invalid JSON data"
    exit 1
fi

PAYLOAD="{\"values\":${DATA}}"

# Encode range for URL
ENCODED_RANGE=$(echo "$RANGE" | sed 's/!/%21/g' | sed 's/ /%20/g')

log "Writing data to $SPREADSHEET_ID / $RANGE"
RESPONSE=$(curl -s -X PUT \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${ENCODED_RANGE}?valueInputOption=RAW")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "Error: $(echo "$RESPONSE" | jq -r '.error.message')" >&2
    exit 1
fi

log "Data written successfully!"
echo "$RESPONSE" | jq '{spreadsheetId: .spreadsheetId, updatedRange: .updatedRange, updatedRows: .updatedRows, updatedColumns: .updatedColumns}'
