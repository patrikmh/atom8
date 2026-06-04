#!/usr/bin/env bash
# notion_call.sh — Thin wrapper around `curl` for the Notion REST API.
#
# Handles the three required headers, retries on 429 with Retry-After,
# and exits non-zero on 4xx/5xx with a readable error message printed to stderr.
#
# Usage:
#   notion_call.sh <METHOD> <PATH> [JSON_BODY]
#
# Examples:
#   notion_call.sh GET  /v1/users/me
#   notion_call.sh POST /v1/search '{"query":"roadmap"}'
#   notion_call.sh PATCH /v1/pages/$PAGE_ID '{"properties":{"Status":{"status":{"name":"Done"}}}}'
#
# Reads the token from $NOTION_TOKEN. The API version defaults to 2025-09-03;
# override with $NOTION_VERSION.
#
# On success, prints the JSON response to stdout. Pipe to jq.

set -euo pipefail

: "${NOTION_TOKEN:?NOTION_TOKEN is not set. Export it before calling this script.}"
NOTION_VERSION="${NOTION_VERSION:-2025-09-03}"
BASE="${NOTION_BASE_URL:-https://api.notion.com}"
MAX_RETRIES="${NOTION_MAX_RETRIES:-5}"

if [ $# -lt 2 ]; then
  echo "usage: $0 <METHOD> <PATH> [JSON_BODY]" >&2
  exit 2
fi

METHOD="$1"
API_PATH="$2"
BODY="${3:-}"

attempt=0
while : ; do
  attempt=$((attempt + 1))

  # Build curl args
  args=(
    -sS
    -X "$METHOD"
    "${BASE}${API_PATH}"
    -H "Authorization: Bearer ${NOTION_TOKEN}"
    -H "Notion-Version: ${NOTION_VERSION}"
    -w '\n__HTTP_STATUS__:%{http_code}\n__RETRY_AFTER__:%header{retry-after}'
  )

  if [ -n "$BODY" ]; then
    args+=(-H "Content-Type: application/json" --data "$BODY")
  fi

  response=$(curl "${args[@]}")

  # Split response body from trailers
  http_status=$(printf '%s\n' "$response" | grep -E '^__HTTP_STATUS__:' | tail -n1 | cut -d: -f2)
  retry_after=$(printf '%s\n' "$response" | grep -E '^__RETRY_AFTER__:' | tail -n1 | cut -d: -f2-)
  body=$(printf '%s\n' "$response" | sed -e '/^__HTTP_STATUS__:/d' -e '/^__RETRY_AFTER__:/d')

  case "$http_status" in
    2*)
      printf '%s' "$body"
      exit 0
      ;;
    429)
      if [ "$attempt" -ge "$MAX_RETRIES" ]; then
        echo "Rate limited after $attempt attempts; giving up." >&2
        printf '%s\n' "$body" >&2
        exit 1
      fi
      sleep_for="${retry_after:-2}"
      # Strip any whitespace
      sleep_for=$(printf '%s' "$sleep_for" | tr -d '[:space:]')
      [ -z "$sleep_for" ] && sleep_for=2
      echo "Rate limited; sleeping ${sleep_for}s (attempt $attempt/$MAX_RETRIES)..." >&2
      sleep "$sleep_for"
      ;;
    5*)
      if [ "$attempt" -ge "$MAX_RETRIES" ]; then
        echo "Server error $http_status after $attempt attempts." >&2
        printf '%s\n' "$body" >&2
        exit 1
      fi
      backoff=$((2 ** attempt))
      echo "Server $http_status; backing off ${backoff}s (attempt $attempt/$MAX_RETRIES)..." >&2
      sleep "$backoff"
      ;;
    *)
      echo "HTTP $http_status from Notion API:" >&2
      printf '%s\n' "$body" >&2
      exit 1
      ;;
  esac
done
