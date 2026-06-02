#!/usr/bin/env bash
# Tasks statistics and analytics
# Usage: tasks_stats.sh [list_id]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN=$(get_token) || exit 1

LIST_ID="${1:-default}"

log "Fetching tasks statistics..."
TASKS=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "https://tasks.googleapis.com/v1/lists/${LIST_ID}/tasks")

check_error "$TASKS" "Tasks" || exit 1

ALL_TASKS=$(echo "$TASKS" | jq '.items // []')
TOTAL=$(echo "$ALL_TASKS" | jq 'length')
COMPLETED=$(echo "$ALL_TASKS" | jq '[.[] | select(.status == "completed")] | length')
PENDING=$((TOTAL - COMPLETED))

# Overdue tasks
TODAY=$(date -u "+%Y-%m-%dT00:00:00.000Z")
OVERDUE=$(echo "$ALL_TASKS" | jq --arg today "$TODAY" '[.[] | select(.status != "completed" and .due and .due < $today)] | length')

# Tasks with due dates
WITH_DUE=$(echo "$ALL_TASKS" | jq '[.[] | select(.due)] | length')
WITHOUT_DUE=$((TOTAL - WITH_DUE))

# Tasks with notes
WITH_NOTES=$(echo "$ALL_TASKS" | jq '[.[] | select(.notes and .notes != "")] | length')

# Completion rate
if [[ $TOTAL -gt 0 ]]; then
    COMPLETION_RATE=$(awk "BEGIN {printf \"%.1f\", $COMPLETED/$TOTAL*100}")
else
    COMPLETION_RATE="0.0"
fi

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                   TASKS STATISTICS                            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "List: $LIST_ID"
echo ""
echo "┌─ OVERVIEW ──────────────────────────────────────────────────┐"
printf "│ %-40s %10s │\n" "Total tasks:" "$TOTAL"
printf "│ %-40s %10s │\n" "Completed:" "$COMPLETED"
printf "│ %-40s %10s │\n" "Pending:" "$PENDING"
printf "│ %-40s %10s │\n" "Overdue:" "$OVERDUE"
printf "│ %-40s %10s │\n" "With due date:" "$WITH_DUE"
printf "│ %-40s %10s │\n" "Without due date:" "$WITHOUT_DUE"
printf "│ %-40s %10s │\n" "With notes:" "$WITH_NOTES"
printf "│ %-40s %10s │\n" "Completion rate:" "${COMPLETION_RATE}%"
echo "└───────────────────────────────────────────────────────────────┘"

# Show oldest pending task
if [[ $PENDING -gt 0 ]]; then
    OLDEST=$(echo "$ALL_TASKS" | jq '[.[] | select(.status != "completed")] | sort_by(.updated) | .[0]')
    if [[ "$OLDEST" != "null" && -n "$OLDEST" ]]; then
        echo ""
        echo "┌─ OLDEST PENDING TASK ───────────────────────────────────────┐"
        printf "│ %-40s %-20s │\n" "$(echo "$OLDEST" | jq -r '.title // "Unknown"')" "$(echo "$OLDEST" | jq -r '.updated // ""')"
        echo "└───────────────────────────────────────────────────────────────┘"
    fi
fi
