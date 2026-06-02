#!/usr/bin/env bash
# Delete a calendar event
# Usage: delete_event.sh <event_id>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN=$(get_token) || exit 1

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <event_id>"
    echo "  event_id: Event ID from fetch_calendar.sh"
    exit 1
fi

EVENT_ID="$1"

log "Deleting event: $EVENT_ID"
RESPONSE=$(curl -s -X DELETE \
    -H "Authorization: Bearer ${TOKEN}" \
    -w "\n%{http_code}" \
    "https://www.googleapis.com/calendar/v3/calendars/primary/events/${EVENT_ID}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "204" ]]; then
    log "Event deleted successfully!"
    echo "{\"status\": \"deleted\", \"eventId\": \"${EVENT_ID}\"}" | jq '.'
else
    echo "Error: HTTP $HTTP_CODE" >&2
    if [[ -n "$BODY" ]]; then
        echo "$BODY" | jq -r '.error.message' >&2
    fi
    exit 1
fi
