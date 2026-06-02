#!/usr/bin/env bash
# Fetch Gmail messages with attachments.
# Usage: ./fetch_attachments.sh [OPTIONS]
# Options:
#   -n COUNT    Number of emails (default: 10)
#   -q QUERY    Additional Gmail query
#   -f FORMAT   Output format: json, table, csv, tsv, markdown, compact (default: json)
#   -v          Verbose
#   -h          Show help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

COUNT=10
QUERY=""
FORMAT="${GSKILL_FORMAT:-json}"
VERBOSE=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -n COUNT    Number of emails (default: 10)
  -q QUERY    Additional Gmail search query
  -f FORMAT   Output format
  -v          Verbose
  -h          Show help

Examples:
  $(basename "$0") -n 10
  $(basename "$0") -n 20 -q "from:boss@example.com"
EOF
  exit 0
}

while getopts "n:q:f:vh" opt; do
  case $opt in
    n) COUNT="$OPTARG" ;;
    q) QUERY="$OPTARG" ;;
    f) FORMAT="$OPTARG" ;;
    v) VERBOSE=true ;;
    h) usage ;;
    *) usage ;;
  esac
done

[[ "$VERBOSE" == true ]] && enable_verbose

TOKEN=$(get_token) || exit 1

GQUERY="has:attachment"
[[ -n "$QUERY" ]] && GQUERY="${GQUERY} ${QUERY}"

URL="https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${COUNT}&q=$(urlencode "$GQUERY")"

log_debug "Fetching messages with attachments..."
LIST=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")
check_error "$LIST" "Attachment list" || exit 1

EMAILS="[]"
IDS=$(echo "$LIST" | jq -r '.messages[].id // empty')
for ID in $IDS; do
  log_verbose "Fetching message $ID"
  DETAIL=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/${ID}?format=full")

  if ! check_error "$DETAIL" "Message $ID" >/dev/null 2>&1; then
    continue
  fi

  HEADERS=$(echo "$DETAIL" | jq '.payload.headers')
  SUBJECT=$(echo "$HEADERS" | jq -r 'map(select(.name=="Subject"))[0].value // "No Subject"')
  FROM=$(echo "$HEADERS" | jq -r 'map(select(.name=="From"))[0].value // ""')
  DATE=$(echo "$HEADERS" | jq -r 'map(select(.name=="Date"))[0].value // ""')
  SIZE=$(echo "$DETAIL" | jq -r '.sizeEstimate // 0')

  # Extract attachments
  ATTACHMENTS=$(echo "$DETAIL" | jq '[.payload.parts // [] | .[] | select(.body.attachmentId != null) | {
    filename: .filename,
    mimeType: .mimeType,
    size: .body.size,
    attachmentId: .body.attachmentId
  }]')

  read -r FROM_NAME FROM_EMAIL <<< "$(parse_email_from "$FROM")"
  SIZE_HR=$(format_size "$SIZE")
  ATT_COUNT=$(echo "$ATTACHMENTS" | jq 'length')

  EMAILS=$(echo "$EMAILS" | jq \
    --arg id "$ID" \
    --arg subject "$SUBJECT" \
    --arg from_email "$FROM_EMAIL" \
    --arg from_name "$FROM_NAME" \
    --arg date "$DATE" \
    --arg size "$SIZE_HR" \
    --argjson attachments "$ATTACHMENTS" \
    --argjson att_count "$ATT_COUNT" \
    '. + [{id: $id, subject: $subject, from_email: $from_email, from_name: $from_name, date: $date, size: $size, attachments: $attachments, attachment_count: $att_count}]')
done

format_output "$EMAILS" "$FORMAT" "id subject from_email date size attachment_count"
