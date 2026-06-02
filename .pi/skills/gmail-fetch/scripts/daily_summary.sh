#!/usr/bin/env bash
# Daily summary combining Gmail, Calendar, and Tasks
# Usage: daily_summary.sh [date]
#   date: YYYY-MM-DD (default: today)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN=$(get_token) || exit 1

DATE="${1:-$(date +%Y-%m-%d)}"

# Normalize date
if [[ "$DATE" == "today" ]]; then
    DATE=$(date +%Y-%m-%d)
elif [[ "$DATE" == "tomorrow" ]]; then
    DATE=$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d "tomorrow" +%Y-%m-%d)
fi

START="${DATE}T00:00:00Z"
END="${DATE}T23:59:59Z"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    DAILY SUMMARY                               ║"
echo "║                        $DATE                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# --- EMAILS ---
echo "┌─ EMAILS ──────────────────────────────────────────────────────┐"
EMAIL_URL="https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=after:${DATE} before:${DATE}"
EMAILS=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$EMAIL_URL")
EMAIL_COUNT=$(echo "$EMAILS" | jq '.resultSizeEstimate // 0')
UNREAD_URL="https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=after:${DATE} before:${DATE} is:unread"
UNREAD=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$UNREAD_URL")
UNREAD_COUNT=$(echo "$UNREAD" | jq '.resultSizeEstimate // 0')

printf "│ %-40s %10s │\n" "Emails received:" "$EMAIL_COUNT"
printf "│ %-40s %10s │\n" "Unread emails:" "$UNREAD_COUNT"

# Show latest 3 emails
EMAIL_IDS=$(echo "$EMAILS" | jq -r '.messages[0:3][].id // empty')
if [[ -n "$EMAIL_IDS" ]]; then
    echo "│ Latest emails:"
    for ID in $EMAIL_IDS; do
        DETAIL=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/${ID}?format=metadata")
        SUBJECT=$(echo "$DETAIL" | jq -r '.payload.headers[] | select(.name=="Subject") | .value // "No Subject"')
        FROM=$(echo "$DETAIL" | jq -r '.payload.headers[] | select(.name=="From") | .value // ""')
        read -r FROM_NAME FROM_EMAIL <<< "$(parse_email_from "$FROM")"
        printf "│   • %-40s %-20s │\n" "${SUBJECT:0:40}" "${FROM_NAME:0:20}"
    done
fi
echo "└───────────────────────────────────────────────────────────────┘"
echo ""

# --- CALENDAR ---
echo "┌─ CALENDAR EVENTS ─────────────────────────────────────────────┐"
CAL_URL="https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${START}&timeMax=${END}&singleEvents=true&orderBy=startTime"
EVENTS=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$CAL_URL")
EVENT_COUNT=$(echo "$EVENTS" | jq '.items | length // 0')

printf "│ %-40s %10s │\n" "Events today:" "$EVENT_COUNT"

if [[ "$EVENT_COUNT" -gt 0 ]]; then
    echo "│ Schedule:"
    echo "$EVENTS" | jq -r '.items[] | 
        if .start.dateTime then
            "\(.start.dateTime | split("T")[1] | split("+")[0] | split("-")[0]) - \(.end.dateTime | split("T")[1] | split("+")[0] | split("-")[0]) \t\(.summary)"
        else
            "All day \t\(.summary)"
        end
    ' | while IFS=$'\t' read -r time summary; do
        printf "│   %-20s %-40s │\n" "$time" "${summary:0:40}"
    done
else
    echo "│ No events scheduled"
fi
echo "└───────────────────────────────────────────────────────────────┘"
echo ""

# --- TASKS ---
echo "┌─ TASKS ───────────────────────────────────────────────────────┐"
# Get default task list
LISTS=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "https://tasks.googleapis.com/v1/users/@me/lists")
LIST_ID=$(echo "$LISTS" | jq -r '.items[0].id // "default"')

# Get tasks due today
TASKS=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "https://tasks.googleapis.com/v1/lists/${LIST_ID}/tasks?dueMin=${START}&dueMax=${END}")
TASK_COUNT=$(echo "$TASKS" | jq '.items | length // 0')

# Get pending tasks
PENDING=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "https://tasks.googleapis.com/v1/lists/${LIST_ID}/tasks")
PENDING_COUNT=$(echo "$PENDING" | jq '[.items[] | select(.status != "completed")] | length // 0')

printf "│ %-40s %10s │\n" "Tasks due today:" "$TASK_COUNT"
printf "│ %-40s %10s │\n" "Pending tasks:" "$PENDING_COUNT"

if [[ "$TASK_COUNT" -gt 0 ]]; then
    echo "│ Due today:"
    echo "$TASKS" | jq -r '.items[] | select(.status != "completed") | "  • \(.title)"' | while read -r line; do
        printf "│ %-61s │\n" "${line:0:61}"
    done
fi
echo "└───────────────────────────────────────────────────────────────┘"
echo ""

# --- SUMMARY ---
echo "┌─ DAY SUMMARY ─────────────────────────────────────────────────┐"
printf "│ %-40s %10s │\n" "Total emails:" "$EMAIL_COUNT"
printf "│ %-40s %10s │\n" "Unread emails:" "$UNREAD_COUNT"
printf "│ %-40s %10s │\n" "Calendar events:" "$EVENT_COUNT"
printf "│ %-40s %10s │\n" "Tasks due today:" "$TASK_COUNT"
printf "│ %-40s %10s │\n" "Pending tasks:" "$PENDING_COUNT"
echo "└───────────────────────────────────────────────────────────────┘"
