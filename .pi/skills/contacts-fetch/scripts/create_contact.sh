#!/usr/bin/env bash
# Create a contact in Google Contacts
# Usage: create_contact.sh -n "First Last" [options]
#   -n, --name NAME          Full name (required)
#   -e, --email EMAIL        Email address
#   -p, --phone PHONE        Phone number
#   -o, --org ORG            Organization/company
#   -j, --job JOB            Job title
#   --notes TEXT             Notes
#   --dry-run                Preview without creating

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN=$(get_token) || exit 1

NAME=""
EMAIL=""
PHONE=""
ORG=""
JOB=""
NOTES=""
DRY_RUN=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -n|--name) NAME="$2"; shift 2 ;;
        -e|--email) EMAIL="$2"; shift 2 ;;
        -p|--phone) PHONE="$2"; shift 2 ;;
        -o|--org) ORG="$2"; shift 2 ;;
        -j|--job) JOB="$2"; shift 2 ;;
        --notes) NOTES="$2"; shift 2 ;;
        --dry-run) DRY_RUN="1"; shift ;;
        -h|--help)
            echo "Usage: $0 -n NAME [options]"
            echo "  -n, --name NAME      Full name (required)"
            echo "  -e, --email EMAIL    Email address"
            echo "  -p, --phone PHONE    Phone number"
            echo "  -o, --org ORG        Organization"
            echo "  -j, --job JOB        Job title"
            echo "  --notes TEXT         Notes"
            echo "  --dry-run            Preview without creating"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

if [[ -z "$NAME" ]]; then
    echo "Error: -n (name) is required"
    exit 1
fi

# Build JSON payload
FIRST="${NAME%% *}"
LAST="${NAME#* }"
if [[ "$FIRST" == "$LAST" ]]; then
    LAST=""
fi

PAYLOAD="{\"names\":[{\"givenName\":\"${FIRST}\"}"
if [[ -n "$LAST" ]]; then
    PAYLOAD="${PAYLOAD},\"familyName\":\"${LAST}\""
fi
PAYLOAD="${PAYLOAD}]}"

if [[ -n "$EMAIL" ]]; then
    PAYLOAD="${PAYLOAD%}},\"emailAddresses\":[{\"value\":\"${EMAIL}\"}]}"
fi

if [[ -n "$PHONE" ]]; then
    PAYLOAD="${PAYLOAD%},\"phoneNumbers\":[{\"value\":\"${PHONE}\"}]}"
fi

if [[ -n "$ORG" || -n "$JOB" ]]; then
    ORG_OBJ="{"
    if [[ -n "$ORG" ]]; then
        ORG_OBJ="${ORG_OBJ}\"name\":\"${ORG}\""
    fi
    if [[ -n "$JOB" ]]; then
        if [[ -n "$ORG" ]]; then
            ORG_OBJ="${ORG_OBJ},"
        fi
        ORG_OBJ="${ORG_OBJ}\"title\":\"${JOB}\""
    fi
    ORG_OBJ="${ORG_OBJ}}"
    PAYLOAD="${PAYLOAD%},\"organizations\":[${ORG_OBJ}]}"
fi

if [[ -n "$NOTES" ]]; then
    ESC_NOTES=$(echo "$NOTES" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr '\n' ' ')
    PAYLOAD="${PAYLOAD%},\"biographies\":[{\"value\":\"${ESC_NOTES}\"}]}"
fi

if [[ -n "$DRY_RUN" ]]; then
    echo "=== DRY RUN ==="
    echo "$PAYLOAD" | jq '.'
    exit 0
fi

log "Creating contact: $NAME"
RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "https://people.googleapis.com/v1/people:createContact")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "Error: $(echo "$RESPONSE" | jq -r '.error.message')" >&2
    exit 1
fi

RESOURCE_NAME=$(echo "$RESPONSE" | jq -r '.resourceName')
log "Contact created! Resource: $RESOURCE_NAME"
echo "$RESPONSE" | jq '{resourceName: .resourceName, displayName: .names[0].displayName, emails: .emailAddresses, phones: .phoneNumbers}'
