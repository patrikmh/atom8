#!/usr/bin/env bash
# page_to_markdown.sh — Fetch a Notion page's blocks and print readable Markdown.
#
# Usage:
#   page_to_markdown.sh <PAGE_ID>
#
# Requires: notion_call.sh (sibling script), jq.
#
# Handles common block types: headings, paragraphs, bullets, numbered, todo,
# quote, callout, code, divider. Unsupported or empty blocks are skipped.
# Does not currently recurse into nested children (toggles, callouts with kids);
# extend if you need that — fetch /v1/blocks/{block_id}/children when has_children is true.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CALL="${SCRIPT_DIR}/notion_call.sh"

if [ $# -lt 1 ]; then
  echo "usage: $0 <PAGE_ID>" >&2
  exit 2
fi

PAGE_ID="$1"
cursor=""

while : ; do
  if [ -z "$cursor" ]; then
    response=$("$CALL" GET "/v1/blocks/${PAGE_ID}/children?page_size=100")
  else
    response=$("$CALL" GET "/v1/blocks/${PAGE_ID}/children?page_size=100&start_cursor=${cursor}")
  fi

  # Render each block on this page
  printf '%s' "$response" | jq -r '
    .results[] |
    if .type == "heading_1" then
      "# " + ((.heading_1.rich_text // []) | map(.plain_text) | join(""))
    elif .type == "heading_2" then
      "## " + ((.heading_2.rich_text // []) | map(.plain_text) | join(""))
    elif .type == "heading_3" then
      "### " + ((.heading_3.rich_text // []) | map(.plain_text) | join(""))
    elif .type == "paragraph" then
      ((.paragraph.rich_text // []) | map(.plain_text) | join(""))
    elif .type == "bulleted_list_item" then
      "- " + ((.bulleted_list_item.rich_text // []) | map(.plain_text) | join(""))
    elif .type == "numbered_list_item" then
      "1. " + ((.numbered_list_item.rich_text // []) | map(.plain_text) | join(""))
    elif .type == "to_do" then
      (if .to_do.checked then "- [x] " else "- [ ] " end)
        + ((.to_do.rich_text // []) | map(.plain_text) | join(""))
    elif .type == "quote" then
      "> " + ((.quote.rich_text // []) | map(.plain_text) | join(""))
    elif .type == "callout" then
      "> " + ((.callout.icon.emoji // "💡") + " "
        + ((.callout.rich_text // []) | map(.plain_text) | join("")))
    elif .type == "code" then
      "```" + (.code.language // "")
        + "\n" + ((.code.rich_text // []) | map(.plain_text) | join(""))
        + "\n```"
    elif .type == "divider" then
      "---"
    elif .type == "equation" then
      "$$" + (.equation.expression // "") + "$$"
    elif .type == "bookmark" then
      "[" + (.bookmark.url // "") + "](" + (.bookmark.url // "") + ")"
    else
      empty
    end,
    ""
  '

  has_more=$(printf '%s' "$response" | jq -r '.has_more')
  if [ "$has_more" != "true" ]; then
    break
  fi
  cursor=$(printf '%s' "$response" | jq -r '.next_cursor')
done
