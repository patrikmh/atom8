#!/usr/bin/env bash
# Fetch detailed information for a single contact
# Usage: fetch_contact.sh <resourceName> [fields]

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
    echo "Usage: $0 <resourceName> [fields]"
    echo "  resourceName: e.g., people/c123456789"
    echo "  fields: comma-separated personFields (default: names,emailAddresses,phoneNumbers,addresses,organizations,biographies,photos,birthdays)"
    exit 1
fi

RESOURCE_NAME="$1"
FIELDS="${2:-names,emailAddresses,phoneNumbers,addresses,organizations,biographies,photos,birthdays}"

URL="https://people.googleapis.com/v1/${RESOURCE_NAME}?personFields=${FIELDS}"

log "Fetching contact details for $RESOURCE_NAME..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "$RESPONSE" | jq -r '.error.message' >&2
    exit 1
fi

# Output as pretty JSON
echo "$RESPONSE" | jq '.'
