#!/usr/bin/env bash
# Create a task in Google Tasks
# Usage: create_task.sh -t "Task Title" [options]
#   -t, --title TITLE        Task title (required)
#   -l, --list ID            Task list ID (default: default list)
#   -n, --notes TEXT         Task notes
#   -d, --due DATE           Due date (YYYY-MM-DD or ISO 8601)
#   --dry-run                Preview without creating

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN=$(get_token) || exit 1

TITLE=""
LIST_ID="default"
NOTES=""
DUE=""
DRY_RUN=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -t|--title) TITLE="$2"; shift 2 ;;
        -l|--list) LIST_ID="$2"; shift 2 ;;
        -n|--notes) NOTES="$2"; shift 2 ;;
        -d|--due) DUE="$2"; shift 2 ;;
        --dry-run) DRY_RUN="1"; shift ;;
        -h|--help)
            echo "Usage: $0 -t TITLE [options]"
            echo "  -t, --title TITLE    Task title (required)"
            echo "  -l, --list ID        Task list ID (default: default)"
            echo "  -n, --notes TEXT     Task notes"
            echo "  -d, --due DATE       Due date (YYYY-MM-DD)"
            echo "  --dry-run            Preview without creating"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

if [[ -z "$TITLE" ]]; then
    echo "Error: -t (title) is required"
    exit 1
fi

# Build JSON payload
PAYLOAD="{\"title\":\"${TITLE}\"}"

if [[ -n "$NOTES" ]]; then
    ESC_NOTES=$(echo "$NOTES" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr '\n' ' ')
    PAYLOAD=$(echo "$PAYLOAD" | jq --arg notes "$ESC_NOTES" '. + {notes: $notes}')
fi

if [[ -n "$DUE" ]]; then
    # Ensure ISO format
    if [[ "$DUE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
        DUE="${DUE}T00:00:00Z"
    fi
    PAYLOAD=$(echo "$PAYLOAD" | jq --arg due "$DUE" '. + {due: $due}')
fi

if [[ -n "$DRY_RUN" ]]; then
    echo "=== DRY RUN ==="
    echo "List: $LIST_ID"
    echo "$PAYLOAD" | jq '.'
    exit 0
fi

log "Creating task: $TITLE"
RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "https://tasks.googleapis.com/v1/lists/${LIST_ID}/tasks")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "Error: $(echo "$RESPONSE" | jq -r '.error.message')" >&2
    exit 1
fi

TASK_ID=$(echo "$RESPONSE" | jq -r '.id')
log "Task created! ID: $TASK_ID"
echo "$RESPONSE" | jq '{id: .id, title: .title, due: .due, notes: .notes}'
