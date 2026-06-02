#!/usr/bin/env bash
# Upload a file to Google Drive
# Usage: upload_file.sh <file_path> [options]
#   -n, --name NAME          Override filename
#   -d, --description TEXT   File description
#   -f, --folder ID          Parent folder ID
#   --convert                Convert to Google format
#   --dry-run                Preview without uploading

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN=$(get_token) || exit 1

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <file_path> [options]"
    echo "  file_path: Path to file to upload"
    echo "  -n, --name NAME       Override filename"
    echo "  -d, --description     File description"
    echo "  -f, --folder ID       Parent folder ID"
    echo "  --convert             Convert to Google format"
    echo "  --dry-run             Preview without uploading"
    exit 1
fi

FILE_PATH="$1"
shift

NAME=""
DESCRIPTION=""
FOLDER=""
CONVERT=""
DRY_RUN=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -n|--name) NAME="$2"; shift 2 ;;
        -d|--description) DESCRIPTION="$2"; shift 2 ;;
        -f|--folder) FOLDER="$2"; shift 2 ;;
        --convert) CONVERT="1"; shift ;;
        --dry-run) DRY_RUN="1"; shift ;;
        *) shift ;;
    esac
done

if [[ ! -f "$FILE_PATH" ]]; then
    echo "Error: File not found: $FILE_PATH"
    exit 1
fi

BASENAME="${NAME:-$(basename "$FILE_PATH")}"
MIME=$(file -b --mime-type "$FILE_PATH" 2>/dev/null || echo "application/octet-stream")

# Build metadata
METADATA="{\"name\":\"${BASENAME}\"}"
if [[ -n "$DESCRIPTION" ]]; then
    METADATA=$(echo "$METADATA" | jq --arg d "$DESCRIPTION" '. + {description: $d}')
fi
if [[ -n "$FOLDER" ]]; then
    METADATA=$(echo "$METADATA" | jq --arg f "$FOLDER" '. + {parents: [$f]}')
fi
if [[ -n "$CONVERT" ]]; then
    # Map common mime types to Google formats
    case "$MIME" in
        text/plain) METADATA=$(echo "$METADATA" | jq '. + {mimeType: "application/vnd.google-apps.document"}') ;;
        text/csv) METADATA=$(echo "$METADATA" | jq '. + {mimeType: "application/vnd.google-apps.spreadsheet"}') ;;
        application/vnd.openxmlformats-officedocument.wordprocessingml.document) METADATA=$(echo "$METADATA" | jq '. + {mimeType: "application/vnd.google-apps.document"}') ;;
        application/vnd.openxmlformats-officedocument.spreadsheetml.sheet) METADATA=$(echo "$METADATA" | jq '. + {mimeType: "application/vnd.google-apps.spreadsheet"}') ;;
    esac
fi

if [[ -n "$DRY_RUN" ]]; then
    echo "=== DRY RUN ==="
    echo "File: $FILE_PATH"
    echo "Name: $BASENAME"
    echo "MIME: $MIME"
    echo "Metadata:"
    echo "$METADATA" | jq '.'
    exit 0
fi

log "Uploading $BASENAME to Google Drive..."

# Use multipart upload
BOUNDARY="$(uuidgen 2>/dev/null || echo "foo_bar_baz_$$")"

# Build multipart body
{
    echo "--${BOUNDARY}"
    echo "Content-Type: application/json; charset=UTF-8"
    echo ""
    echo "$METADATA"
    echo ""
    echo "--${BOUNDARY}"
    echo "Content-Type: ${MIME}"
    echo ""
    cat "$FILE_PATH"
    echo ""
    echo "--${BOUNDARY}--"
} > /tmp/upload_body_$$.txt

RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: multipart/related; boundary=${BOUNDARY}" \
    --data-binary @/tmp/upload_body_$$.txt \
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")

rm -f /tmp/upload_body_$$.txt

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "Error: $(echo "$RESPONSE" | jq -r '.error.message')" >&2
    exit 1
fi

FILE_ID=$(echo "$RESPONSE" | jq -r '.id')
log "File uploaded! ID: $FILE_ID"
echo "$RESPONSE" | jq '{id: .id, name: .name, mimeType: .mimeType, size: .size, webViewLink: .webViewLink}'
