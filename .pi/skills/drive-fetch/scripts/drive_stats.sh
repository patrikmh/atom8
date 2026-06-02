#!/usr/bin/env bash
# Drive statistics and analytics
# Usage: drive_stats.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN=$(get_token) || exit 1

log "Fetching Drive statistics..."

# Get storage quota
QUOTA=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "https://www.googleapis.com/drive/v3/about?fields=storageQuota,user")

LIMIT=$(echo "$QUOTA" | jq -r '.storageQuota.limit // 0')
USAGE=$(echo "$QUOTA" | jq -r '.storageQuota.usage // 0')
USAGE_IN_DRIVE=$(echo "$QUOTA" | jq -r '.storageQuota.usageInDrive // 0')
USAGE_IN_TRASH=$(echo "$QUOTA" | jq -r '.storageQuota.usageInDriveTrash // 0')

USER_EMAIL=$(echo "$QUOTA" | jq -r '.user.emailAddress // "Unknown"')

# Get file counts by type
log "Counting files by type..."
FILES=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "https://www.googleapis.com/drive/v3/files?fields=files(mimeType,size)&pageSize=1000")

check_error "$FILES" "Files" || exit 1

FILES_ARRAY=$(echo "$FILES" | jq '.files // []')
TOTAL_FILES=$(echo "$FILES_ARRAY" | jq 'length')

# Count by type
DOCS=$(echo "$FILES_ARRAY" | jq '[.[] | select(.mimeType == "application/vnd.google-apps.document")] | length')
SHEETS=$(echo "$FILES_ARRAY" | jq '[.[] | select(.mimeType == "application/vnd.google-apps.spreadsheet")] | length')
PRESENTATIONS=$(echo "$FILES_ARRAY" | jq '[.[] | select(.mimeType == "application/vnd.google-apps.presentation")] | length')
FOLDERS=$(echo "$FILES_ARRAY" | jq '[.[] | select(.mimeType == "application/vnd.google-apps.folder")] | length')
PDFS=$(echo "$FILES_ARRAY" | jq '[.[] | select(.mimeType == "application/pdf")] | length')
IMAGES=$(echo "$FILES_ARRAY" | jq '[.[] | select(.mimeType | startswith("image/"))] | length')
VIDEOS=$(echo "$FILES_ARRAY" | jq '[.[] | select(.mimeType | startswith("video/"))] | length')
OTHERS=$((TOTAL_FILES - DOCS - SHEETS - PRESENTATIONS - FOLDERS - PDFS - IMAGES - VIDEOS))

# Size stats
TOTAL_SIZE=$(echo "$FILES_ARRAY" | jq '[.[] | select(.size) | (.size | tonumber)] | add // 0')
LARGEST=$(echo "$FILES_ARRAY" | jq '[.[] | select(.size) | (.size | tonumber)] | max // 0')
AVG_SIZE=$(echo "$FILES_ARRAY" | jq '[.[] | select(.size) | (.size | tonumber)] | (if length > 0 then (add / length) else 0 end)')

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                   DRIVE STATISTICS                             ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Account: $USER_EMAIL"
echo ""

# Format sizes
LIMIT_HR=$(format_size "$LIMIT")
USAGE_HR=$(format_size "$USAGE")
USAGE_DRIVE_HR=$(format_size "$USAGE_IN_DRIVE")
USAGE_TRASH_HR=$(format_size "$USAGE_IN_TRASH")
TOTAL_SIZE_HR=$(format_size "$TOTAL_SIZE")
LARGEST_HR=$(format_size "$LARGEST")
AVG_SIZE_HR=$(format_size "${AVG_SIZE%.*}")

USAGE_PCT=$(awk "BEGIN {printf \"%.1f\", $USAGE/$LIMIT*100}")

echo "┌─ STORAGE QUOTA ─────────────────────────────────────────────┐"
printf "│ %-40s %15s │\n" "Total quota:" "$LIMIT_HR"
printf "│ %-40s %15s │\n" "Used:" "$USAGE_HR"
printf "│ %-40s %15s │\n" "Used in Drive:" "$USAGE_DRIVE_HR"
printf "│ %-40s %15s │\n" "Used in Trash:" "$USAGE_TRASH_HR"
printf "│ %-40s %15s │\n" "Free:" "$(format_size $((LIMIT - USAGE)))"
printf "│ %-40s %15s │\n" "Usage percentage:" "${USAGE_PCT}%"
echo "└───────────────────────────────────────────────────────────────┘"

echo ""
echo "┌─ FILE COUNTS ───────────────────────────────────────────────┐"
printf "│ %-40s %10s │\n" "Total files:" "$TOTAL_FILES"
printf "│ %-40s %10s │\n" "Google Docs:" "$DOCS"
printf "│ %-40s %10s │\n" "Google Sheets:" "$SHEETS"
printf "│ %-40s %10s │\n" "Google Slides:" "$PRESENTATIONS"
printf "│ %-40s %10s │\n" "Folders:" "$FOLDERS"
printf "│ %-40s %10s │\n" "PDFs:" "$PDFS"
printf "│ %-40s %10s │\n" "Images:" "$IMAGES"
printf "│ %-40s %10s │\n" "Videos:" "$VIDEOS"
printf "│ %-40s %10s │\n" "Other:" "$OTHERS"
echo "└───────────────────────────────────────────────────────────────┘"

echo ""
echo "┌─ SIZE STATISTICS ───────────────────────────────────────────┐"
printf "│ %-40s %15s │\n" "Total file size:" "$TOTAL_SIZE_HR"
printf "│ %-40s %15s │\n" "Largest file:" "$LARGEST_HR"
printf "│ %-40s %15s │\n" "Average file size:" "$AVG_SIZE_HR"
echo "└───────────────────────────────────────────────────────────────┘"
