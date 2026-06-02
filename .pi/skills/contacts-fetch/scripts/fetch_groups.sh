#!/usr/bin/env bash
# Fetch contact groups from Google Contacts
# Usage: fetch_groups.sh [format]

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

FORMAT="${1:-json}"

URL="https://people.googleapis.com/v1/contactGroups?groupFields=name,memberCount,formattedName"

log "Fetching contact groups..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "$RESPONSE" | jq -r '.error.message' >&2
    exit 1
fi

# Transform
OUTPUT=$(echo "$RESPONSE" | jq '
    [ (.contactGroups // [])[] |
        {
            resourceName: .resourceName,
            name: (.name // ""),
            formattedName: (.formattedName // ""),
            memberCount: (.memberCount // 0),
            groupType: (.groupType // "")
        }
    ]
')

COUNT=$(echo "$OUTPUT" | jq 'length')
log "Found $COUNT contact groups"

format_output "$OUTPUT" "$FORMAT" "resourceName name formattedName memberCount groupType"
