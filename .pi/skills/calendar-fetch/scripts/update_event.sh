#!/usr/bin/env bash
# Update a calendar event
# Usage: update_event.sh <event_id> [options]
#   -t, --title TITLE        New title
#   -s, --start TIME         New start time ISO 8601
#   -e, --end TIME           New end time ISO 8601
#   -d, --description TEXT   New description
#   -l, --location TEXT      New location
#   --dry-run                Preview without updating

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN=$(get_token) || exit 1

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <event_id> [options]"
    echo "  event_id: Event ID from fetch_calendar.sh"
    exit 1
fi

EVENT_ID="$1"
shift

TITLE=""
START_TIME=""
END_TIME=""
DESCRIPTION=""
LOCATION=""
DRY_RUN=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -t|--title) TITLE="$2"; shift 2 ;;
        -s|--start) START_TIME="$2"; shift 2 ;;
        -e|--end) END_TIME="$2"; shift 2 ;;
        -d|--description) DESCRIPTION="$2"; shift 2 ;;
        -l|--location) LOCATION="$2"; shift 2 ;;
        --dry-run) DRY_RUN="1"; shift ;;
        *) shift ;;
    esac
done

# Build update payload
FIELDS=""
PAYLOAD="{}"

if [[ -n "$TITLE" ]]; then
    PAYLOAD=$(echo "$PAYLOAD" | jq --arg t "$TITLE" '. + {summary: $t}')
    FIELDS="${FIELDS}summary,"
fi

if [[ -n "$START_TIME" ]]; then
    if [[ "$START_TIME" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
        PAYLOAD=$(echo "$PAYLOAD" | jq --arg d "$START_TIME" '. + {start: {date: $d}}')
    else
        PAYLOAD=$(echo "$PAYLOAD" | jq --arg t "$START_TIME" '. + {start: {dateTime: $t}}')
    fi
    FIELDS="${FIELDS}start,"
fi

if [[ -n "$END_TIME" ]]; then
    if [[ "$END_TIME" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
        PAYLOAD=$(echo "$PAYLOAD" | jq --arg d "$END_TIME" '. + {end: {date: $d}}')
    else
        PAYLOAD=$(echo "$PAYLOAD" | jq --arg t "$END_TIME" '. + {end: {dateTime: $t}}')
    fi
    FIELDS="${FIELDS}end,"
fi

if [[ -n "$DESCRIPTION" ]]; then
    PAYLOAD=$(echo "$PAYLOAD" | jq --arg d "$DESCRIPTION" '. + {description: $d}')
    FIELDS="${FIELDS}description,"
fi

if [[ -n "$LOCATION" ]]; then
    PAYLOAD=$(echo "$PAYLOAD" | jq --arg l "$LOCATION" '. + {location: $l}')
    FIELDS="${FIELDS}location,"
fi

if [[ "$PAYLOAD" == "{}" ]]; then
    echo "Error: No fields to update. Provide at least one of -t, -s, -e, -d, -l"
    exit 1
fi

if [[ -n "$DRY_RUN" ]]; then
    echo "=== DRY RUN ==="
    echo "$PAYLOAD" | jq '.'
    exit 0
fi

log "Updating event: $EVENT_ID"
RESPONSE=$(curl -s -X PATCH \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "https://www.googleapis.com/calendar/v3/calendars/primary/events/${EVENT_ID}")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "Error: $(echo "$RESPONSE" | jq -r '.error.message')" >&2
    exit 1
fi

log "Event updated!"
echo "$RESPONSE" | jq '{id: .id, summary: .summary, start: .start, end: .end, updated: .updated}'
