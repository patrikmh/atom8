#!/usr/bin/env bash
# Comprehensive Gmail email fetcher via bash + curl + jq.
# Usage: ./fetch_gmail.sh [OPTIONS]
# Options:
#   -n COUNT    Number of emails (default: 10)
#   -q QUERY    Gmail search query (default: none)
#   -f FORMAT   Output format: json, table, csv, tsv, markdown, compact (default: json)
#   -p          Paginate to fetch all results
#   -v          Verbose output
#   -h          Show help
#
# Examples:
#   ./fetch_gmail.sh -n 10
#   ./fetch_gmail.sh -n 5 -q "is:unread" -f markdown
#   ./fetch_gmail.sh -q "has:attachment" -p

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

# --- defaults ---
COUNT=10
QUERY=""
FORMAT="${GSKILL_FORMAT:-json}"
PAGINATE=false
VERBOSE=false

# --- parse args ---
usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -n COUNT    Number of emails (default: 10)
  -q QUERY    Gmail search query
  -f FORMAT   Output format: json, table, csv, tsv, markdown, compact (default: json)
  -p          Paginate to fetch all results
  -v          Verbose output
  -h          Show this help

Examples:
  $(basename "$0") -n 10
  $(basename "$0") -n 5 -q "is:unread" -f markdown
  $(basename "$0") -q "has:attachment" -p
EOF
  exit 0
}

while getopts "n:q:f:pv:h" opt; do
  case $opt in
    n) COUNT="$OPTARG" ;;
    q) QUERY="$OPTARG" ;;
    f) FORMAT="$OPTARG" ;;
    p) PAGINATE=true ;;
    v) VERBOSE=true ;;
    h) usage ;;
    *) usage ;;
  esac
done

[[ "$VERBOSE" == true ]] && enable_verbose

# --- get token ---
TOKEN=$(get_token) || exit 1
log_debug "Token acquired"

# --- build URL ---
BASE_URL="https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${COUNT}"
if [[ -n "$QUERY" ]]; then
  BASE_URL="${BASE_URL}&q=$(urlencode "$QUERY")"
fi

# --- fetch message list ---
if [[ "$PAGINATE" == true ]]; then
  log_debug "Paginating through all results..."
  LIST=$(paginate "$BASE_URL" "messages" "$TOKEN")
else
  log_debug "Fetching message list..."
  LIST=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$BASE_URL")
  check_error "$LIST" "Message list" || exit 1
  LIST=$(echo "$LIST" | jq '.messages // []')
fi

MSG_COUNT=$(count_results "$LIST")
log_debug "Found $MSG_COUNT messages"

# --- fetch details for each message ---
EMAILS="[]"
IDS=$(echo "$LIST" | jq -r '.[].id // empty')
for ID in $IDS; do
  log_verbose "Fetching message $ID"
  DETAIL=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/${ID}?format=metadata")

  if ! check_error "$DETAIL" "Message $ID" >/dev/null 2>&1; then
    log_warn "Failed to fetch message $ID, skipping"
    continue
  fi

  HEADERS=$(echo "$DETAIL" | jq '.payload.headers')
  SUBJECT=$(echo "$HEADERS" | jq -r 'map(select(.name=="Subject"))[0].value // "No Subject"')
  FROM=$(echo "$HEADERS" | jq -r 'map(select(.name=="From"))[0].value // ""')
  DATE=$(echo "$HEADERS" | jq -r 'map(select(.name=="Date"))[0].value // ""')
  SNIPPET=$(echo "$DETAIL" | jq -r '.snippet // ""' | head -c 200)
  LABEL_IDS=$(echo "$DETAIL" | jq -r '.labelIds // [] | join(",")')
  SIZE=$(echo "$DETAIL" | jq -r '.sizeEstimate // 0')
  THREAD_ID=$(echo "$DETAIL" | jq -r '.threadId // ""')

  # Parse From into name + email
  read -r FROM_NAME FROM_EMAIL <<< "$(parse_email_from "$FROM")"

  # Format size
  SIZE_HR=$(format_size "$SIZE")

  EMAILS=$(echo "$EMAILS" | jq \
    --arg id "$ID" \
    --arg thread_id "$THREAD_ID" \
    --arg subject "$SUBJECT" \
    --arg from_email "$FROM_EMAIL" \
    --arg from_name "$FROM_NAME" \
    --arg date "$DATE" \
    --arg preview "$SNIPPET" \
    --arg labels "$LABEL_IDS" \
    --arg size "$SIZE_HR" \
    '. + [{id: $id, thread_id: $thread_id, subject: $subject, from_email: $from_email, from_name: $from_name, date: $date, preview: $preview, labels: $labels, size: $size}]')
done

# --- output ---
log_debug "Outputting $MSG_COUNT emails in $FORMAT format"
format_output "$EMAILS" "$FORMAT" "id subject from_email date size labels"
