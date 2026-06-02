#!/usr/bin/env bash
# Fetch contact photos
# Usage: fetch_contact_photos.sh [resourceName]

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

RESOURCE_NAME="${1:-}"

if [[ -n "$RESOURCE_NAME" ]]; then
    # Fetch single contact photo
    URL="https://people.googleapis.com/v1/${RESOURCE_NAME}?personFields=photos,names"
    log "Fetching photo for $RESOURCE_NAME..."
    RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")
    
    if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
        echo "$RESPONSE" | jq -r '.error.message' >&2
        exit 1
    fi
    
    echo "$RESPONSE" | jq '{
        resourceName: .resourceName,
        displayName: (.names[0].displayName // "No Name"),
        photoUrl: (.photos[0].url // "No photo")
    }'
else
    # Fetch all contact photos
    URL="https://people.googleapis.com/v1/people/me/connections?personFields=photos,names&pageSize=100"
    log "Fetching photos for all contacts..."
    RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")
    
    if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
        echo "$RESPONSE" | jq -r '.error.message' >&2
        exit 1
    fi
    
    echo "$RESPONSE" | jq '
        [ (.connections // [])[] |
            {
                resourceName: .resourceName,
                displayName: (.names[0].displayName // "No Name"),
                photoUrl: (.photos[0].url // "No photo")
            }
        ]
    ' | jq '.'
