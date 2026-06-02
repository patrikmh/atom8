#!/usr/bin/env bash
# Advanced Drive search with query builder
# Usage: drive_search.sh [options] [format]
#   -q, --query NAME         Search by name
#   -t, --type TYPE          Filter by type (document, spreadsheet, presentation, folder, pdf, image, video)
#   -o, --owner EMAIL        Owned by user
#   -s, --shared             Shared files only
#   -S, --starred            Starred files only
#   -d, --date-after DATE    Modified after date (YYYY-MM-DD)
#   -D, --date-before DATE   Modified before date (YYYY-MM-DD)
#   --size-above N           Size above N bytes
#   --size-below N           Size below N bytes
#   -n, --number N           Max results (default: 20)
#   -p, --paginate           Paginate all results

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN=$(get_token) || exit 1

LIMIT=20
PAGINATE=false
FORMAT="${GSKILL_FORMAT:-json}"

DRIVE_QUERY=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -q|--query) DRIVE_QUERY="${DRIVE_QUERY} and name contains '${2}'"; shift 2 ;;
        -t|--type)
            case "$2" in
                document) DRIVE_QUERY="${DRIVE_QUERY} and mimeType='application/vnd.google-apps.document'" ;;
                spreadsheet) DRIVE_QUERY="${DRIVE_QUERY} and mimeType='application/vnd.google-apps.spreadsheet'" ;;
                presentation) DRIVE_QUERY="${DRIVE_QUERY} and mimeType='application/vnd.google-apps.presentation'" ;;
                folder) DRIVE_QUERY="${DRIVE_QUERY} and mimeType='application/vnd.google-apps.folder'" ;;
                pdf) DRIVE_QUERY="${DRIVE_QUERY} and mimeType='application/pdf'" ;;
                image) DRIVE_QUERY="${DRIVE_QUERY} and mimeType contains 'image/'" ;;
                video) DRIVE_QUERY="${DRIVE_QUERY} and mimeType contains 'video/'" ;;
                *) DRIVE_QUERY="${DRIVE_QUERY} and mimeType='${2}'" ;;
            esac
            shift 2 ;;
        -o|--owner) DRIVE_QUERY="${DRIVE_QUERY} and '${2}' in owners"; shift 2 ;;
        -s|--shared) DRIVE_QUERY="${DRIVE_QUERY} and sharedWithMe=true"; shift ;;
        -S|--starred) DRIVE_QUERY="${DRIVE_QUERY} and starred=true"; shift ;;
        -d|--date-after) DRIVE_QUERY="${DRIVE_QUERY} and modifiedTime > '${2}T00:00:00Z'"; shift 2 ;;
        -D|--date-before) DRIVE_QUERY="${DRIVE_QUERY} and modifiedTime < '${2}T23:59:59Z'"; shift 2 ;;
        --size-above) DRIVE_QUERY="${DRIVE_QUERY} and size > ${2}"; shift 2 ;;
        --size-below) DRIVE_QUERY="${DRIVE_QUERY} and size < ${2}"; shift 2 ;;
        -n|--number) LIMIT="$2"; shift 2 ;;
        -p|--paginate) PAGINATE=true; shift ;;
        json|table|csv|tsv|markdown|compact) FORMAT="$1"; shift ;;
        -h|--help)
            echo "Usage: $0 [options] [format]"
            echo "  -q, --query NAME        Search by name"
            echo "  -t, --type TYPE         Filter by type (document, spreadsheet, etc.)"
            echo "  -o, --owner EMAIL       Owned by user"
            echo "  -s, --shared            Shared files"
            echo "  -S, --starred           Starred files"
            echo "  -d, --date-after DATE   Modified after"
            echo "  -D, --date-before DATE  Modified before"
            echo "  --size-above N          Size > N bytes"
            echo "  --size-below N          Size < N bytes"
            echo "  -n, --number N          Max results"
            echo "  -p, --paginate          Paginate all"
            exit 0
            ;;
        *) shift ;;
    esac
done

# Remove leading " and "
DRIVE_QUERY="${DRIVE_QUERY# and }"

if [[ -z "$DRIVE_QUERY" ]]; then
    DRIVE_QUERY="trashed=false"
fi

URL="https://www.googleapis.com/drive/v3/files?q=$(urlencode "$DRIVE_QUERY")&fields=files(id,name,mimeType,modifiedTime,createdTime,size,ownedByMe,shared,starred,webViewLink,owners(displayName))&orderBy=modifiedTime desc&pageSize=${LIMIT}"

log "Searching Drive..."
if [[ "$PAGINATE" == true ]]; then
    RESPONSE=$(paginate "$URL" "files" "$TOKEN")
else
    RESPONSE=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$URL")
    check_error "$RESPONSE" "Drive search" || exit 1
    RESPONSE=$(echo "$RESPONSE" | jq '.files // []')
fi

OUTPUT=$(echo "$RESPONSE" | jq '
    [ .[] |
        {
            id: .id,
            name: .name,
            type: .mimeType,
            type_name: (if .mimeType == "application/vnd.google-apps.document" then "Google Doc"
                       elif .mimeType == "application/vnd.google-apps.spreadsheet" then "Google Sheet"
                       elif .mimeType == "application/vnd.google-apps.presentation" then "Google Slides"
                       elif .mimeType == "application/vnd.google-apps.folder" then "Folder"
                       elif .mimeType == "application/pdf" then "PDF"
                       elif .mimeType | startswith("image/") then "Image"
                       elif .mimeType | startswith("video/") then "Video"
                       else .mimeType end),
            size: (.size // 0),
            modified: .modifiedTime,
            created: .createdTime,
            owned: .ownedByMe,
            shared: .shared,
            starred: .starred,
            owner: (.owners[0].displayName // ""),
            link: .webViewLink
        }
    ]
')

COUNT=$(echo "$OUTPUT" | jq 'length')
log "Found $COUNT files"

format_output "$OUTPUT" "$FORMAT" "id name type_name size modified owner shared starred link"
