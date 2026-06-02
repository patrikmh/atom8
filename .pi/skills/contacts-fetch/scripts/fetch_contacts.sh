#!/usr/bin/env bash
# Fetch contacts from Google Contacts using People API
# Usage: fetch_contacts.sh [format] [options]
#   format: json, table, csv, tsv, markdown, compact (default: json)
#   -n, --number N         Limit to N contacts
#   -q, --query STRING     Search query
#   --has-email             Only show contacts with email
#   --has-phone             Only show contacts with phone
#   --full                  Show all fields
#   --fields FIELDS         Specify personFields (comma-separated)
#   --sort firstname|lastname  Sort by name

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

# Parse arguments
FORMAT="${1:-json}"
shift || true

LIMIT=""
QUERY=""
HAS_EMAIL=""
HAS_PHONE=""
FULL=""
FIELDS=""
SORT=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -n|--number) LIMIT="$2"; shift 2 ;;
        -q|--query) QUERY="$2"; shift 2 ;;
        --has-email) HAS_EMAIL="1"; shift ;;
        --has-phone) HAS_PHONE="1"; shift ;;
        --full) FULL="1"; shift ;;
        --fields) FIELDS="$2"; shift 2 ;;
        --sort) SORT="$2"; shift 2 ;;
        *) shift ;;
    esac
done

# Determine fields
if [[ -n "$FULL" ]]; then
    PERSON_FIELDS="names,emailAddresses,phoneNumbers,addresses,organizations,urls,birthdays,biographies,photos,memberships"
elif [[ -n "$FIELDS" ]]; then
    PERSON_FIELDS="$FIELDS"
else
    PERSON_FIELDS="names,emailAddresses,phoneNumbers"
fi

# Build API URL
URL="https://people.googleapis.com/v1/people/me/connections?personFields=${PERSON_FIELDS}&pageSize=100"

if [[ -n "$LIMIT" ]]; then
    URL="${URL}&pageSize=${LIMIT}"
fi

if [[ -n "$QUERY" ]]; then
    URL="${URL}&query=$(urlencode "$QUERY")"
fi

# Sort parameter
if [[ -n "$SORT" ]]; then
    if [[ "$SORT" == "lastname" ]]; then
        URL="${URL}&sortOrder=LAST_NAME_ASCENDING"
    elif [[ "$SORT" == "firstname" ]]; then
        URL="${URL}&sortOrder=FIRST_NAME_ASCENDING"
    fi
fi

# Fetch data
log "Fetching contacts from Google People API..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")

# Check for errors
if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "$RESPONSE" | jq -r '.error.message' >&2
    exit 1
fi

# Extract contacts
CONTACTS=$(echo "$RESPONSE" | jq '.connections // []')

# Apply filters
if [[ -n "$HAS_EMAIL" ]]; then
    CONTACTS=$(echo "$CONTACTS" | jq '[.[] | select(.emailAddresses | length > 0)]')
fi

if [[ -n "$HAS_PHONE" ]]; then
    CONTACTS=$(echo "$CONTACTS" | jq '[.[] | select(.phoneNumbers | length > 0)]')
fi

# Transform for output
OUTPUT=$(echo "$CONTACTS" | jq '
    [ .[] |
        {
            resourceName: .resourceName,
            displayName: (.names[0].displayName // "No Name"),
            firstName: (.names[0].givenName // ""),
            lastName: (.names[0].familyName // ""),
            emails: ([.emailAddresses[]?.value // empty] | join(", ")),
            phones: ([.phoneNumbers[]?.value // empty] | join(", ")),
            organizations: ([.organizations[]?.name // empty] | join(", ")),
            jobTitles: ([.organizations[]?.title // empty] | join(", ")),
            updated: (.metadata.sources[0].updateTime // "")
        }
    ]
')

# Count
COUNT=$(echo "$OUTPUT" | jq 'length')
log "Found $COUNT contacts"

# Output
format_output "$OUTPUT" "$FORMAT" "resourceName displayName firstName lastName emails phones organizations jobTitles updated"
