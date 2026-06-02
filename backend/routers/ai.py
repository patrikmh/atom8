"""AI endpoints: Chat and Research.

Chat uses persistent in-memory sessions.
Research uses a dedicated pi RPC process with the web-research skill.
"""
import uuid
from typing import Dict

from fastapi import APIRouter, HTTPException

from pi_rpc import pi_manager
from models import ChatRequest, ChatResponse, ResearchRequest, ResearchResponse

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
