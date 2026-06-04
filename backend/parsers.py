"""Typed output parser for pi agent responses.

Each skill declares its output type (or auto-detect). The parser extracts
structured data from the raw text so the frontend can render appropriately.

Response shape: {type, text, data, status}
  - type:   Output type identifier (one of OutputType enum)
  - text:   Raw text/markdown for fallback display
  - data:   Structured data extracted from the text
  - status: ok | error
"""

import json
import re
from typing import Any, Literal
from dataclasses import dataclass, field

# ──────────────────────────────────────────────────────────────────────────────
# Type definitions
# ──────────────────────────────────────────────────────────────────────────────

OutputType = Literal[
    "json",
    "json_block",
    "markdown_table",
    "bullet_list",
    "numbered_list",
    "plain_text",
    "email_list",
    "event_list",
    "task_list",
    "file_list",
    "doc_list",
    "doc_content",
    "mixed_json",
    "sectioned_markdown",
    "csv_inline",
    "key_value",
    "rich_summary",
]

VALID_TYPES = set(OutputType.__args__)  # type: ignore


@dataclass
class ParseResult:
    type: str = "plain_text"
    text: str = ""
    data: dict = field(default_factory=dict)
    status: str = "ok"

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "text": self.text,
            "data": self.data,
            "status": self.status,
        }


# ──────────────────────────────────────────────────────────────────────────────
# Detection helpers
# ──────────────────────────────────────────────────────────────────────────────


def _has_json_block(text: str) -> bool:
    return bool(re.search(r"```(?:json)?\s*\n", text))


def _has_pure_json(text: str) -> bool:
    t = text.strip()
    if not t:
        return False
    return t.startswith("{") or t.startswith("[")


def _has_markdown_table(text: str) -> bool:
    return bool(re.search(r"\|[-:\s|]+\|\n", text))


def _has_bullet_list(text: str) -> bool:
    return bool(re.search(r"^\s*[-*]\s+", text, re.MULTILINE))


def _has_numbered_list(text: str) -> bool:
    return bool(re.search(r"^\s*\d+\.\s+", text, re.MULTILINE))


def _has_csv(text: str) -> bool:
    lines = text.strip().splitlines()
    if len(lines) < 2:
        return False
    return "," in lines[0] and "," in lines[1]


def _has_key_value(text: str) -> bool:
    return bool(re.search(r"^\s*[^\n:]+\s*:\s*", text, re.MULTILINE))


def _has_sections(text: str) -> bool:
    return bool(re.search(r"^#{2,6}\s+", text, re.MULTILINE))


def _extract_json_block(text: str) -> Any | None:
    """Extract JSON from markdown code blocks or inline JSON."""
    # Try fenced JSON block
    match = re.search(r"```(?:json)?\s*\n(.*?)\n\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    # Try inline JSON
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass
    # Try to find any {...} or [...] block
    for match in re.finditer(r"(\{[\s\S]*\}|\[[\s\S]*\])", text):
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
    return None


# ──────────────────────────────────────────────────────────────────────────────
# Auto-detect type
# ──────────────────────────────────────────────────────────────────────────────


def detect_type(text: str) -> OutputType:
    """Guess the output type from the raw text."""
    if not text or not text.strip():
        return "plain_text"

    # Priority: structured formats first
    if _has_json_block(text):
        return "json_block"
    if _has_pure_json(text):
        return "json"
    if _has_csv(text):
        return "csv_inline"
    if _has_markdown_table(text):
        return "markdown_table"
    if _has_key_value(text):
        return "key_value"
    if _has_numbered_list(text):
        return "numbered_list"
    if _has_bullet_list(text):
        return "bullet_list"
    if _has_sections(text):
        return "sectioned_markdown"

    return "plain_text"


# ──────────────────────────────────────────────────────────────────────────────
# Parsers — one per type
# ──────────────────────────────────────────────────────────────────────────────


def _parse_json(text: str) -> dict:
    data = _extract_json_block(text)
    if data is None:
        return {"raw": text}
    return {"json": data}


def _parse_json_block(text: str) -> dict:
    data = _extract_json_block(text)
    if data is None:
        return {"raw": text}
    return {"json": data}


def _parse_markdown_table(text: str) -> dict:
    lines = text.strip().splitlines()
    rows = []
    headers = []
    for line in lines:
        if "|" not in line:
            continue
        cells = [c.strip() for c in line.split("|")]
        cells = [c for c in cells if c]
        if not cells:
            continue
        if cells[0].startswith("-") or cells[0].startswith(":"):
            continue
        if not headers:
            headers = cells
        else:
            rows.append(dict(zip(headers, cells)))
    return {"headers": headers, "rows": rows}


def _parse_list(text: str, pattern: str) -> dict:
    items = []
    for line in text.splitlines():
        match = re.match(r"\s*" + pattern + r"\s*(.*)", line)
        if match:
            items.append(match.group(1).strip())
    return {"items": items, "count": len(items)}


def _parse_bullet_list(text: str) -> dict:
    return _parse_list(text, r"[-*]")


def _parse_numbered_list(text: str) -> dict:
    return _parse_list(text, r"\d+\.")


def _parse_plain_text(text: str) -> dict:
    return {"text": text.strip()}


def _parse_email_list(text: str) -> dict:
    data = _extract_json_block(text)
    if isinstance(data, dict) and "emails" in data:
        return {"emails": data["emails"]}
    if isinstance(data, list):
        return {"emails": data}
    # Parse markdown table fallback
    table = _parse_markdown_table(text)
    if table.get("rows"):
        return {"emails": table["rows"]}
    return {"emails": []}


def _parse_event_list(text: str) -> dict:
    data = _extract_json_block(text)
    if isinstance(data, dict) and "events" in data:
        return {"events": data["events"]}
    if isinstance(data, list):
        return {"events": data}
    return {"events": []}


def _parse_task_list(text: str) -> dict:
    data = _extract_json_block(text)
    if isinstance(data, dict) and "tasks" in data:
        return {"tasks": data["tasks"]}
    if isinstance(data, list):
        return {"tasks": data}
    return {"tasks": []}


def _parse_file_list(text: str) -> dict:
    data = _extract_json_block(text)
    if isinstance(data, dict) and "files" in data:
        return {"files": data["files"]}
    if isinstance(data, list):
        return {"files": data}
    return {"files": []}


def _parse_doc_list(text: str) -> dict:
    data = _extract_json_block(text)
    if isinstance(data, dict) and "documents" in data:
        return {"documents": data["documents"]}
    if isinstance(data, list):
        return {"documents": data}
    # Parse markdown table fallback
    table = _parse_markdown_table(text)
    if table.get("rows"):
        return {"documents": table["rows"]}
    return {"documents": []}


def _parse_doc_content(text: str) -> dict:
    data = _extract_json_block(text)
    if isinstance(data, dict) and "content" in data:
        return {"content": data["content"], "documentId": data.get("documentId", "")}
    if isinstance(data, dict):
        return {"content": str(data.get("text", data)), "documentId": data.get("documentId", "")}
    return {"content": text.strip(), "documentId": ""}


def _parse_mixed_json(text: str) -> dict:
    data = _extract_json_block(text)
    # Remove the JSON block to get commentary text
    commentary = re.sub(r"```(?:json)?\s*\n.*?\n\s*```", "", text, flags=re.DOTALL)
    commentary = re.sub(r"\{[\s\S]*\}|\[[\s\S]*\]", "", commentary)
    return {"json": data, "commentary": commentary.strip()}


def _parse_sectioned_markdown(text: str) -> dict:
    sections = {}
    current = ""
    current_title = "intro"
    for line in text.splitlines():
        m = re.match(r"^(#{2,6})\s+(.*)", line)
        if m:
            if current:
                sections[current_title] = current.strip()
            current_title = m.group(2).strip()
            current = ""
        else:
            current += line + "\n"
    if current or current_title not in sections:
        sections[current_title] = current.strip()
    return {"sections": sections}


def _parse_csv(text: str) -> dict:
    lines = text.strip().splitlines()
    if not lines:
        return {"headers": [], "rows": []}
    import csv
    reader = csv.DictReader(lines)
    rows = list(reader)
    return {"headers": reader.fieldnames or [], "rows": rows}


def _parse_key_value(text: str) -> dict:
    pairs = {}
    for line in text.splitlines():
        match = re.match(r"^\s*([^\n:]+?)\s*:\s*(.*)$", line)
        if match:
            key = match.group(1).strip()
            val = match.group(2).strip()
            if key:
                pairs[key] = val
    return {"pairs": pairs}


def _parse_rich_summary(text: str) -> dict:
    data = _extract_json_block(text)
    if isinstance(data, dict):
        return {"summary": data}
    # Extract summary text (first paragraph)
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    return {"summary": {"text": paragraphs[0] if paragraphs else text.strip(), "paragraphs": paragraphs}}


# ──────────────────────────────────────────────────────────────────────────────
# Parser registry
# ──────────────────────────────────────────────────────────────────────────────

PARSERS = {
    "json": _parse_json,
    "json_block": _parse_json_block,
    "markdown_table": _parse_markdown_table,
    "bullet_list": _parse_bullet_list,
    "numbered_list": _parse_numbered_list,
    "plain_text": _parse_plain_text,
    "email_list": _parse_email_list,
    "event_list": _parse_event_list,
    "task_list": _parse_task_list,
    "file_list": _parse_file_list,
    "doc_list": _parse_doc_list,
    "doc_content": _parse_doc_content,
    "mixed_json": _parse_mixed_json,
    "sectioned_markdown": _parse_sectioned_markdown,
    "csv_inline": _parse_csv,
    "key_value": _parse_key_value,
    "rich_summary": _parse_rich_summary,
}


# ──────────────────────────────────────────────────────────────────────────────
# Main entry point
# ──────────────────────────────────────────────────────────────────────────────


def parse_output(text: str, type_hint: str | None = None) -> ParseResult:
    """Parse raw text into a typed result.

    Args:
        text:      Raw text from pi agent
        type_hint: Optional type hint from the skill (e.g. "email_list")

    Returns:
        ParseResult with type, text, data, and status
    """
    result = ParseResult(text=text)

    if not text or not text.strip():
        result.type = "plain_text"
        result.data = {"text": ""}
        return result

    # Use type hint if valid
    detected = type_hint if type_hint in VALID_TYPES else None
    if not detected:
        detected = detect_type(text)

    result.type = detected

    parser = PARSERS.get(detected, _parse_plain_text)
    try:
        result.data = parser(text)
    except Exception as e:
        result.data = {"_parse_error": str(e), "raw": text}
        result.status = "parse_error"

    return result
