#!/usr/bin/env bash
# Fetch Gmail labels.
# Usage: ./fetch_labels.sh [FORMAT]
# Formats: json (default), table, csv, tsv, markdown, compact

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

FORMAT="${1:-${GSKILL_FORMAT:-json}}"

TOKEN=$(get_token) || exit 1

log_debug "Fetching labels..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
  "https://gmail.googleapis.com/gmail/v1/users/me/labels")

check_error "$RESPONSE" "Labels" || exit 1

LABELS=$(echo "$RESPONSE" | jq '[.labels[] | {
  id,
  name,
  type,
  messagesTotal: (.messagesTotal // 0),
  messagesUnread: (.messagesUnread // 0),
  threadsTotal: (.threadsTotal // 0),
  threadsUnread: (.threadsUnread // 0)
}]')

format_output "$LABELS" "$FORMAT" "id name type messagesTotal messagesUnread"
