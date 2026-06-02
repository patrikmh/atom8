#!/usr/bin/env bash
# List all Google Calendars.
# Usage: ./fetch_calendars.sh [FORMAT]
# Formats: json (default), table, csv, tsv, markdown, compact

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

FORMAT="${1:-${GSKILL_FORMAT:-json}}"

TOKEN=$(get_token) || exit 1

log_debug "Fetching calendar list..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
  "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100")

check_error "$RESPONSE" "Calendar list" || exit 1

CALENDARS=$(echo "$RESPONSE" | jq '[.items[] | {
  id,
  summary,
  description: (.description // "" | .[0:100]),
  primary: (.primary // false),
  selected: (.selected // false),
  accessRole: (.accessRole // ""),
  timeZone: (.timeZone // ""),
  backgroundColor: (.backgroundColor // ""),
  foregroundColor: (.foregroundColor // "")
}]')

format_output "$CALENDARS" "$FORMAT" "id summary primary accessRole timeZone"
