#!/usr/bin/env bash
# Read content of a Google Doc
# Usage: fetch_doc_content.sh <documentId> [format] [options]
#   format: json, text, compact (default: json)
#   --text: Output plain text
#   --body: Extract body text only
#   --headings: Extract headings only
#   --links: Extract links only
#   --word-count: Show word count

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
    echo "Usage: $0 <documentId> [format] [--text] [--body] [--headings] [--links] [--word-count]"
    exit 1
fi

DOCUMENT_ID="$1"
FORMAT="${2:-json}"
shift 2 || true

TEXT=""
BODY=""
HEADINGS=""
LINKS=""
WORD_COUNT=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --text) TEXT="1"; shift ;;
        --body) BODY="1"; shift ;;
        --headings) HEADINGS="1"; shift ;;
        --links) LINKS="1"; shift ;;
        --word-count) WORD_COUNT="1"; shift ;;
        *) shift ;;
    esac
done

URL="https://docs.googleapis.com/v1/documents/${DOCUMENT_ID}"

log "Fetching document content for $DOCUMENT_ID..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "$RESPONSE" | jq -r '.error.message' >&2
    exit 1
fi

if [[ -n "$WORD_COUNT" ]]; then
    # Extract text and count words
    WORDS=$(echo "$RESPONSE" | jq -r '.body.content[]?.paragraph?.elements[]?.textRun?.content // empty' | tr -d '\n' | wc -w | tr -d ' ')
    echo "{ \"documentId\": \"${DOCUMENT_ID}\", \"title\": $(echo "$RESPONSE" | jq '.title'), \"wordCount\": ${WORDS} }" | jq '.'
    exit 0
fi

if [[ -n "$HEADINGS" ]]; then
    # Extract headings (paragraphs with heading style)
    echo "$RESPONSE" | jq '
        [ .body.content[]?.paragraph? | select(.paragraphStyle.namedStyleType | startswith("HEADING")) |
            {
                headingLevel: .paragraphStyle.namedStyleType,
                text: [ .elements[]?.textRun?.content // empty ] | join("")
            }
        ]
    '
    exit 0
fi

if [[ -n "$LINKS" ]]; then
    # Extract links
    echo "$RESPONSE" | jq '
        [ .body.content[]?.paragraph?.elements[]?.textRun? | select(.textStyle.link) |
            {
                text: .content,
                url: .textStyle.link.url
            }
        ]
    '
    exit 0
fi

if [[ -n "$BODY" || -n "$TEXT" ]]; then
    # Extract plain text from body
    echo "$RESPONSE" | jq -r '.body.content[]?.paragraph?.elements[]?.textRun?.content // empty'
    exit 0
fi

# Default: output full document JSON
# Simplify to key fields
echo "$RESPONSE" | jq '{
    documentId: .documentId,
    title: .title,
    revisionId: .revisionId,
    created: (.suggestionsViewMode // ""),
    body: {
        content: [ .body.content[]?.paragraph? | {
            text: [ .elements[]?.textRun?.content // empty ] | join(""),
            style: .paragraphStyle.namedStyleType
        } ]
    }
}'
