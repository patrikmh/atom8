#!/usr/bin/env bash
# Fetch a complete Gmail message with all headers and body content.
# Usage: ./fetch_full_message.sh MESSAGE_ID [FORMAT]
# Formats: json (default), table, compact, markdown
#
# Example:
#   ./fetch_full_message.sh 19e89a0885aec798
#   ./fetch_full_message.sh 19e89a0885aec798 markdown

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

MSG_ID="${1:-}"
FORMAT="${2:-${GSKILL_FORMAT:-json}}"

if [[ -z "$MSG_ID" ]]; then
  log_err "Usage: $(basename "$0") MESSAGE_ID [FORMAT]"
  exit 1
fi

TOKEN=$(get_token) || exit 1

log_debug "Fetching full message $MSG_ID..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/${MSG_ID}?format=full")

check_error "$RESPONSE" "Message $MSG_ID" || exit 1

# Extract headers
HEADERS=$(echo "$RESPONSE" | jq '.payload.headers')
SUBJECT=$(echo "$HEADERS" | jq -r 'map(select(.name=="Subject"))[0].value // "No Subject"')
FROM=$(echo "$HEADERS" | jq -r 'map(select(.name=="From"))[0].value // ""')
TO=$(echo "$HEADERS" | jq -r 'map(select(.name=="To"))[0].value // ""')
CC=$(echo "$HEADERS" | jq -r 'map(select(.name=="Cc"))[0].value // ""')
DATE=$(echo "$HEADERS" | jq -r 'map(select(.name=="Date"))[0].value // ""')
REPLY_TO=$(echo "$HEADERS" | jq -r 'map(select(.name=="Reply-To"))[0].value // ""')
MESSAGE_ID_HDR=$(echo "$HEADERS" | jq -r 'map(select(.name=="Message-Id"))[0].value // ""')

# Parse From
read -r FROM_NAME FROM_EMAIL <<< "$(parse_email_from "$FROM")"

# Extract body parts
PARTS=$(echo "$RESPONSE" | jq '[.payload.parts // [.payload] | .[] | {mimeType, body: {data: .body.data, size: .body.size, attachmentId: .body.attachmentId}, filename}]')

# Build output
OUTPUT=$(jq -n \
  --arg id "$MSG_ID" \
  --arg subject "$SUBJECT" \
  --arg from_name "$FROM_NAME" \
  --arg from_email "$FROM_EMAIL" \
  --arg to "$TO" \
  --arg cc "$CC" \
  --arg date "$DATE" \
  --arg reply_to "$REPLY_TO" \
  --arg message_id "$MESSAGE_ID_HDR" \
  --arg snippet "$(echo "$RESPONSE" | jq -r '.snippet // ""')" \
  --argjson size "$(echo "$RESPONSE" | jq '.sizeEstimate')" \
  --argjson labelIds "$(echo "$RESPONSE" | jq '.labelIds')" \
  --argjson threadId "$(echo "$RESPONSE" | jq '.threadId')" \
  --argjson parts "$PARTS" \
  '{
    id: $id,
    thread_id: $threadId,
    subject: $subject,
    from_name: $from_name,
    from_email: $from_email,
    to: $to,
    cc: $cc,
    date: $date,
    reply_to: $reply_to,
    message_id: $message_id,
    snippet: $snippet,
    size: $size,
    labels: $labelIds,
    parts: $parts
  }')

format_output "$OUTPUT" "$FORMAT" "id subject from_email date size labels"
