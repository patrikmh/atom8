#!/usr/bin/env bash
# Fetch contacts in a specific group
# Usage: fetch_by_group.sh <groupResourceName> [format] [options]

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
    echo "Usage: $0 <groupResourceName> [format] [-n N]"
    echo "  groupResourceName: e.g., contactGroups/myContacts"
    echo "  format: json, table, csv, tsv, markdown, compact"
    exit 1
fi

GROUP="$1"
FORMAT="${2:-json}"
shift 2 || true

LIMIT=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        -n) LIMIT="$2"; shift 2 ;;
        *) shift ;;
    esac
done

# First get group info to get member resource names
GROUP_URL="https://people.googleapis.com/v1/${GROUP}?maxMembers=100"
log "Fetching group members for $GROUP..."
GROUP_RESPONSE=$(api_call "$GROUP_URL" "contacts.readonly")

if echo "$GROUP_RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "$GROUP_RESPONSE" | jq -r '.error.message' >&2
    exit 1
fi

# Extract member resource names
MEMBERS=$(echo "$GROUP_RESPONSE" | jq -r '.memberResourceNames // [] | .[]')

if [[ -z "$MEMBERS" ]]; then
    log "No members found in group $GROUP"
    echo "[]"
    exit 0
fi

# Fetch each member's details
CONTACTS="[]"
for MEMBER in $MEMBERS; do
    PERSON_URL="https://people.googleapis.com/v1/${MEMBER}?personFields=names,emailAddresses,phoneNumbers,organizations"
    PERSON=$(api_call "$PERSON_URL" "contacts.readonly")
    if ! echo "$PERSON" | jq -e 'has("error")' >/dev/null 2>&1; then
        CONTACTS=$(echo "$CONTACTS" | jq --argjson person "$PERSON" '. + [$person]')
    fi
done

# Transform
OUTPUT=$(echo "$CONTACTS" | jq '
    [ .[] |
        {
            resourceName: .resourceName,
            displayName: (.names[0].displayName // "No Name"),
            firstName: (.names[0].givenName // ""),
            lastName: (.names[0].familyName // ""),
            emails: ([.emailAddresses[]?.value // empty] | join(", ")),
            phones: ([.phoneNumbers[]?.value // empty] | join(", "))
        }
    ]
')

COUNT=$(echo "$OUTPUT" | jq 'length')
log "Found $COUNT contacts in group $GROUP"

format_output "$OUTPUT" "$FORMAT" "resourceName displayName firstName lastName emails phones"
