#!/usr/bin/env bash
# Get Gmail unread count.
# Usage: ./fetch_unread_count.sh [FORMAT]
# Formats: json (default), table, compact

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

FORMAT="${1:-${GSKILL_FORMAT:-json}}"

TOKEN=$(get_token) || exit 1

log_debug "Fetching unread count..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
  "https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX")

check_error "$RESPONSE" "Inbox label" || exit 1

OUTPUT=$(echo "$RESPONSE" | jq '{
  label: .name,
  total_messages: (.messagesTotal // 0),
  unread_messages: (.messagesUnread // 0),
  total_threads: (.threadsTotal // 0),
  unread_threads: (.threadsUnread // 0)
}')

format_output "$OUTPUT" "$FORMAT" "label unread_messages total_messages"
