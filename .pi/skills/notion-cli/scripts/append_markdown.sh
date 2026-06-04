#!/usr/bin/env bash
# append_markdown.sh — Convert Markdown (file or stdin) to Notion blocks and append to a page.
#
# Usage:
#   append_markdown.sh <PAGE_ID> [MARKDOWN_FILE]
#   cat notes.md | append_markdown.sh <PAGE_ID>
#
# Requires: notion_call.sh (sibling), jq, python3.
#
# Supports: # / ## / ### headings, - and * bullets, 1. numbered, > quotes,
# fenced ``` code blocks (with optional language), --- dividers, blank-line
# paragraph separation.
#
# Rich inline formatting (bold, italic, links) is not converted — content is
# inserted as plain text inside each block. Extend the Python script if needed.
#
# Notion accepts at most 100 children per append. This script batches.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CALL="${SCRIPT_DIR}/notion_call.sh"

if [ $# -lt 1 ]; then
  echo "usage: $0 <PAGE_ID> [MARKDOWN_FILE]" >&2
  exit 2
fi

PAGE_ID="$1"
INPUT="${2:-/dev/stdin}"

# Use Python for the Markdown→JSON conversion. Bash regex isn't pleasant for this.
blocks_json=$(python3 - "$INPUT" <<'PY'
import json
import re
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

lines = text.splitlines()
blocks = []

def text_block(content, kind="paragraph"):
    return {
        "object": "block",
        "type": kind,
        kind: {"rich_text": [{"type": "text", "text": {"content": content}}]},
    }

i = 0
while i < len(lines):
    line = lines[i]
    stripped = line.strip()

    # Fenced code block
    m = re.match(r"^```(\w*)\s*$", stripped)
    if m:
        lang = m.group(1) or "plain text"
        i += 1
        body = []
        while i < len(lines) and not re.match(r"^```\s*$", lines[i].strip()):
            body.append(lines[i])
            i += 1
        # Skip closing fence
        if i < len(lines):
            i += 1
        blocks.append({
            "object": "block",
            "type": "code",
            "code": {
                "rich_text": [{"type": "text", "text": {"content": "\n".join(body)}}],
                "language": lang,
            },
        })
        continue

    # Divider
    if stripped in ("---", "***", "___"):
        blocks.append({"object": "block", "type": "divider", "divider": {}})
        i += 1
        continue

    # Headings
    m = re.match(r"^(#{1,3})\s+(.+)$", stripped)
    if m:
        level = len(m.group(1))
        kind = f"heading_{level}"
        blocks.append(text_block(m.group(2), kind))
        i += 1
        continue

    # To-do
    m = re.match(r"^[-*]\s+\[([ xX])\]\s+(.+)$", stripped)
    if m:
        checked = m.group(1).lower() == "x"
        blocks.append({
            "object": "block",
            "type": "to_do",
            "to_do": {
                "rich_text": [{"type": "text", "text": {"content": m.group(2)}}],
                "checked": checked,
            },
        })
        i += 1
        continue

    # Bullet
    m = re.match(r"^[-*]\s+(.+)$", stripped)
    if m:
        blocks.append(text_block(m.group(1), "bulleted_list_item"))
        i += 1
        continue

    # Numbered
    m = re.match(r"^\d+\.\s+(.+)$", stripped)
    if m:
        blocks.append(text_block(m.group(1), "numbered_list_item"))
        i += 1
        continue

    # Quote
    m = re.match(r"^>\s?(.*)$", stripped)
    if m:
        blocks.append(text_block(m.group(1), "quote"))
        i += 1
        continue

    # Blank line — separator, skip
    if stripped == "":
        i += 1
        continue

    # Otherwise: a paragraph. Coalesce continuation lines.
    para_lines = [line]
    i += 1
    while i < len(lines):
        nxt = lines[i].strip()
        if nxt == "" or re.match(r"^(#{1,3}\s|[-*]\s|\d+\.\s|>\s|```)", nxt) or nxt in ("---", "***", "___"):
            break
        para_lines.append(lines[i])
        i += 1
    blocks.append(text_block(" ".join(p.strip() for p in para_lines), "paragraph"))

print(json.dumps(blocks))
PY
)

# Batch in chunks of 100
total=$(printf '%s' "$blocks_json" | jq 'length')
if [ "$total" -eq 0 ]; then
  echo "No blocks parsed from input." >&2
  exit 0
fi

offset=0
while [ "$offset" -lt "$total" ]; do
  chunk=$(printf '%s' "$blocks_json" | jq --argjson o "$offset" '.[$o:($o+100)]')
  payload=$(jq -n --argjson c "$chunk" '{children: $c}')
  "$CALL" PATCH "/v1/blocks/${PAGE_ID}/children" "$payload" > /dev/null
  offset=$((offset + 100))
done

echo "Appended $total block(s) to page $PAGE_ID."
