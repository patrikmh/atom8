#!/usr/bin/env bash
# Fetch a specific Google Calendar event by ID.
# Usage: ./fetch_event.sh EVENT_ID [CALENDAR_ID] [FORMAT]
# Default calendar: primary

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

EVENT_ID="${1:-}"
CALENDAR="${2:-primary}"
FORMAT="${3:-${GSKILL_FORMAT:-json}}"

if [[ -z "$EVENT_ID" ]]; then
  log_err "Usage: $(basename "$0") EVENT_ID [CALENDAR_ID] [FORMAT]"
  exit 1
fi

TOKEN=$(get_token) || exit 1

log_debug "Fetching event $EVENT_ID from calendar $CALENDAR..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
  "https://www.googleapis.com/calendar/v3/calendars/${CALENDAR}/events/${EVENT_ID}")

check_error "$RESPONSE" "Event $EVENT_ID" || exit 1

# Extract attendees
ATTENDEES=$(echo "$RESPONSE" | jq '[.attendees[]? | {
  email: .email,
  name: .displayName,
  response: .responseStatus,
  optional: (.optional // false)
}]')

# Build output
OUTPUT=$(echo "$RESPONSE" | jq \
  --arg calendar "$CALENDAR" \
  --argjson attendees "$ATTENDEES" \
  '{
    id: .id,
    summary: (.summary // "No Title"),
    description: (.description // ""),
    location: (.location // ""),
    start: (.start.dateTime // .start.date // ""),
    end: (.end.dateTime // .end.date // ""),
    status: (.status // ""),
    organizer: (.organizer.email // .organizer.displayName // ""),
    attendees: $attendees,
    attendee_count: ($attendees | length),
    created: .created,
    updated: .updated,
    recurrence: (.recurrence // []),
    color: (.colorId // ""),
    visibility: (.visibility // ""),
    link: (.htmlLink // ""),
    calendar: $calendar
  }')

format_output "$OUTPUT" "$FORMAT" "id summary start end location attendee_count organizer"
