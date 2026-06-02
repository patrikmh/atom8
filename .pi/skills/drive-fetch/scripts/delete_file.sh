#!/usr/bin/env bash
# Delete a file from Google Drive
# Usage: delete_file.sh <file_id>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN=$(get_token) || exit 1

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <file_id>"
    echo "  file_id: Google Drive file ID"
    exit 1
fi

FILE_ID="$1"

log "Deleting file: $FILE_ID"
RESPONSE=$(curl -s -X DELETE \
    -H "Authorization: Bearer ${TOKEN}" \
    -w "\n%{http_code}" \
    "https://www.googleapis.com/drive/v3/files/${FILE_ID}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "204" ]]; then
    log "File deleted successfully!"
    echo "{\"status\": \"deleted\", \"fileId\": \"${FILE_ID}\"}" | jq '.'
else
    echo "Error: HTTP $HTTP_CODE" >&2
    if [[ -n "$BODY" ]]; then
        echo "$BODY" | jq -r '.error.message' >&2
    fi
    exit 1
fi
