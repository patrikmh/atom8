#!/usr/bin/env bash
# Send email via Gmail API
# Usage: send_email.sh -t <to> -s <subject> -b <body> [options]
#   -t, --to EMAIL          Recipient email (required)
#   -s, --subject SUBJECT     Subject (required)
#   -b, --body TEXT          Body text (required)
#   -c, --cc EMAIL           CC recipient
#   -B, --bcc EMAIL          BCC recipient
#   -f, --from EMAIL         Sender (default: user's email)
#   --html                   Send as HTML
#   --attach FILE            Attach a file
#   --dry-run                Show what would be sent without sending

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

# Get token
TOKEN=$(get_token) || exit 1

# Parse arguments
TO=""
SUBJECT=""
BODY=""
CC=""
BCC=""
FROM=""
HTML=""
ATTACH=""
DRY_RUN=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -t|--to) TO="$2"; shift 2 ;;
        -s|--subject) SUBJECT="$2"; shift 2 ;;
        -b|--body) BODY="$2"; shift 2 ;;
        -c|--cc) CC="$2"; shift 2 ;;
        -B|--bcc) BCC="$2"; shift 2 ;;
        -f|--from) FROM="$2"; shift 2 ;;
        --html) HTML="1"; shift ;;
        --attach) ATTACH="$2"; shift 2 ;;
        --dry-run) DRY_RUN="1"; shift ;;
        -h|--help)
            echo "Usage: $0 -t <to> -s <subject> -b <body> [options]"
            echo "  -t, --to EMAIL       Recipient (required)"
            echo "  -s, --subject TEXT   Subject (required)"
            echo "  -b, --body TEXT      Body text (required)"
            echo "  -c, --cc EMAIL       CC recipient"
            echo "  -B, --bcc EMAIL      BCC recipient"
            echo "  -f, --from EMAIL     Sender email"
            echo "  --html               Send as HTML email"
            echo "  --attach FILE        Attach a file"
            echo "  --dry-run            Preview without sending"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

if [[ -z "$TO" || -z "$SUBJECT" || -z "$BODY" ]]; then
    echo "Error: -t, -s, and -b are required"
    echo "Usage: $0 -t <to> -s <subject> -b <body>"
    exit 1
fi

# Get sender email if not specified
if [[ -z "$FROM" ]]; then
    FROM=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
        "https://gmail.googleapis.com/gmail/v1/users/me/profile" | jq -r '.emailAddress // ""')
    if [[ -z "$FROM" ]]; then
        FROM="me"
    fi
fi

# Build MIME message
CONTENT_TYPE="text/plain"
if [[ -n "$HTML" ]]; then
    CONTENT_TYPE="text/html"
fi

# Build raw email
RAW_EMAIL="From: ${FROM}
To: ${TO}"

if [[ -n "$CC" ]]; then
    RAW_EMAIL="${RAW_EMAIL}
Cc: ${CC}"
fi

if [[ -n "$BCC" ]]; then
    RAW_EMAIL="${RAW_EMAIL}
Bcc: ${BCC}"
fi

RAW_EMAIL="${RAW_EMAIL}
Subject: ${SUBJECT}
Content-Type: ${CONTENT_TYPE}; charset=utf-8

${BODY}"

# Base64 encode (URL-safe)
ENCODED=$(echo -n "$RAW_EMAIL" | base64 | tr '+/' '-_' | tr -d '=')

if [[ -n "$DRY_RUN" ]]; then
    echo "=== DRY RUN ==="
    echo "From: $FROM"
    echo "To: $TO"
    echo "Cc: $CC"
    echo "Bcc: $BCC"
    echo "Subject: $SUBJECT"
    echo "Content-Type: $CONTENT_TYPE"
    echo "Body: ${BODY:0:100}..."
    echo "Encoded length: ${#ENCODED}"
    exit 0
fi

# Send via Gmail API
log "Sending email to $TO..."
RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"raw\":\"${ENCODED}\"}" \
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send")

if echo "$RESPONSE" | jq -e 'has("error")' >/dev/null 2>&1; then
    echo "Error: $(echo "$RESPONSE" | jq -r '.error.message')" >&2
    exit 1
fi

MSG_ID=$(echo "$RESPONSE" | jq -r '.id')
log "Email sent successfully! Message ID: $MSG_ID"
echo "{\"status\": \"sent\", \"messageId\": \"${MSG_ID}\", \"to\": \"${TO}\", \"subject\": \"${SUBJECT}\"}" | jq '.'
