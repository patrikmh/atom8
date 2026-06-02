#!/usr/bin/env bash
# Comprehensive Google Calendar event fetcher via bash + curl + jq.
# Usage: ./fetch_calendar.sh [OPTIONS]
# Options:
#   -d DATE      Specific date (YYYY-MM-DD or "today")
#   -s START     Start date (YYYY-MM-DD or "today")
#   -e END       End date (YYYY-MM-DD or "+N" for N days from start)
#   -q QUERY     Free-text search query
#   -c CALENDAR  Calendar ID (default: primary)
#   -n COUNT     Max results (default: 10)
#   -f FORMAT    Output format: json, table, csv, tsv, markdown, compact (default: json)
#   -p           Paginate to fetch all results
#   -v           Verbose
#   -h           Show help
#
# Examples:
#   ./fetch_calendar.sh -d today
#   ./fetch_calendar.sh -s today -e +7 -f markdown
#   ./fetch_calendar.sh -q "meeting" -n 20
#   ./fetch_calendar.sh -c "work@example.com" -d today

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

# --- defaults ---
DATE=""
START=""
END=""
QUERY=""
CALENDAR="primary"
COUNT=10
FORMAT="${GSKILL_FORMAT:-json}"
PAGINATE=false
VERBOSE=false

# --- parse args ---
usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -d DATE      Specific date (YYYY-MM-DD or "today")
  -s START     Start date (YYYY-MM-DD or "today")
  -e END       End date (YYYY-MM-DD or "+N" days from start)
  -q QUERY     Free-text search query
  -c CALENDAR  Calendar ID (default: primary)
  -n COUNT     Max results (default: 10)
  -f FORMAT    Output format: json, table, csv, tsv, markdown, compact
  -p           Paginate to fetch all results
  -v           Verbose
  -h           Show help

Examples:
  $(basename "$0") -d today
  $(basename "$0") -s today -e +7 -f markdown
  $(basename "$0") -q "meeting" -n 20
EOF
  exit 0
}

while getopts "d:s:e:q:c:n:f:pvh" opt; do
  case $opt in
    d) DATE="$OPTARG" ;;
    s) START="$OPTARG" ;;
    e) END="$OPTARG" ;;
    q) QUERY="$OPTARG" ;;
    c) CALENDAR="$OPTARG" ;;
    n) COUNT="$OPTARG" ;;
    f) FORMAT="$OPTARG" ;;
    p) PAGINATE=true ;;
    v) VERBOSE=true ;;
    h) usage ;;
    *) usage ;;
  esac
done

[[ "$VERBOSE" == true ]] && enable_verbose

# --- resolve dates ---
if [[ "$DATE" == "today" ]]; then
  DATE=$(date_iso)
fi
if [[ "$START" == "today" ]]; then
  START=$(date_iso)
fi

# If -d is specified, use it as both start and end
if [[ -n "$DATE" ]]; then
  START="$DATE"
  END="$DATE"
fi

# If only start is specified, default end to start
if [[ -n "$START" && -z "$END" ]]; then
  END="$START"
fi

# If end is +N, compute from start
if [[ "$END" == +* ]]; then
  days=${END#+}
  END=$(date_add_days "$START" "$days")
fi

# Build time range
TIME_MIN=""
TIME_MAX=""
if [[ -n "$START" ]]; then
  TIME_MIN=$(date_start_of_day "$START")
fi
if [[ -n "$END" ]]; then
  TIME_MAX=$(date_end_of_day "$END")
fi

# --- get token ---
TOKEN=$(get_token) || exit 1

# --- build URL ---
URL="https://www.googleapis.com/calendar/v3/calendars/${CALENDAR}/events?maxResults=${COUNT}&orderBy=startTime&singleEvents=true"
[[ -n "$TIME_MIN" ]] && URL="${URL}&timeMin=${TIME_MIN}"
[[ -n "$TIME_MAX" ]] && URL="${URL}&timeMax=${TIME_MAX}"
[[ -n "$QUERY" ]] && URL="${URL}&q=$(urlencode "$QUERY")"

log_debug "URL: ${URL}"

# --- fetch events ---
if [[ "$PAGINATE" == true ]]; then
  EVENTS=$(paginate "$URL" "items" "$TOKEN")
else
  RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")
  check_error "$RESPONSE" "Events list" || exit 1
  EVENTS=$(echo "$RESPONSE" | jq '.items // []')
fi

EVENTS_COUNT=$(count_results "$EVENTS")
log_debug "Found $EVENTS_COUNT events"

# --- transform ---
RESULT=$(echo "$EVENTS" | jq '[.[] | {
  id,
  summary: (.summary // "No Title"),
  start: (.start.dateTime // .start.date // ""),
  end: (.end.dateTime // .end.date // ""),
  location: (.location // ""),
  description: (.description // "" | .[0:200]),
  attendees: ((.attendees // []) | length),
  organizer: (.organizer.email // .organizer.displayName // ""),
  status: (.status // ""),
  link: (.htmlLink // ""),
  calendar: "'"$CALENDAR"'"
}]')

# --- output ---
format_output "$RESULT" "$FORMAT" "id summary start end location attendees organizer"
