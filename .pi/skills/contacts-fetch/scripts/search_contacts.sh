#!/usr/bin/env bash
# Search contacts by name, email, or phone
# Usage: search_contacts.sh <query> [format] [--exact]

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
    echo "Usage: $0 <query> [format] [--exact]"
    echo "  query:  Search term (name, email, or phone)"
    echo "  format: json, table, csv, tsv, markdown, compact (default: json)"
    exit 1
fi

QUERY="$1"
FORMAT="${2:-json}"
EXACT=""

if [[ "$FORMAT" == "--exact" ]]; then
    EXACT="1"
    FORMAT="json"
fi

if [[ "${3:-}" == "--exact" ]]; then
    EXACT="1"
fi

# Search via People API search endpoint
URL="https://people.googleapis.com/v1/people:searchContacts?query=$(urlencode "$QUERY")&pageSize=20&readMask=names,emailAddresses,phoneNumbers,organizations"

log "Searching contacts for '$QUERY'..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")

# Check for errors
if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "$RESPONSE" | jq -r '.error.message' >&2
    exit 1
fi

# Extract results
RESULTS=$(echo "$RESPONSE" | jq '.results // []')

# Transform
OUTPUT=$(echo "$RESULTS" | jq '
    [ .[] | .person |
        {
            resourceName: .resourceName,
            displayName: (.names[0].displayName // "No Name"),
            firstName: (.names[0].givenName // ""),
            lastName: (.names[0].familyName // ""),
            emails: ([.emailAddresses[]?.value // empty] | join(", ")),
            phones: ([.phoneNumbers[]?.value // empty] | join(", ")),
            organizations: ([.organizations[]?.name // empty] | join(", "))
        }
    ]
')

COUNT=$(echo "$OUTPUT" | jq 'length')
log "Found $COUNT matching contacts"

format_output "$OUTPUT" "$FORMAT" "resourceName displayName firstName lastName emails phones organizations"
