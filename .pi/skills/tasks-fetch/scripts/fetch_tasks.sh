#!/usr/bin/env bash
# Comprehensive Google Tasks fetcher via bash + curl + jq.
# Fetches all tasks from all task lists.
# Usage: ./fetch_tasks.sh [OPTIONS]
# Options:
#   -f FORMAT   Output format: json, table, csv, tsv, markdown, compact (default: json)
#   -v          Verbose
#   -h          Show help
#
# Examples:
#   ./fetch_tasks.sh
#   ./fetch_tasks.sh -f markdown
#   ./fetch_tasks.sh -f compact

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

FORMAT="${GSKILL_FORMAT:-json}"
VERBOSE=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -f FORMAT   Output format: json, table, csv, tsv, markdown, compact
  -v          Verbose
  -h          Show help

Examples:
  $(basename "$0")
  $(basename "$0") -f markdown
  $(basename "$0") -f compact
EOF
  exit 0
}

while getopts "f:vh" opt; do
  case $opt in
    f) FORMAT="$OPTARG" ;;
    v) VERBOSE=true ;;
    h) usage ;;
    *) usage ;;
  esac
done

[[ "$VERBOSE" == true ]] && enable_verbose

TOKEN=$(get_token) || exit 1

# Step 1: Get all task lists
LISTS_RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
  "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100")

if ! check_error "$LISTS_RESPONSE" "Task lists" >/dev/null 2>&1; then
  log_err "Failed to fetch task lists"
  exit 1
fi

TASK_LISTS=$(echo "$LISTS_RESPONSE" | jq '.items // []')

# Step 2: Fetch tasks from each list
ALL_TASKS="[]"
IDS=$(echo "$TASK_LISTS" | jq -r '.[]?.id // empty')
for LID in $IDS; do
  TITLE=$(echo "$TASK_LISTS" | jq -r ".[] | select(.id == \"$LID\") | .title // \"Untitled\"")
  TASKS_RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "https://tasks.googleapis.com/tasks/v1/lists/${LID}/tasks?maxResults=100&showCompleted=true")

  if ! check_error "$TASKS_RESPONSE" "Tasks for $TITLE" >/dev/null 2>&1; then
    log_warn "Failed to fetch tasks for list \"$TITLE\", skipping"
    continue
  fi

  ITEMS=$(echo "$TASKS_RESPONSE" | jq '.items // []')
  ITEMS_COUNT=$(echo "$ITEMS" | jq 'length')
  log_debug "List \"$TITLE\": $ITEMS_COUNT task(s)"

  # Use jq to transform all items at once
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
log_debug "Total tasks: $TOTAL_COUNT"

format_output "$ALL_TASKS" "$FORMAT" "id title completed due list"
