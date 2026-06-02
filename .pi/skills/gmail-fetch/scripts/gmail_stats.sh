#!/usr/bin/env bash
# Gmail statistics and analytics
# Usage: gmail_stats.sh [options]
#   --by-sender              Top senders
#   --by-date                Emails by date
#   --by-label               Emails by label
#   --by-size                Size distribution
#   --unread-analysis        Unread email analysis
#   -n, --number N           Top N results (default: 10)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

TOKEN=$(get_token) || exit 1

MODE="overview"
COUNT=10

while [[ $# -gt 0 ]]; do
    case "$1" in
        --by-sender) MODE="sender"; shift ;;
        --by-date) MODE="date"; shift ;;
        --by-label) MODE="label"; shift ;;
        --by-size) MODE="size"; shift ;;
        --unread-analysis) MODE="unread"; shift ;;
        -n|--number) COUNT="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo "  --by-sender        Top senders by email count"
            echo "  --by-date          Emails by date"
            echo "  --by-label         Emails by label"
            echo "  --by-size          Size distribution"
            echo "  --unread-analysis  Unread email analysis"
            echo "  -n, --number N     Top N results"
            exit 0
            ;;
        *) shift ;;
    esac
done

# Get profile
PROFILE=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "https://gmail.googleapis.com/gmail/v1/users/me/profile")

TOTAL=$(echo "$PROFILE" | jq -r '.messagesTotal // 0')
THREADS=$(echo "$PROFILE" | jq -r '.threadsTotal // 0')
HISTORY=$(echo "$PROFILE" | jq -r '.historyId // 0')

# Get labels
LABELS=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
    "https://gmail.googleapis.com/gmail/v1/users/me/labels")

# Get unread count
UNREAD=$(echo "$LABELS" | jq '.labels[] | select(.id == "UNREAD") | .messagesUnread // 0')

# Get inbox counts
INBOX_TOTAL=$(echo "$LABELS" | jq '.labels[] | select(.id == "INBOX") | .messagesTotal // 0')
INBOX_UNREAD=$(echo "$LABELS" | jq '.labels[] | select(.id == "INBOX") | .messagesUnread // 0')

# Sent counts
SENT_TOTAL=$(echo "$LABELS" | jq '.labels[] | select(.id == "SENT") | .messagesTotal // 0')

# Draft counts
DRAFT_TOTAL=$(echo "$LABELS" | jq '.labels[] | select(.id == "DRAFT") | .messagesTotal // 0')

# Trash counts
TRASH_TOTAL=$(echo "$LABELS" | jq '.labels[] | select(.id == "TRASH") | .messagesTotal // 0')

# Spam counts
SPAM_TOTAL=$(echo "$LABELS" | jq '.labels[] | select(.id == "SPAM") | .messagesTotal // 0')

# Starred counts
STARRED_TOTAL=$(echo "$LABELS" | jq '.labels[] | select(.id == "STARRED") | .messagesTotal // 0')

# Important counts
IMPORTANT_TOTAL=$(echo "$LABELS" | jq '.labels[] | select(.id == "IMPORTANT") | .messagesTotal // 0')

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    GMAIL STATISTICS                            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Account: $(echo "$PROFILE" | jq -r '.emailAddress // "Unknown"')"
echo ""
echo "┌─ OVERVIEW ──────────────────────────────────────────────────┐"
printf "│ %-40s %10s │\n" "Total Messages:" "$TOTAL"
printf "│ %-40s %10s │\n" "Total Threads:" "$THREADS"
printf "│ %-40s %10s │\n" "Unread (all labels):" "$UNREAD"
printf "│ %-40s %10s │\n" "Inbox (total/unread):" "${INBOX_TOTAL}/${INBOX_UNREAD}"
printf "│ %-40s %10s │\n" "Sent:" "$SENT_TOTAL"
printf "│ %-40s %10s │\n" "Drafts:" "$DRAFT_TOTAL"
printf "│ %-40s %10s │\n" "Trash:" "$TRASH_TOTAL"
printf "│ %-40s %10s │\n" "Spam:" "$SPAM_TOTAL"
printf "│ %-40s %10s │\n" "Starred:" "$STARRED_TOTAL"
printf "│ %-40s %10s │\n" "Important:" "$IMPORTANT_TOTAL"
echo "└───────────────────────────────────────────────────────────────┘"
echo ""

# Get recent messages for detailed analysis
if [[ "$MODE" != "overview" ]]; then
    log "Fetching recent messages for analysis..."
    LIST=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50")
    LIST=$(echo "$LIST" | jq '.messages // []')
    
    MSG_IDS=$(echo "$LIST" | jq -r '.[].id // empty')
    
    # Build detailed data
    DETAILS="[]"
    for ID in $MSG_IDS; do
        D=$(curl -s -H "Authorization: Bearer ${TOKEN}" \
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/${ID}?format=metadata")
        if check_error "$D" "$ID" >/dev/null 2>&1; then
            HEADERS=$(echo "$D" | jq '.payload.headers')
            FROM=$(echo "$HEADERS" | jq -r 'map(select(.name=="From"))[0].value // ""')
            DATE=$(echo "$HEADERS" | jq -r 'map(select(.name=="Date"))[0].value // ""')
            SIZE=$(echo "$D" | jq -r '.sizeEstimate // 0')
            LABELS_MSG=$(echo "$D" | jq -r '.labelIds // [] | join(",")')
            
            read -r FROM_NAME FROM_EMAIL <<< "$(parse_email_from "$FROM")"
            
            DETAILS=$(echo "$DETAILS" | jq \
                --arg email "$FROM_EMAIL" \
                --arg name "$FROM_NAME" \
                --arg date "$DATE" \
                --argjson size "$SIZE" \
                --arg labels "$LABELS_MSG" \
                '. + [{email: $email, name: $name, date: $date, size: $size, labels: $labels}]')
        fi
    done
    
    if [[ "$MODE" == "sender" ]]; then
        echo "┌─ TOP SENDERS ───────────────────────────────────────────────┐"
        echo "$DETAILS" | jq -r '
            group_by(.email) | 
            map({email: .[0].email, name: .[0].name, count: length, total_size: map(.size) | add}) |
            sort_by(.count) | reverse | .[0:'$COUNT'] |
            .[] | "\(.count)\t\(.email)\t\(.name)\t\(.total_size) bytes"
        ' | while IFS=$'\t' read -r count email name size; do
            printf "│ %-6s %-30s %-20s %10s │\n" "$count" "$email" "$name" "$size"
        done
        echo "└───────────────────────────────────────────────────────────────┘"
    fi
    
    if [[ "$MODE" == "size" ]]; then
        echo "┌─ SIZE DISTRIBUTION ─────────────────────────────────────────┐"
        echo "$DETAILS" | jq -r '
            map(.size) | 
            {
                small: map(select(. < 10000)) | length,
                medium: map(select(. >= 10000 and . < 100000)) | length,
                large: map(select(. >= 100000 and . < 1000000)) | length,
                huge: map(select(. >= 1000000)) | length
            } | 
            "Small (<10KB):    \(.small)",
            "Medium (10-100KB): \(.medium)",
            "Large (100KB-1MB): \(.large)",
            "Huge (>1MB):      \(.huge)"
        '
        echo "└───────────────────────────────────────────────────────────────┘"
    fi
    
    if [[ "$MODE" == "unread" ]]; then
        echo "┌─ UNREAD ANALYSIS ───────────────────────────────────────────┐"
        printf "│ %-40s %10s │\n" "Total unread in all labels:" "$UNREAD"
        printf "│ %-40s %10s │\n" "Unread in inbox:" "$INBOX_UNREAD"
        printf "│ %-40s %10s │\n" "Inbox unread ratio:" "$(awk "BEGIN {printf \"%.1f%%\", $INBOX_UNREAD/$INBOX_TOTAL*100}")"
        echo "└───────────────────────────────────────────────────────────────┘"
    fi
fi
