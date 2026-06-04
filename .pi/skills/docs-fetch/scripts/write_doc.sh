#!/usr/bin/env bash
# Write/append text to a Google Doc
# Usage: write_doc.sh <documentId> <text> [--append]
#   --append: Append to the end instead of replacing content

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

if [[ $# -lt 2 ]]; then
    echo "Usage: $0 <documentId> <text> [--append]"
    exit 1
fi

DOCUMENT_ID="$1"
TEXT="$2"
APPEND="${3:-}"

# If appending, get the current document length to know where to insert
if [[ "$APPEND" == "--append" ]]; then
    DOC=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
        "https://docs.googleapis.com/v1/documents/${DOCUMENT_ID}")
    # Get the last element's endIndex, or default to 1
    END_INDEX=$(echo "$DOC" | jq -r '.body.content[-1].endIndex // 1')
    # Subtract 1 because the newline at the end is the last character
    INSERT_INDEX=$((END_INDEX - 1))
    if [[ $INSERT_INDEX -lt 1 ]]; then
        INSERT_INDEX=1
    fi
else
    # For replace, we need to delete existing content and then insert
    # First, get the document to find its content length
    DOC=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
        "https://docs.googleapis.com/v1/documents/${DOCUMENT_ID}")
    
    # Delete all content from index 1 to end
    END_INDEX=$(echo "$DOC" | jq -r '.body.content[-1].endIndex // 2')
    DELETE_REQUEST=$(jq -n \
        --argjson endIndex $END_INDEX \
        '{requests: [{deleteContentRange: {range: {startIndex: 1, endIndex: $endIndex}}}]}')
    
    curl -s -X POST \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$DELETE_REQUEST" \
        "https://docs.googleapis.com/v1/documents/${DOCUMENT_ID}:batchUpdate" >/dev/null 2>&1
    
    INSERT_INDEX=1
fi

# Insert the new text
INSERT_REQUEST=$(jq -n \
    --arg text "$TEXT" \
    --argjson index $INSERT_INDEX \
    '{requests: [{insertText: {location: {index: $index}, text: $text}}]}')

log "Writing to document $DOCUMENT_ID..."
RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$INSERT_REQUEST" \
    "https://docs.googleapis.com/v1/documents/${DOCUMENT_ID}:batchUpdate")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "$RESPONSE" | jq -r '.error.message' >&2
    exit 1
fi

# Get document info
DOC_INFO=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "https://docs.googleapis.com/v1/documents/${DOCUMENT_ID}")

TITLE=$(echo "$DOC_INFO" | jq -r '.title')

# Output result
jq -n \
    --arg documentId "$DOCUMENT_ID" \
    --arg title "$TITLE" \
    --arg documentUrl "https://docs.google.com/document/d/${DOCUMENT_ID}/edit" \
    --arg text "$TEXT" \
    '{documentId: $documentId, title: $title, documentUrl: $documentUrl, text: $text, status: "ok"}'
