#!/usr/bin/env bash
# Fetch tasks from a specific Google Tasks list.
# Usage: ./fetch_tasklist.sh [OPTIONS]
# Options:
#   -i ID       Task list ID (required)
#   -f FORMAT   Output format: json, table, csv, tsv, markdown, compact (default: json)
#   -c          Show completed tasks
#   -v          Verbose
#   -h          Show help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

LIST_ID=""
FORMAT="${GSKILL_FORMAT:-json}"
SHOW_COMPLETED=false
VERBOSE=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -i ID       Task list ID (required)
  -f FORMAT   Output format
  -c          Show completed tasks
  -v          Verbose
  -h          Show help

Examples:
  $(basename "$0") -i abc123
  $(basename "$0") -i abc123 -c -f table
EOF
  exit 0
}

while getopts "i:f:cvh" opt; do
  case $opt in
    i) LIST_ID="$OPTARG" ;;
    f) FORMAT="$OPTARG" ;;
    c) SHOW_COMPLETED=true ;;
    v) VERBOSE=true ;;
    h) usage ;;
    *) usage ;;
  esac
done

[[ -z "$LIST_ID" ]] && { log_err "List ID required (-i)"; usage; }
[[ "$VERBOSE" == true ]] && enable_verbose

TOKEN=$(get_token) || exit 1

SHOW_PARAM="false"
[[ "$SHOW_COMPLETED" == true ]] && SHOW_PARAM="true"

log_debug "Fetching tasks from list $LIST_ID..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
  "https://tasks.googleapis.com/tasks/v1/lists/${LIST_ID}/tasks?maxResults=100&showCompleted=${SHOW_PARAM}")

check_error "$RESPONSE" "Tasks list $LIST_ID" || exit 1

TASKS=$(echo "$RESPONSE" | jq '[.items[] | {
  id,
  title: (.title // "Untitled"),
  completed: (.status == "completed"),
  due: (.due // ""),
  notes: (.notes // ""),
  parent: (.parent // ""),
  position: (.position // ""),
  updated: (.updated // "")
}]')

format_output "$TASKS" "$FORMAT" "id title completed due updated"
