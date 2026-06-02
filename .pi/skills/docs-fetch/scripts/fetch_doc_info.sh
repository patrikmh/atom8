#!/usr/bin/env bash
# Get metadata about a Google Doc
# Usage: fetch_doc_info.sh <documentId> [format]

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

URL="https://docs.googleapis.com/v1/documents/${DOCUMENT_ID}"

log "Fetching document info for $DOCUMENT_ID..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "$RESPONSE" | jq -r '.error.message' >&2
    exit 1
fi

# Extract key info
OUTPUT=$(echo "$RESPONSE" | jq '{
    documentId: .documentId,
    title: .title,
    revisionId: .revisionId,
    documentStyle: {
        pageSize: .documentStyle.pageSize,
        marginTop: .documentStyle.marginTop,
        marginBottom: .documentStyle.marginBottom,
        marginLeft: .documentStyle.marginLeft,
        marginRight: .documentStyle.marginRight
    },
    namedStyles: (.namedStyles?.styles | length),
    lists: (.lists | keys | length),
    sectionCount: (.body.content | map(select(.sectionBreak)) | length)
}')

if [[ "$FORMAT" == "compact" ]]; then
    format_output "$OUTPUT" "compact" "documentId title revisionId namedStyles lists sectionCount"
else
    echo "$OUTPUT" | jq '.'
