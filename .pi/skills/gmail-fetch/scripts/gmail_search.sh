#!/usr/bin/env bash
# Advanced Gmail search with query builder
# Usage: gmail_search.sh [options] [format]
#   -q, --query QUERY        Gmail search query (supports full Gmail syntax)
#   -f, --from EMAIL         From sender
#   -t, --to EMAIL           To recipient
#   -s, --subject TEXT       Subject contains
#   -b, --body TEXT          Body contains
#   -a, --has-attachment     Has attachments
#   -r, --is-read            Read emails
#   -u, --is-unread          Unread emails
#   -S, --is-starred         Starred emails
#   -i, --is-important       Important emails
#   -d, --date-after DATE    After date (YYYY/MM/DD)
#   -D, --date-before DATE   Before date (YYYY/MM/DD)
#   -l, --label LABEL        Has label
#   -n, --number N           Max results (default: 10)
#   -p, --paginate           Paginate all results
#   -v, --verbose            Verbose output

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN=$(get_token) || exit 1

# Defaults
COUNT=10
QUERY=""
FORMAT="${GSKILL_FORMAT:-json}"
PAGINATE=false
VERBOSE=false

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    -q|--query) QUERY="$2"; shift 2 ;;
    -f|--from) QUERY="${QUERY} from:$2"; shift 2 ;;
    -t|--to) QUERY="${QUERY} to:$2"; shift 2 ;;
    -s|--subject) QUERY="${QUERY} subject:$(urlencode "$2")"; shift 2 ;;
    -b|--body) QUERY="${QUERY} $(urlencode "$2")"; shift 2 ;;
    -a|--has-attachment) QUERY="${QUERY} has:attachment"; shift ;;
    -r|--is-read) QUERY="${QUERY} is:read"; shift ;;
    -u|--is-unread) QUERY="${QUERY} is:unread"; shift ;;
    -S|--is-starred) QUERY="${QUERY} is:starred"; shift ;;
    -i|--is-important) QUERY="${QUERY} is:important"; shift ;;
    -d|--date-after) QUERY="${QUERY} after:$2"; shift 2 ;;
    -D|--date-before) QUERY="${QUERY} before:$2"; shift 2 ;;
    -l|--label) QUERY="${QUERY} label:$2"; shift 2 ;;
    -n|--number) COUNT="$2"; shift 2 ;;
    -p|--paginate) PAGINATE=true; shift ;;
    -v|--verbose) VERBOSE=true; shift ;;
    -h|--help)
      echo "Usage: $0 [options] [format]"
      echo "Options:"
      echo "  -q, --query QUERY       Raw Gmail query"
      echo "  -f, --from EMAIL        From sender"
      echo "  -t, --to EMAIL          To recipient"
      echo "  -s, --subject TEXT      Subject contains"
      echo "  -b, --body TEXT         Body contains"
      echo "  -a, --has-attachment    Has attachments"
      echo "  -r, --is-read          Read emails"
      echo "  -u, --is-unread        Unread emails"
      echo "  -S, --is-starred       Starred emails"
      echo "  -i, --is-important     Important emails"
      echo "  -d, --date-after DATE  After date (YYYY/MM/DD)"
      echo "  -D, --date-before DATE Before date (YYYY/MM/DD)"
      echo "  -l, --label LABEL      Has label"
      echo "  -n, --number N         Max results (default: 10)"
      echo "  -p, --paginate         Paginate all results"
      echo "  -v, --verbose          Verbose output"
      echo ""
      echo "Examples:"
      echo "  $0 -f boss@company.com -u -n 5"
      echo "  $0 -s 'invoice' -a -d 2026/01/01"
      echo "  $0 -q 'is:unread has:attachment larger:10M'"
      exit 0
      ;;
    json|table|csv|tsv|markdown|compact) FORMAT="$1"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

[[ "$VERBOSE" == true ]] && enable_verbose

QUERY=$(echo "$QUERY" | sed 's/^ *//')

# Build URL
BASE_URL="https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${COUNT}"
if [[ -n "$QUERY" ]]; then
  BASE_URL="${BASE_URL}&q=$(urlencode "$QUERY")"
fi

# Fetch message list
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

# Fetch details
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

  read -r FROM_NAME FROM_EMAIL <<< "$(parse_email_from "$FROM")"
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

format_output "$EMAILS" "$FORMAT" "id subject from_email date size labels"
