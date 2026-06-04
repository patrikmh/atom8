#!/usr/bin/env bash
# Create a new Google Doc
# Usage: create_doc.sh <title> [content]
#   Creates a new Google Doc with the given title and optional initial content

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
    echo "Usage: $0 <title> [content]"
    exit 1
fi

TITLE="$1"
CONTENT="${2:-}"

# Create the document
log "Creating Google Doc: $TITLE..."
BODY=$(jq -n --arg title "$TITLE" '{title: $title}')

RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$BODY" \
    "https://docs.googleapis.com/v1/documents")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "$RESPONSE" | jq -r '.error.message' >&2
    exit 1
fi

DOCUMENT_ID=$(echo "$RESPONSE" | jq -r '.documentId')

# If content provided, add it to the document
if [[ -n "$CONTENT" ]]; then
    # Insert text at the beginning of the document
    INSERT_REQUEST=$(jq -n \
        --arg text "$CONTENT" \
        '{requests: [{insertText: {location: {index: 1}, text: $text}}]}')
    
    curl -s -X POST \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$INSERT_REQUEST" \
        "https://docs.googleapis.com/v1/documents/${DOCUMENT_ID}:batchUpdate" >/dev/null 2>&1
fi

# Output the result
echo "$RESPONSE" | jq '{
    documentId: .documentId,
    title: .title,
    documentUrl: ("https://docs.google.com/document/d/" + .documentId + "/edit")
}'
