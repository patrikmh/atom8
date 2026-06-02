#!/usr/bin/env bash
# Delete a task in Google Tasks
# Usage: delete_task.sh <task_id> [list_id]

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

log "Deleting task: $TASK_ID"
RESPONSE=$(curl -s -X DELETE \
    -H "Authorization: Bearer ${TOKEN}" \
    -w "\n%{http_code}" \
    "https://tasks.googleapis.com/v1/lists/${LIST_ID}/tasks/${TASK_ID}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "204" ]]; then
    log "Task deleted successfully!"
    echo "{\"status\": \"deleted\", \"taskId\": \"${TASK_ID}\"}" | jq '.'
else
    echo "Error: HTTP $HTTP_CODE" >&2
    if [[ -n "$BODY" ]]; then
        echo "$BODY" | jq -r '.error.message' >&2
    fi
    exit 1
fi
