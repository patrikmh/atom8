"""Chat session manager with in-memory history and A2UI component parsing.

The actual subprocess execution is delegated to ``services.pi_runner.PiRunner``.
This module keeps the session-management and prompt-building logic that is
specific to the chat feature.
"""

import asyncio
import os
import uuid
import json
import re
from typing import Dict, List, Any, Optional

from services.pi_runner import PiRunner, send_to_pi, parse_a2ui_components

# --- Configuration ---
MAX_MESSAGE_LENGTH = 4000  # chars
MAX_SESSIONS = 50

# In-memory session store: session_id -> list of messages
CHAT_SESSIONS: Dict[str, List[Dict[str, Any]]] = {}
_sessions_lock = asyncio.Lock()


def get_or_create_session(session_id: str | None) -> str:
    """Return an existing session ID or create a new one."""
    if session_id and session_id in CHAT_SESSIONS:
        return session_id
    new_id = str(uuid.uuid4())[:8]
    CHAT_SESSIONS[new_id] = []
    return new_id


def get_session(session_id: str) -> List[Dict[str, Any]]:
    """Return session messages, or empty list if not found."""
    return CHAT_SESSIONS.get(session_id, [])


def clear_session(session_id: str) -> None:
    """Clear messages for a session (keep the session ID)."""
    if session_id in CHAT_SESSIONS:
        CHAT_SESSIONS[session_id] = []


def delete_session(session_id: str) -> None:
    """Delete a session entirely."""
    CHAT_SESSIONS.pop(session_id, None)


def list_sessions() -> List[Dict[str, Any]]:
    """List all active sessions."""
    return [
        {
            "id": sid,
            "message_count": len(msgs),
            "last_message": msgs[-1]["content"][:100] if msgs else None,
        }
        for sid, msgs in CHAT_SESSIONS.items()
    ]


def build_prompt(session_messages: List[Dict[str, Any]], user_message: str) -> str:
    """Build a full prompt including conversation history and system context."""
    system = """You are a helpful, proactive AI assistant for a dashboard application called Living Canvas.
Your goal is to help users get things done — answer questions, fetch data, create widgets, and perform research.

You have access to the following tools:
- read, grep, find — for codebase and file operations
- bash — for running commands like curl and playwright-cli
- gmail-fetch, calendar-fetch, tasks-fetch, drive-fetch skills — for fetching user's Google data
- web-research skill — for web research using playwright-cli
- Available skills guide you through the exact API calls and formats.

RULES:
1. When the user asks about their data (emails, calendar, tasks, files), USE the tools to fetch it and answer directly.
2. When the user asks about news or research topics, use web research to find answers.
3. Only suggest creating a widget when the user explicitly asks for dashboard customization or when the data would be useful to display permanently.
4. Answer questions directly and concisely. Don't just suggest widgets — provide the actual information.
5. If you don't have access to a tool, say so clearly.
6. Be conversational and helpful. Use the user's language.
7. You can include MULTIPLE A2UI components in a single response — use multiple ```a2ui blocks for different data types.

A2UI COMPONENT FORMAT:
When you fetch data (emails, calendar events, tasks, files), wrap the results in a structured JSON format so the UI can render them nicely. You can include multiple components in one response. Use this format:

```a2ui
{
  "type": "email_list",
  "emails": [
    {"id": "1", "from_name": "Alice", "subject": "Hello", "preview": "Hi!", "date": "2026-06-01", "is_read": false}
  ]
}
```

Available A2UI component types:
- email_list: shows emails as cards with sender, subject, preview
- event_list: shows calendar events as timeline cards
- task_list: shows tasks as checkable items
- file_list: shows Drive files as cards
- metric_card: shows a single metric with label and value
- text_card: shows formatted text with optional title
- link_list: shows a list of clickable links
- email_summary: compact email summary (unread_count, total, latest_from, latest_subject)
- event_summary: compact event summary (today_count, upcoming_count, next_event)
- task_summary: compact task summary with progress bar (completed, total, overdue)
- file_summary: compact file summary (recent_count, total_size)
- chart_card: horizontal bar chart (title, data array with label/value)
- table_card: data table (title, headers array, rows array of arrays)
- status_card: status indicator with icon (status: success/warning/error/info, message, detail)
- notification_card: toast-style notification (title, message, time, type: info/success/warning/error)
- trend: metric with trend indicator (label, value, previous, unit)
- component_grid: grid layout containing multiple components (components array, columns number)

After the A2UI block(s), provide a brief conversational summary.

Available widget types for dashboard creation:
- gmail: "Get last 10 emails" or "Get emails from {{sender}}"
- calendar: "Get today's calendar events" or "Get events for {{date}}"
- tasks: "Get today's tasks" or "Get tasks for {{list}}"
- drive: "Get recent files" or "Get files from {{folder}}"
- ai: "Research {{topic}}"
- custom: "Custom data query"

Respond concisely and helpfully. Answer the user's question directly."""

    conversation = []
    for msg in session_messages:
        role = "User" if msg["role"] == "user" else "Assistant"
        conversation.append(f"{role}: {msg['content']}")
    conversation.append(f"User: {user_message}")
    conversation.append("Assistant:")

    return f"{system}\n\n" + "\n".join(conversation)


def parse_a2ui_components(text: str) -> tuple[str, List[Dict[str, Any]]]:
    """Extract A2UI JSON components from the response text.

    Returns a tuple ``(clean_text, components)`` where *clean_text* is the
    original text with all `` ` `` `a2ui` blocks removed.
    """
    components: List[Dict[str, Any]] = []
    pattern = r"```a2ui\s*\n(.*?)\n```"
    matches = re.findall(pattern, text, re.DOTALL)
    for match in matches:
        try:
            data = json.loads(match)
            if isinstance(data, dict) and data.get("type"):
                components.append(data)
        except json.JSONDecodeError:
            pass
    clean_text = re.sub(pattern, "", text, flags=re.DOTALL).strip()
    return clean_text, components


def append_to_session(session_id: str, role: str, content: str) -> None:
    """Append a message to a session."""
    if session_id not in CHAT_SESSIONS:
        CHAT_SESSIONS[session_id] = []
    CHAT_SESSIONS[session_id].append({
        "role": role,
        "content": content,
    })


async def chat(session_id: str | None, user_message: str) -> Dict[str, Any]:
    """Main chat handler: manages session, sends to pi, returns response."""
    # Input validation
    if not user_message or not user_message.strip():
        return {
            "content": "Please enter a message.",
            "components": [],
            "session_id": session_id,
            "status": "error",
        }
    if len(user_message) > MAX_MESSAGE_LENGTH:
        return {
            "content": f"Message too long ({len(user_message)} chars). Max {MAX_MESSAGE_LENGTH}.",
            "components": [],
            "session_id": session_id,
            "status": "error",
        }

    async with _sessions_lock:
        sid = get_or_create_session(session_id)
        session_messages = get_session(sid)

        # Evict oldest session if limit reached
        if len(CHAT_SESSIONS) > MAX_SESSIONS:
            oldest = next(iter(CHAT_SESSIONS))
            del CHAT_SESSIONS[oldest]

        # Append user message
        append_to_session(sid, "user", user_message)

    # Build prompt with full history
    prompt = build_prompt(session_messages, user_message)

    # Send to pi
    response_content = await send_to_pi(prompt)

    # Parse A2UI components
    clean_text, components = parse_a2ui_components(response_content)

    # Append assistant response (clean text)
    async with _sessions_lock:
        append_to_session(sid, "assistant", clean_text)

    return {
        "content": clean_text,
        "components": components,
        "session_id": sid,
        "status": "ok",
    }
