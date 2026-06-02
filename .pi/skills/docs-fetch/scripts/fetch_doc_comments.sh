#!/usr/bin/env bash
# Fetch comments on a Google Doc
# Usage: fetch_doc_comments.sh <documentId> [format]

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
    echo "Usage: $0 <documentId> [format]"
    exit 1
fi

DOCUMENT_ID="$1"
FORMAT="${2:-json}"

URL="https://docs.googleapis.com/v1/documents/${DOCUMENT_ID}/comments?fields=comments(author,createdTime,quotedContent,content,replies)"

log "Fetching comments for document $DOCUMENT_ID..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "$RESPONSE" | jq -r '.error.message' >&2
    exit 1
fi

# Transform
OUTPUT=$(echo "$RESPONSE" | jq '
    [ (.comments // [])[] |
        {
            author: (.author.displayName // "Unknown"),
            created: .createdTime,
            quotedText: (.quotedContent?.content // ""),
            comment: .content,
            replyCount: (.replies | length),
            resolved: (.resolved // false)
        }
    ]
')

COUNT=$(echo "$OUTPUT" | jq 'length')
log "Found $COUNT comments"

format_output "$OUTPUT" "$FORMAT" "author created quotedText comment replyCount resolved"
