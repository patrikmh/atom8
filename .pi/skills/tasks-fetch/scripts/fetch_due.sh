#!/usr/bin/env bash
# Fetch tasks with due dates from all Google Tasks lists.
# Usage: ./fetch_due.sh [OPTIONS]
# Options:
#   -d DATE     Due date (YYYY-MM-DD or "today", default: today)
#   -f FORMAT   Output format: json, table, csv, tsv, markdown, compact (default: json)
#   -v          Verbose
#   -h          Show help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

DATE="today"
FORMAT="${GSKILL_FORMAT:-json}"
VERBOSE=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -d DATE     Due date (YYYY-MM-DD or "today")
  -f FORMAT   Output format: json, table, csv, tsv, markdown, compact
  -v          Verbose
  -h          Show help

Examples:
  $(basename "$0")
  $(basename "$0") -d 2026-06-10
  $(basename "$0") -f table
EOF
  exit 0
}

while getopts "d:f:vh" opt; do
  case $opt in
    d) DATE="$OPTARG" ;;
    f) FORMAT="$OPTARG" ;;
    v) VERBOSE=true ;;
    h) usage ;;
    *) usage ;;
  esac
done

[[ "$DATE" == "today" ]] && DATE=$(date_iso)
[[ "$VERBOSE" == true ]] && enable_verbose

TOKEN=$(get_token) || exit 1

# Get all task lists
LISTS_RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
  "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100")

if ! check_error "$LISTS_RESPONSE" "Task lists" >/dev/null 2>&1; then
  log_err "Failed to fetch task lists"
  exit 1
fi

TASK_LISTS=$(echo "$LISTS_RESPONSE" | jq '.items // []')

# Fetch tasks with due dates from each list
DUE_MIN="${DATE}T00:00:00.000Z"
ALL_TASKS="[]"
IDS=$(echo "$TASK_LISTS" | jq -r '.[]?.id // empty')
for LID in $IDS; do
  TITLE=$(echo "$TASK_LISTS" | jq -r ".[] | select(.id == \"$LID\") | .title // \"Untitled\"")
  TASKS_RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "https://tasks.googleapis.com/tasks/v1/lists/${LID}/tasks?maxResults=100&showCompleted=false&dueMin=${DUE_MIN}")

  if ! check_error "$TASKS_RESPONSE" "Tasks for $TITLE" >/dev/null 2>&1; then
    continue
  fi

  ITEMS=$(echo "$TASKS_RESPONSE" | jq '.items // []')
  ITEMS_COUNT=$(echo "$ITEMS" | jq 'length')
  log_debug "List \"$TITLE\": $ITEMS_COUNT task(s) due on or after $DATE"

  ALL_TASKS=$(echo "$ITEMS" | jq --arg list "$TITLE" \
    '[.[] | {
      id,
      title: (.title // "Untitled"),
      completed: (.status == "completed"),
      due: (.due // ""),
      notes: (.notes // ""),
      list: $list,
      parent: (.parent // ""),
      position: (.position // ""),
      updated: (.updated // "")
    }] + $prev' --argjson prev "$ALL_TASKS")
done

TOTAL_COUNT=$(count_results "$ALL_TASKS")
log_debug "Total tasks due on or after $DATE: $TOTAL_COUNT"

format_output "$ALL_TASKS" "$FORMAT" "id title due list"
