#!/usr/bin/env bash
# Comprehensive Google Drive file fetcher via bash + curl + jq.
# Usage: ./fetch_drive.sh [OPTIONS]
# Options:
#   -n COUNT     Number of files (default: 10)
#   -q QUERY     Search query (Google Drive query syntax)
#   -m MIMETYPE  Filter by MIME type
#   -f FORMAT    Output format: json, table, csv, tsv, markdown, compact (default: json)
#   -p           Paginate to fetch all results
#   -v           Verbose
#   -h           Show help
#
# Examples:
#   ./fetch_drive.sh -n 10
#   ./fetch_drive.sh -n 20 -q "name contains 'report'"
#   ./fetch_drive.sh -n 10 -m "application/pdf"
#   ./fetch_drive.sh -n 20 -m "application/vnd.google-apps.folder"
#   ./fetch_drive.sh -p

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

# --- defaults ---
COUNT=10
QUERY=""
MIMETYPE=""
FORMAT="${GSKILL_FORMAT:-json}"
PAGINATE=false
VERBOSE=false

# --- parse args ---
usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -n COUNT     Number of files (default: 10)
  -q QUERY     Search query (Google Drive query syntax)
  -m MIMETYPE  Filter by MIME type
  -f FORMAT    Output format: json, table, csv, tsv, markdown, compact
  -p           Paginate to fetch all results
  -v           Verbose
  -h           Show help

Examples:
  $(basename "$0") -n 10
  $(basename "$0") -n 20 -q "name contains 'report'"
  $(basename "$0") -n 10 -m "application/pdf"
  $(basename "$0") -p
EOF
  exit 0
}

while getopts "n:q:m:f:pvh" opt; do
  case $opt in
    n) COUNT="$OPTARG" ;;
    q) QUERY="$OPTARG" ;;
    m) MIMETYPE="$OPTARG" ;;
    f) FORMAT="$OPTARG" ;;
    p) PAGINATE=true ;;
    v) VERBOSE=true ;;
    h) usage ;;
    *) usage ;;
  esac
done

[[ "$VERBOSE" == true ]] && enable_verbose

# --- build Drive query ---
DRIVE_QUERY=""

if [[ -n "$MIMETYPE" ]]; then
  DRIVE_QUERY="mimeType='${MIMETYPE}'"
fi

if [[ -n "$QUERY" ]]; then
  if [[ -n "$DRIVE_QUERY" ]]; then
    DRIVE_QUERY="${DRIVE_QUERY} and ${QUERY}"
  else
    DRIVE_QUERY="$QUERY"
  fi
fi

# --- get token ---
TOKEN=$(get_token) || exit 1

# --- build URL ---
URL="https://www.googleapis.com/drive/v3/files?maxResults=${COUNT}&orderBy=modifiedTime%20desc&fields=files(id,name,mimeType,modifiedTime,size,webViewLink,owners,parents,starred,trashed,shared,createdTime)"
if [[ -n "$DRIVE_QUERY" ]]; then
  URL="${URL}&q=$(urlencode "$DRIVE_QUERY")"
fi

log_debug "URL: ${URL}"

# --- fetch files ---
if [[ "$PAGINATE" == true ]]; then
  FILES=$(paginate "$URL" "files" "$TOKEN")
else
  RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")
  check_error "$RESPONSE" "Files list" || exit 1
  FILES=$(echo "$RESPONSE" | jq '.files // []')
fi

FILES_COUNT=$(count_results "$FILES")
log_debug "Found $FILES_COUNT files"

# --- transform ---
RESULT=$(echo "$FILES" | jq '[.[] | {
  id,
  name,
  type: .mimeType,
  type_name: (.mimeType),
  size: (.size // "N/A"),
  size_human: (.size // "N/A"),
  modified: .modifiedTime,
  created: .createdTime,
  starred: (.starred // false),
  trashed: (.trashed // false),
  shared: (.shared // false),
  owner: (.owners[0].displayName // .owners[0].emailAddress // ""),
  link: (.webViewLink // "")
}]')

# Add human-readable type names and sizes
RESULT=$(echo "$RESULT" | jq '[.[] | .type_name = (.type | 
  if . == "application/vnd.google-apps.document" then "Google Doc"
  elif . == "application/vnd.google-apps.spreadsheet" then "Google Sheet"
  elif . == "application/vnd.google-apps.presentation" then "Google Slides"
  elif . == "application/vnd.google-apps.folder" then "Folder"
  elif . == "application/vnd.google-apps.form" then "Form"
  elif . == "application/vnd.google-apps.drawing" then "Drawing"
  elif . == "application/pdf" then "PDF"
  elif . == "text/plain" then "Text"
  elif startswith("image/") then "Image"
  elif startswith("video/") then "Video"
  elif startswith("audio/") then "Audio"
  else . end
)]')

# --- output ---
format_output "$RESULT" "$FORMAT" "id name type_name modified size owner shared"
