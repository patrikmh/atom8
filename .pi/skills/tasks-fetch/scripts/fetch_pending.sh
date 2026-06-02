#!/usr/bin/env bash
# Fetch only pending (incomplete) tasks from all Google Tasks lists.
# Usage: ./fetch_pending.sh [OPTIONS]
# Options:
#   -f FORMAT   Output format: json, table, csv, tsv, markdown, compact (default: json)
#   -v          Verbose
#   -h          Show help

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

# Get all task lists
LISTS_RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
  "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100")

if ! check_error "$LISTS_RESPONSE" "Task lists" >/dev/null 2>&1; then
  log_err "Failed to fetch task lists"
  exit 1
fi

TASK_LISTS=$(echo "$LISTS_RESPONSE" | jq '.items // []')

# Fetch pending tasks from each list
ALL_TASKS="[]"
IDS=$(echo "$TASK_LISTS" | jq -r '.[]?.id // empty')
for LID in $IDS; do
  TITLE=$(echo "$TASK_LISTS" | jq -r ".[] | select(.id == \"$LID\") | .title // \"Untitled\"")
  TASKS_RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "https://tasks.googleapis.com/tasks/v1/lists/${LID}/tasks?maxResults=100&showCompleted=false")

  if ! check_error "$TASKS_RESPONSE" "Tasks for $TITLE" >/dev/null 2>&1; then
    continue
  fi

  ITEMS=$(echo "$TASKS_RESPONSE" | jq '.items // []')
  ITEMS_COUNT=$(echo "$ITEMS" | jq 'length')
  log_debug "List \"$TITLE\": $ITEMS_COUNT pending task(s)"

  ALL_TASKS=$(echo "$ITEMS" | jq --arg list "$TITLE" \
    '[.[] | {
      id,
      title: (.title // "Untitled"),
      completed: false,
      due: (.due // ""),
      notes: (.notes // ""),
      list: $list,
      parent: (.parent // ""),
      position: (.position // ""),
      updated: (.updated // "")
    }] + $prev' --argjson prev "$ALL_TASKS")
done

TOTAL_COUNT=$(count_results "$ALL_TASKS")
log_debug "Total pending tasks: $TOTAL_COUNT"

format_output "$ALL_TASKS" "$FORMAT" "id title due list"
