"""AI endpoints: Chat, Research, and Summarize.

Chat uses persistent in-memory sessions.
Research uses a dedicated pi RPC process with the web-research skill.
Summarize fetches data from Google services and asks the AI to summarize it.
"""
import uuid
from typing import Dict

from fastapi import APIRouter, HTTPException

from pi_rpc import pi_manager
from models import ChatRequest, ChatResponse, ResearchRequest, ResearchResponse, SummarizeRequest, SummarizeResponse

# Import data fetchers from the data router so we can reuse them
from routers.data import (
    _fetch_gmail_logic,
    _fetch_calendar_logic,
    _fetch_tasks_logic,
    _fetch_drive_logic,
)

router = APIRouter(prefix="/api/ai", tags=["ai"])

# In-memory chat session store
_chat_sessions: Dict[str, list] = {}
_MAX_SESSIONS = 50


def _get_or_create_session(session_id: str | None) -> str:
    """Get existing session or create new one."""
    if session_id and session_id in _chat_sessions:
        return session_id
    # Evict oldest if at limit
    if len(_chat_sessions) >= _MAX_SESSIONS:
        oldest = next(iter(_chat_sessions))
        del _chat_sessions[oldest]
    new_id = str(uuid.uuid4())
    _chat_sessions[new_id] = []
    return new_id


@router.post("/chat")
async def chat(request: ChatRequest):
    """Chat with the pi agent. Maintains session history in memory."""
    session_id = _get_or_create_session(request.session_id)

    # Build prompt with history
    messages = []
    for msg in request.history:
        messages.append(f"{msg.role}: {msg.content}")
    messages.append(f"user: {request.message}")
    prompt = "\n".join(messages)

    result = await pi_manager.get("chat").prompt(prompt, timeout=120)

    if result.get("status") == "error":
        raise HTTPException(500, result.get("error", "Chat failed"))

    response_text = result.get("data", "")
    if isinstance(response_text, dict):
        response_text = response_text.get("response", str(response_text))

    # Store in session
    _chat_sessions[session_id].append({"role": "user", "content": request.message})
    _chat_sessions[session_id].append({"role": "assistant", "content": response_text})

    return ChatResponse(
        response=response_text,
        session_id=session_id,
    )


@router.post("/research")
async def research(request: ResearchRequest):
    """Synchronous web research using the web-research skill.

    This is a direct, synchronous request — no queue, no background processing.
    """
    prompt = (
        f"/web-research Research: '{request.topic}'. "
        f"Depth: {request.depth}. Max results: {request.max_results}."
    )
    result = await pi_manager.get("research").prompt(prompt, timeout=120)

    if result.get("status") == "error":
        raise HTTPException(500, result.get("error", "Research failed"))

    data = result.get("data", "")
    if isinstance(data, dict):
        findings = data.get("findings", str(data))
        sources = data.get("sources", [])
    else:
        findings = str(data)
        sources = []

    return ResearchResponse(
        findings=findings,
        sources=sources,
    )


def _detect_summarize_intent(prompt: str) -> str:
    """Detect which data source the prompt is about."""
    p = prompt.lower()
    if "email" in p or "mail" in p or "inbox" in p or "message" in p:
        return "gmail"
    if "calendar" in p or "event" in p or "meeting" in p or "schedule" in p:
        return "calendar"
    if "task" in p or "todo" in p or "checklist" in p:
        return "tasks"
    if "file" in p or "drive" in p or "document" in p or "folder" in p:
        return "drive"
    return "research"


async def _fetch_data_for_intent(intent: str, count: int, date: str | None, list_id: str | None, prompt: str) -> dict:
    """Fetch raw data based on the detected intent."""
    if intent == "gmail":
        return await _fetch_gmail_logic(count, prompt)
    if intent == "calendar":
        return await _fetch_calendar_logic(date or "", prompt)
    if intent == "tasks":
        return await _fetch_tasks_logic(list_id or "default", prompt)
    if intent == "drive":
        return await _fetch_drive_logic(count, "", prompt)
    return {}


@router.post("/summarize")
async def summarize(request: SummarizeRequest):
    """Fetch data from Google services and ask the AI to summarize it.

    This endpoint is perfect for custom widget prompts like:
    "Get latest mail from tldr ai and give me a summary of the most important"
    """
    intent = _detect_summarize_intent(request.prompt)

    # Fetch the raw data
    try:
        raw_data = await _fetch_data_for_intent(
            intent, request.count, request.date, request.list_id, request.prompt
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch {intent} data: {e}")

    # Build the AI prompt with the raw data context
    ai_prompt = (
        f"The user asked: '{request.prompt}'\n\n"
        f"Here is the raw {intent} data (JSON):\n{raw_data}\n\n"
        f"Please provide a concise, human-readable summary or analysis based on the user's request. "
        f"If the user asked for specific items (e.g., emails from a specific sender), focus on those. "
        f"Respond in plain text, no markdown code blocks."
    )

    # Send to the AI chat process
    result = await pi_manager.get("chat").prompt(ai_prompt, timeout=120)

    if result.get("status") == "error":
        error_msg = result.get("error", "Summarization failed")
        return SummarizeResponse(
            summary="",
            intent=intent,
            status="error",
            error=error_msg,
        )

    summary_text = result.get("data", "")
    if isinstance(summary_text, dict):
        summary_text = summary_text.get("response", str(summary_text))

    return SummarizeResponse(
        summary=str(summary_text).strip(),
        intent=intent,
        status="ok",
    )
