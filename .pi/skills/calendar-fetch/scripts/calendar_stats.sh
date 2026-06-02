#!/usr/bin/env bash
# Calendar statistics and analytics
# Usage: calendar_stats.sh [options]
#   -d, --days N             Analyze last N days (default: 30)
#   --busy-ratio             Show busy/free ratio
#   --by-day                 Events by day of week
#   --by-hour                Events by hour of day
#   --top-attendees          Most frequent attendees

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN=$(get_token) || exit 1

DAYS=30
MODE="overview"

while [[ $# -gt 0 ]]; do
    case "$1" in
        -d|--days) DAYS="$2"; shift 2 ;;
        --busy-ratio) MODE="busy"; shift ;;
        --by-day) MODE="day"; shift ;;
        --by-hour) MODE="hour"; shift ;;
        --top-attendees) MODE="attendees"; shift ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo "  -d, --days N         Analyze last N days (default: 30)"
            echo "  --busy-ratio         Show busy/free time ratio"
            echo "  --by-day             Events by day of week"
            echo "  --by-hour            Events by hour"
            echo "  --top-attendees      Most frequent attendees"
            exit 0
            ;;
        *) shift ;;
    esac
done

# Calculate date range
START=$(date -u -v-${DAYS}d "+%Y-%m-%dT00:00:00Z" 2>/dev/null || date -u -d "-${DAYS} days" "+%Y-%m-%dT00:00:00Z")
END=$(date -u "+%Y-%m-%dT23:59:59Z")

# Fetch events
URL="https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${START}&timeMax=${END}&maxResults=2500&singleEvents=true&orderBy=startTime"

log "Fetching events for last $DAYS days..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")

check_error "$RESPONSE" "Events" || exit 1

EVENTS=$(echo "$RESPONSE" | jq '.items // []')
EVENT_COUNT=$(echo "$EVENTS" | jq 'length')

# Calculate total hours
TOTAL_HOURS=$(echo "$EVENTS" | jq '
    [ .[] | select(.start.dateTime and .end.dateTime) |
        ((.end.dateTime | strptime("%Y-%m-%dT%H:%M:%S%z") | mktime) -
         (.start.dateTime | strptime("%Y-%m-%dT%H:%M:%S%z") | mktime)) / 3600
    ] | add // 0
')

# Count all-day events
ALL_DAY_COUNT=$(echo "$EVENTS" | jq '[.[] | select(.start.date)] | length')

# Count recurring events
RECURRING_COUNT=$(echo "$EVENTS" | jq '[.[] | select(.recurringEventId)] | length')

# Count events with attendees
WITH_ATTENDEES=$(echo "$EVENTS" | jq '[.[] | select(.attendees)] | length')

# Count cancelled events
CANCELLED=$(echo "$EVENTS" | jq '[.[] | select(.status == "cancelled")] | length')

# Get unique attendees
ATTENDEES_LIST=$(echo "$EVENTS" | jq '
    [ .[] | select(.attendees) | .attendees[] | .email ] | group_by(.) |
    map({email: .[0], count: length}) | sort_by(.count) | reverse
')

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                 CALENDAR STATISTICS                            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Period: $START to $END ($DAYS days)"
echo ""
echo "┌─ OVERVIEW ──────────────────────────────────────────────────┐"
printf "│ %-40s %10s │\n" "Total Events:" "$EVENT_COUNT"
printf "│ %-40s %10s │\n" "All-day Events:" "$ALL_DAY_COUNT"
printf "│ %-40s %10s │\n" "Recurring Instances:" "$RECURRING_COUNT"
printf "│ %-40s %10s │\n" "Events with Attendees:" "$WITH_ATTENDEES"
printf "│ %-40s %10s │\n" "Cancelled Events:" "$CANCELLED"
printf "│ %-40s %10.1f │\n" "Total Hours in Meetings:" "$TOTAL_HOURS"
printf "│ %-40s %10.1f │\n" "Avg Hours per Day:" "$(awk "BEGIN {printf \"%.1f\", $TOTAL_HOURS/$DAYS}")"
echo "└───────────────────────────────────────────────────────────────┘"

if [[ "$MODE" == "busy" ]]; then
    echo ""
    echo "┌─ BUSY/FREE RATIO ───────────────────────────────────────────┐"
    TOTAL_MINUTES=$(awk "BEGIN {printf \"%.0f\", $TOTAL_HOURS * 60}")
    DAY_MINUTES=$((DAYS * 8 * 60))  # 8-hour work days
    FREE_MINUTES=$((DAY_MINUTES - TOTAL_MINUTES))
    if [[ $FREE_MINUTES -lt 0 ]]; then FREE_MINUTES=0; fi
    printf "│ %-40s %10s │\n" "Busy minutes:" "$TOTAL_MINUTES"
    printf "│ %-40s %10s │\n" "Free minutes (8h days):" "$FREE_MINUTES"
    printf "│ %-40s %10s │\n" "Busy ratio:" "$(awk "BEGIN {printf \"%.1f%%\", $TOTAL_MINUTES/$DAY_MINUTES*100}")"
    echo "└───────────────────────────────────────────────────────────────┘"
fi

if [[ "$MODE" == "attendees" ]]; then
    echo ""
    echo "┌─ TOP ATTENDEES ─────────────────────────────────────────────┐"
    echo "$ATTENDEES_LIST" | jq -r '.[0:10] | .[] | "\(.count)\t\(.email)"' | while IFS=$'\t' read -r count email; do
        printf "│ %-6s %-49s │\n" "$count" "$email"
    done
    echo "└───────────────────────────────────────────────────────────────┘"
fi

if [[ "$MODE" == "day" ]]; then
    echo ""
    echo "┌─ EVENTS BY DAY OF WEEK ─────────────────────────────────────┐"
    echo "$EVENTS" | jq '
        group_by(.start.dateTime | strptime("%Y-%m-%dT%H:%M:%S%z") | mktime | strftime("%A")) |
        map({day: .[0].start.dateTime | strptime("%Y-%m-%dT%H:%M:%S%z") | mktime | strftime("%A"), count: length}) |
        sort_by(.count) | reverse
    ' | jq -r '.[] | "\(.count)\t\(.day)"' | while IFS=$'\t' read -r count day; do
        printf "│ %-6s %-49s │\n" "$count" "$day"
    done
    echo "└───────────────────────────────────────────────────────────────┘"
fi
