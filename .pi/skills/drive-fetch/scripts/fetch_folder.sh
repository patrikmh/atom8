#!/usr/bin/env bash
# List files in a specific Google Drive folder.
# Usage: ./fetch_folder.sh [OPTIONS]
# Options:
#   -i ID       Folder ID (required)
#   -n COUNT    Number of files (default: 10)
#   -f FORMAT   Output format: json, table, csv, tsv, markdown, compact (default: json)
#   -v          Verbose
#   -h          Show help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

FOLDER_ID=""
COUNT=10
FORMAT="${GSKILL_FORMAT:-json}"
VERBOSE=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -i ID       Folder ID (required)
  -n COUNT    Number of files (default: 10)
  -f FORMAT   Output format
  -v          Verbose
  -h          Show help

Examples:
  $(basename "$0") -i abc123
  $(basename "$0") -i abc123 -n 50 -f table
EOF
  exit 0
}

while getopts "i:n:f:vh" opt; do
  case $opt in
    i) FOLDER_ID="$OPTARG" ;;
    n) COUNT="$OPTARG" ;;
    f) FORMAT="$OPTARG" ;;
    v) VERBOSE=true ;;
    h) usage ;;
    *) usage ;;
  esac
done

[[ -z "$FOLDER_ID" ]] && { log_err "Folder ID required (-i)"; usage; }
[[ "$VERBOSE" == true ]] && enable_verbose

TOKEN=$(get_token) || exit 1

URL="https://www.googleapis.com/drive/v3/files?maxResults=${COUNT}&q=$(urlencode "'${FOLDER_ID}' in parents")&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)"

log_debug "Fetching folder $FOLDER_ID..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")
check_error "$RESPONSE" "Folder $FOLDER_ID" || exit 1

FILES=$(echo "$RESPONSE" | jq '[.files[] | {
  id,
  name,
  type: (.mimeType | 
    if . == "application/vnd.google-apps.document" then "Google Doc"
    elif . == "application/vnd.google-apps.spreadsheet" then "Google Sheet"
    elif . == "application/vnd.google-apps.presentation" then "Google Slides"
    elif . == "application/vnd.google-apps.folder" then "Folder"
    elif . == "application/pdf" then "PDF"
    elif startswith("image/") then "Image"
    elif startswith("video/") then "Video"
    elif startswith("audio/") then "Audio"
    else . end),
  modified: .modifiedTime,
  size: (.size // "N/A"),
  link: (.webViewLink // "")
}]')

format_output "$FILES" "$FORMAT" "id name type modified size"
