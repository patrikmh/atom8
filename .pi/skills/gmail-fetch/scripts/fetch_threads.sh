#!/usr/bin/env bash
# Fetch Gmail conversation threads.
# Usage: ./fetch_threads.sh [OPTIONS]
# Options:
#   -n COUNT    Number of threads (default: 10)
#   -q QUERY    Gmail search query
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
  -n COUNT    Number of threads (default: 10)
  -q QUERY    Gmail search query
  -f FORMAT   Output format: json, table, csv, tsv, markdown, compact
  -v          Verbose
  -h          Show help

Examples:
  $(basename "$0") -n 10
  $(basename "$0") -q "from:alice@example.com" -f table
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

URL="https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=${COUNT}"
[[ -n "$QUERY" ]] && URL="${URL}&q=$(urlencode "$QUERY")"

log_debug "Fetching threads..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")
check_error "$RESPONSE" "Threads list" || exit 1

THREADS=$(echo "$RESPONSE" | jq '[.threads[] | {
  id,
  historyId,
  snippet: (.snippet // "" | .[0:200])
}]')

format_output "$THREADS" "$FORMAT" "id snippet"
