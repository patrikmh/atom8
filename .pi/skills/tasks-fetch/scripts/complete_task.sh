#!/usr/bin/env bash
# Complete a task in Google Tasks
# Usage: complete_task.sh <task_id> [list_id]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN=$(get_token) || exit 1

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <task_id> [list_id]"
    echo "  task_id: Task ID from fetch_tasks.sh"
    echo "  list_id: Task list ID (default: default)"
    exit 1
fi

TASK_ID="$1"
LIST_ID="${2:-default}"

PAYLOAD='{"status":"completed"}'

log "Completing task: $TASK_ID"
RESPONSE=$(curl -s -X PATCH \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "https://tasks.googleapis.com/v1/lists/${LIST_ID}/tasks/${TASK_ID}")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "Error: $(echo "$RESPONSE" | jq -r '.error.message')" >&2
    exit 1
fi

log "Task completed!"
echo "$RESPONSE" | jq '{id: .id, title: .title, status: .status, completed: .completed}'
