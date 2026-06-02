#!/usr/bin/env bash
# Get file details from Google Drive by ID.
# Usage: ./fetch_file.sh FILE_ID [FORMAT]
# Formats: json (default), table, compact

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

FILE_ID="${1:-}"
FORMAT="${2:-${GSKILL_FORMAT:-json}}"

if [[ -z "$FILE_ID" ]]; then
  log_err "Usage: $(basename "$0") FILE_ID [FORMAT]"
  exit 1
fi

TOKEN=$(get_token) || exit 1

log_debug "Fetching file $FILE_ID..."
RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
  "https://www.googleapis.com/drive/v3/files/${FILE_ID}?fields=*")

check_error "$RESPONSE" "File $FILE_ID" || exit 1

# Extract permissions
PERMISSIONS=$(echo "$RESPONSE" | jq '[.permissions[]? | {
  id: .id,
  type: .type,
  role: .role,
  email: .emailAddress,
  name: .displayName
}]')

OUTPUT=$(echo "$RESPONSE" | jq \
  --argjson permissions "$PERMISSIONS" \
  '{
    id: .id,
    name: .name,
    mimeType: .mimeType,
    size: .size,
    createdTime: .createdTime,
    modifiedTime: .modifiedTime,
    starred: .starred,
    trashed: .trashed,
    shared: .shared,
    ownedByMe: .ownedByMe,
    owners: [(.owners[]? | .displayName // .emailAddress)],
    webViewLink: .webViewLink,
    permissions: $permissions,
    permission_count: ($permissions | length),
    parents: .parents,
    description: .description,
    version: .version,
    spaces: .spaces
  }')

format_output "$OUTPUT" "$FORMAT" "id name mimeType size modifiedTime shared"
