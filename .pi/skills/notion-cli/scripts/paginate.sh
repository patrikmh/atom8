#!/usr/bin/env bash
# paginate.sh — Follow cursor pagination on any Notion list endpoint and
# concatenate all results into a single JSON array on stdout.
#
# Usage:
#   paginate.sh GET  /v1/blocks/$PAGE_ID/children
#   paginate.sh POST /v1/data_sources/$DATA_SOURCE_ID/query '{"filter":{...}}'
#
# Returns: a JSON array (the concatenation of all `.results`). Lossy for the
# wrapper metadata — if you need that, page manually.
#
# Requires: notion_call.sh (sibling), jq.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CALL="${SCRIPT_DIR}/notion_call.sh"

if [ $# -lt 2 ]; then
  echo "usage: $0 <METHOD> <PATH> [JSON_BODY]" >&2
  exit 2
fi

METHOD="$1"
API_PATH="$2"
BASE_BODY="${3:-}"

cursor=""
all_results="[]"

while : ; do
  case "$METHOD" in
    GET)
      if [ -z "$cursor" ]; then
        sep="?"
        [[ "$API_PATH" == *"?"* ]] && sep="&"
        page=$("$CALL" GET "${API_PATH}${sep}page_size=100")
      else
        sep="?"
        [[ "$API_PATH" == *"?"* ]] && sep="&"
        page=$("$CALL" GET "${API_PATH}${sep}page_size=100&start_cursor=${cursor}")
      fi
      ;;
    POST)
      if [ -z "$BASE_BODY" ]; then
        BASE_BODY="{}"
      fi
      if [ -z "$cursor" ]; then
        body=$(printf '%s' "$BASE_BODY" | jq '. + {page_size: 100}')
      else
        body=$(printf '%s' "$BASE_BODY" | jq --arg c "$cursor" '. + {page_size: 100, start_cursor: $c}')
      fi
      page=$("$CALL" POST "$API_PATH" "$body")
      ;;
    *)
      echo "paginate.sh only supports GET and POST" >&2
      exit 2
      ;;
  esac

  all_results=$(jq -n \
    --argjson acc "$all_results" \
    --argjson pg "$(printf '%s' "$page" | jq '.results')" \
    '$acc + $pg')

  has_more=$(printf '%s' "$page" | jq -r '.has_more')
  if [ "$has_more" != "true" ]; then
    break
  fi
  cursor=$(printf '%s' "$page" | jq -r '.next_cursor')
done

printf '%s\n' "$all_results"
