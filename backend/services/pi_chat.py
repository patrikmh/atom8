"""Headless pi chat service with in-memory session management."""

import subprocess
import asyncio
import os
import uuid
import json
from typing import Dict, List, Any

# --- Configuration ---
MAX_MESSAGE_LENGTH = 4000  # chars
MAX_SESSIONS = 50

# In-memory session store: session_id -> list of messages
CHAT_SESSIONS: Dict[str, List[Dict[str, Any]]] = {}
_sessions_lock = asyncio.Lock()

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Configurable via environment
PI_PROVIDER = os.getenv("PI_PROVIDER", "fireworks")
PI_MODEL = os.getenv("PI_MODEL", "accounts/fireworks/routers/kimi-k2p6-turbo")


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
- read, bash, grep, find — for codebase and file operations
- fetch_gmail, fetch_calendar, fetch_tasks, fetch_drive — project-specific tools to fetch user's Google data
- gmail_list_messages, gmail_read_message, calendar_list_events, tasks_list_tasks, drive_list_files — built-in Google API tools
- web research capabilities via available skills

RULES:
1. When the user asks about their data (emails, calendar, tasks, files), USE the tools to fetch it and answer directly.
2. When the user asks about news or research topics, use web research to find answers.
3. Only suggest creating a widget when the user explicitly asks for dashboard customization or when the data would be useful to display permanently.
4. Answer questions directly and concisely. Don't just suggest widgets — provide the actual information.
5. If you don't have access to a tool, say so clearly.
6. Be conversational and helpful. Use the user's language.

A2UI COMPONENT FORMAT:
When you fetch data (emails, calendar events, tasks, files), wrap the results in a structured JSON format so the UI can render them nicely. Use this format:

```a2ui
{
  "type": "email_list",
  "emails": [
    {"id": "1", "from_name": "Alice", "subject": "Hello", "preview": "Hi!", "date": "2026-06-01", "is_read": false}
  ]
}
```

Available A2UI component types:
- email_list: shows emails as cards
- event_list: shows calendar events as timeline cards
- task_list: shows tasks as checkable items
- file_list: shows Drive files as cards
- metric_card: shows a single metric with label
- text_card: shows formatted text
- link_list: shows a list of clickable links

After the A2UI block, provide a brief conversational summary.

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


def _send_to_pi_sync(prompt: str, timeout: int = 60) -> str:
    """Synchronous pi runner — runs in a thread pool."""
    try:
        env = os.environ.copy()
        # Load the project-specific extension for data fetch tools
        # Use skills: deep-research for web research, pi-subagents for task delegation
        result = subprocess.run(
            [
                "pi",
                "--print",
                "--no-session",
                "--provider",
                PI_PROVIDER,
                "--model",
                PI_MODEL,
                "--thinking",
                "low",
                "--extension",
                ".pi/extensions/living-canvas.ts",
                "--tools",
                "read,grep,find,fetch_gmail,fetch_calendar,fetch_tasks,fetch_drive",
                "--skill",
                "deep-research",
                "--skill",
                "pi-subagents",
                prompt,
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=PROJECT_ROOT,
            env=env,
        )
        output = result.stdout.strip()
        if not output:
            output = result.stderr.strip()
        if not output:
            output = "No response from pi session."
        return output
    except subprocess.TimeoutExpired:
        return "The pi session timed out. Please try a shorter query."
    except FileNotFoundError:
        return "Pi is not installed on the server. Please install it to enable AI chat."
    except Exception as e:
        return f"Error running pi session: {str(e)}"


async def send_to_pi(prompt: str, timeout: int = 60) -> str:
    """Async wrapper that runs the synchronous pi subprocess in a thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _send_to_pi_sync, prompt, timeout)


def append_to_session(session_id: str, role: str, content: str) -> None:
    """Append a message to a session."""
    if session_id not in CHAT_SESSIONS:
        CHAT_SESSIONS[session_id] = []
    CHAT_SESSIONS[session_id].append({
        "role": role,
        "content": content,
    })


import re

def parse_a2ui_components(text: str) -> tuple[str, List[Dict[str, Any]]]:
    """Extract A2UI JSON components from the response text."""
    components = []
    # Find all ```a2ui ... ``` blocks
    pattern = r"```a2ui\s*\n(.*?)\n```"
    matches = re.findall(pattern, text, re.DOTALL)
    for match in matches:
        try:
            data = json.loads(match)
            if isinstance(data, dict) and data.get("type"):
                components.append(data)
        except json.JSONDecodeError:
            pass
    # Remove the A2UI blocks from the text
    clean_text = re.sub(pattern, "", text, flags=re.DOTALL).strip()
    return clean_text, components


async def chat(session_id: str | None, user_message: str) -> Dict[str, Any]:
    """Main chat handler: manages session, sends to pi, returns response."""
    # Input validation
    if not user_message or not user_message.strip():
        return {"content": "Please enter a message.", "components": [], "session_id": session_id, "status": "error"}
    if len(user_message) > MAX_MESSAGE_LENGTH:
        return {"content": f"Message too long ({len(user_message)} chars). Max {MAX_MESSAGE_LENGTH}.", "components": [], "session_id": session_id, "status": "error"}

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
