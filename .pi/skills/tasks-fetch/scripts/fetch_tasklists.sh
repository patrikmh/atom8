#!/usr/bin/env bash
# List all Google Tasks lists.
# Usage: ./fetch_tasklists.sh [FORMAT]
# Formats: json (default), table, csv, tsv, markdown, compact

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

FORMAT="${1:-${GSKILL_FORMAT:-json}}"

TOKEN=$(get_token) || exit 1

log_debug "Fetching task lists..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
  "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100")

check_error "$RESPONSE" "Task lists" || exit 1

LISTS=$(echo "$RESPONSE" | jq '[.items[] | {
  id,
  title: (.title // "Untitled"),
  updated: (.updated // "")
}]')

format_output "$LISTS" "$FORMAT" "id title updated"
