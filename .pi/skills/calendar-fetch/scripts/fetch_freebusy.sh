#!/usr/bin/env bash
# Check free/busy slots for a Google Calendar.
# Usage: ./fetch_freebusy.sh [OPTIONS]
# Options:
#   -d DATE      Date (YYYY-MM-DD or "today", default: today)
#   -c CALENDAR  Calendar ID (default: primary)
#   -f FORMAT    Output format: json, table, csv, tsv, markdown, compact
#   -v           Verbose
#   -h           Show help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

DATE="today"
CALENDAR="primary"
FORMAT="${GSKILL_FORMAT:-json}"
VERBOSE=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -d DATE      Date (YYYY-MM-DD or "today")
  -c CALENDAR  Calendar ID (default: primary)
  -f FORMAT    Output format
  -v           Verbose
  -h           Show help

Examples:
  $(basename "$0")
  $(basename "$0") -d 2026-06-10
  $(basename "$0") -c "work@example.com"
EOF
  exit 0
}

while getopts "d:c:f:vh" opt; do
  case $opt in
    d) DATE="$OPTARG" ;;
    c) CALENDAR="$OPTARG" ;;
    f) FORMAT="$OPTARG" ;;
    v) VERBOSE=true ;;
    h) usage ;;
    *) usage ;;
  esac
done

[[ "$VERBOSE" == true ]] && enable_verbose

[[ "$DATE" == "today" ]] && DATE=$(date_iso)

TIME_MIN=$(date_start_of_day "$DATE")
TIME_MAX=$(date_end_of_day "$DATE")

TOKEN=$(get_token) || exit 1

log_debug "Checking free/busy for $CALENDAR on $DATE..."

BODY=$(jq -n \
  --arg timeMin "$TIME_MIN" \
  --arg timeMax "$TIME_MAX" \
  --arg calendarId "$CALENDAR" \
  '{timeMin: $timeMin, timeMax: $timeMax, items: [{id: $calendarId}]}')

RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  "https://www.googleapis.com/calendar/v3/freeBusy" \
  -d "$BODY")

check_error "$RESPONSE" "Free/busy" || exit 1

# Extract busy slots
BUSY=$(echo "$RESPONSE" | jq --arg cal "$CALENDAR" '.calendars[$cal].busy // []')

# Transform busy slots
RESULT=$(echo "$BUSY" | jq '[.[] | {
  start: .start,
  end: .end,
  duration: ((.end | fromdateiso8601) - (.start | fromdateiso8601)) | strftime("%H:%M:%S")
}]')

# Also include free slots summary
OUTPUT=$(jq -n --arg calendar "$CALENDAR" --arg date "$DATE" \
  --argjson busy "$BUSY" --argjson busy_count "$(echo "$BUSY" | jq 'length')" \
  '{
    calendar: $calendar,
    date: $date,
    busy_slots: $busy_count,
    busy_periods: $busy
  }')

format_output "$OUTPUT" "$FORMAT" "calendar date busy_slots"
