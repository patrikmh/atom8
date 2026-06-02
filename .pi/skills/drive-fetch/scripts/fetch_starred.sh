#!/usr/bin/env bash
# List starred files in Google Drive.
# Usage: ./fetch_starred.sh [FORMAT]
# Formats: json (default), table, csv, tsv, markdown, compact

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

FORMAT="${1:-${GSKILL_FORMAT:-json}}"

TOKEN=$(get_token) || exit 1

log_debug "Fetching starred files..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
  "https://www.googleapis.com/drive/v3/files?q=starred%3Dtrue&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)")

check_error "$RESPONSE" "Starred files" || exit 1

FILES=$(echo "$RESPONSE" | jq '[.files[] | {
  id,
  name,
  type: (.mimeType | 
    if . == "application/vnd.google-apps.document" then "Google Doc"
    elif . == "application/vnd.google-apps.spreadsheet" then "Google Sheet"
    elif . == "application/vnd.google-apps.presentation" then "Google Slides"
    elif . == "application/pdf" then "PDF"
    elif startswith("image/") then "Image"
    else . end),
  modified: .modifiedTime,
  size: (.size // "N/A"),
  link: (.webViewLink // "")
}]')

format_output "$FILES" "$FORMAT" "id name type modified size"
