#!/usr/bin/env bash
# Create a calendar event
# Usage: create_event.sh -t "Event Title" -s "2026-06-03T10:00:00+02:00" -e "2026-06-03T11:00:00+02:00" [options]
#   -t, --title TITLE        Event title (required)
#   -s, --start TIME         Start time ISO 8601 (required)
#   -e, --end TIME           End time ISO 8601 (required)
#   -d, --description TEXT  Event description
#   -l, --location TEXT      Event location
#   -a, --attendee EMAIL     Add attendee (can be used multiple times)
#   --all-day                All-day event
#   --dry-run                Preview without creating

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN=$(get_token) || exit 1

TITLE=""
START_TIME=""
END_TIME=""
DESCRIPTION=""
LOCATION=""
ATTENDEES=""
ALL_DAY=""
DRY_RUN=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -t|--title) TITLE="$2"; shift 2 ;;
        -s|--start) START_TIME="$2"; shift 2 ;;
        -e|--end) END_TIME="$2"; shift 2 ;;
        -d|--description) DESCRIPTION="$2"; shift 2 ;;
        -l|--location) LOCATION="$2"; shift 2 ;;
        -a|--attendee) ATTENDEES="${ATTENDEES}\"${2}\","; shift 2 ;;
        --all-day) ALL_DAY="1"; shift ;;
        --dry-run) DRY_RUN="1"; shift ;;
        -h|--help)
            echo "Usage: $0 -t TITLE -s START -e END [options]"
            echo "  -t, --title TITLE      Event title (required)"
            echo "  -s, --start TIME       Start time ISO 8601 (required)"
            echo "  -e, --end TIME         End time ISO 8601 (required)"
            echo "  -d, --description      Event description"
            echo "  -l, --location         Event location"
            echo "  -a, --attendee EMAIL   Add attendee (repeatable)"
            echo "  --all-day              All-day event (use date only for start/end)"
            echo "  --dry-run              Preview without creating"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

if [[ -z "$TITLE" || -z "$START_TIME" || -z "$END_TIME" ]]; then
    echo "Error: -t, -s, and -e are required"
    exit 1
fi

# Build JSON payload
if [[ -n "$ALL_DAY" ]]; then
    START_JSON="{\"date\":\"${START_TIME}\"}"
    END_JSON="{\"date\":\"${END_TIME}\"}"
else
    START_JSON="{\"dateTime\":\"${START_TIME}\"}"
    END_JSON="{\"dateTime\":\"${END_TIME}\"}"
fi

# Build attendee array
ATTENDEE_JSON=""
if [[ -n "$ATTENDEES" ]]; then
    # Remove trailing comma and wrap in array
    ATTENDEES="${ATTENDEES%,}"
    ATTENDEE_JSON="\"attendees\": ["
    for email in ${ATTENDEES//,/ }; do
        email="${email//\"}"
        ATTENDEE_JSON="${ATTENDEE_JSON}{\"email\":\"${email}\"},"
    done
    ATTENDEE_JSON="${ATTENDEE_JSON%,}],"
fi

# Build description JSON
DESC_JSON=""
if [[ -n "$DESCRIPTION" ]]; then
    # Escape the description for JSON
    ESC_DESC=$(echo "$DESCRIPTION" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed 's/\t/\\t/g' | tr '\n' ' ')
    DESC_JSON="\"description\":\"${ESC_DESC}\","
fi

# Build location JSON
LOC_JSON=""
if [[ -n "$LOCATION" ]]; then
    LOC_JSON="\"location\":\"${LOCATION}\","
fi

PAYLOAD="{${ATTENDEE_JSON}${DESC_JSON}${LOC_JSON}\"summary\":\"${TITLE}\",\"start\":${START_JSON},\"end\":${END_JSON}}"

if [[ -n "$DRY_RUN" ]]; then
    echo "=== DRY RUN ==="
    echo "Payload:"
    echo "$PAYLOAD" | jq '.'
    exit 0
fi

log "Creating event: $TITLE"
RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "https://www.googleapis.com/calendar/v3/calendars/primary/events")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "Error: $(echo "$RESPONSE" | jq -r '.error.message')" >&2
    exit 1
fi

EVENT_ID=$(echo "$RESPONSE" | jq -r '.id')
log "Event created! ID: $EVENT_ID"
echo "$RESPONSE" | jq '{id: .id, summary: .summary, start: .start, end: .end, htmlLink: .htmlLink}'
