from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List, Optional
import random
import json

from services.google_api import fetch_gmail, fetch_calendar, fetch_tasks, fetch_drive
from services.ai_research import do_web_research, analyze_intent as analyze_research_intent
from services.research_queue import enqueue, get_job, pick_next_pending, mark_running, mark_done, mark_error
from services.pi_chat import chat as pi_chat, get_or_create_session, clear_session, delete_session, list_sessions
from services.pi_data_fetch import (
    fetch_gmail_pi,
    fetch_calendar_pi,
    fetch_tasks_pi,
    fetch_drive_pi,
    do_web_research_pi,
)

router = APIRouter(prefix="/api/ai", tags=["ai"])

# Simple mock AI responses for v1
# In production, this would call Claude/OpenAI API

MOCK_RESPONSES = {
    "email": [
        "You have 5 unread emails today. The most important ones are from your team about the project update and a meeting invitation.",
        "I found 3 emails from today. 2 are marked important and 1 is a newsletter.",
    ],
    "calendar": [
        "You have 4 events today: Team Standup at 9:00, Design Review at 10:30, Lunch with Client at 12:00, and Sprint Planning at 14:00.",
        "Your calendar is clear after 3 PM today. You have 2 meetings in the morning.",
    ],
    "task": [
        "You have 3 tasks remaining today. 2 are high priority: Review PR #234 and Fix login bug.",
        "2 out of 6 tasks are completed. The remaining ones are due by end of week.",
    ],
    "drive": [
        "I found 5 recent files. The most recent is Q2 Report.pdf uploaded 2 hours ago.",
        "You have 3 new files since yesterday, including a spreadsheet and 2 documents.",
    ],
    "component": [
        "I'll create a new widget for you! I've added it to the dashboard.",
    ],
    "default": [
        "I can help you with your dashboard! I can check your emails, calendar, tasks, or create new components.",
        "I'm your AI assistant. Ask me about your data or tell me what component you'd like to add.",
    ],
}


def analyze_intent(message: str) -> str:
    msg = message.lower()
    if any(w in msg for w in ["email", "mail", "inbox", "message"]):
        return "email"
    if any(w in msg for w in ["calendar", "event", "meeting", "schedule", "today"]):
        return "calendar"
    if any(w in msg for w in ["task", "todo", "todoist", "checklist"]):
        return "task"
    if any(w in msg for w in ["file", "drive", "document", "folder"]):
        return "drive"
    if any(w in msg for w in ["component", "widget", "add", "create", "new"]):
        return "component"
    return "default"


def generate_a2ui_component(intent: str) -> Optional[Dict[str, Any]]:
    if intent != "component":
        return None
    
    # Return a simple A2UI-like component spec
    return {
        "type": "ai",
        "title": "AI Generated Widget",
        "category": "AI",
        "prompt": "AI-generated research component",
        "a2ui": {
            "type": "card",
            "content": [
                {"type": "text", "value": "This is an AI-generated component"},
                {"type": "metric", "label": "Value", "value": "42"}
            ]
        }
    }


@router.post("/chat")
async def chat(message: Dict[str, Any]):
    """Process a chat message via a headless pi session."""
    user_message = message.get("message", "")
    if not user_message:
        raise HTTPException(status_code=400, detail="Message is required")

    session_id = message.get("session_id")
    result = await pi_chat(session_id, user_message)

    return {
        "content": result["content"],
        "session_id": result["session_id"],
        "status": result["status"],
    }


@router.post("/chat/clear")
async def chat_clear(body: Dict[str, Any]):
    """Clear messages in a session (keep the session ID)."""
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    clear_session(session_id)
    return {"status": "ok", "session_id": session_id}


@router.post("/chat/new")
async def chat_new(body: Dict[str, Any]):
    """Delete an old session and create a new one."""
    session_id = body.get("session_id")
    if session_id:
        delete_session(session_id)
    new_id = get_or_create_session(None)
    return {"status": "ok", "session_id": new_id}


@router.get("/chat/sessions")
async def chat_sessions():
    """List all active chat sessions."""
    return {"sessions": list_sessions()}


@router.post("/research")
async def research(request: Dict[str, Any]):
    """Analyze topic and route to real data sources via headless pi sessions."""
    topic = request.get("topic", "")
    if not topic:
        raise HTTPException(status_code=400, detail="Topic is required")

    intent = analyze_research_intent(topic)

    # Route to real data source via a headless pi session
    if intent == "email":
        result = await fetch_gmail_pi(prompt=topic)
        if "error" in result:
            return {"content": f"Unable to fetch emails: {result['error']}", "sources": [], "status": "error"}
        emails = result.get("emails", [])
        if not emails:
            return {"content": "No emails found matching your query.", "sources": [], "status": "ok"}
        
        # If the prompt asks to summarize, also return the raw emails for A2UI rendering
        is_summary = any(w in topic.lower() for w in ['summar', 'overview', 'digest', 'brief', 'recap', 'highlight'])
        
        sender_list = []
        for i, e in enumerate(emails[:10]):
            sender = e.get('from_name', '') or e.get('from_email', '') or e.get('from', '') or 'Unknown'
            sender_list.append(f"{i+1}. {e.get('subject', '(no subject)')} from {sender}")
        content = f"Found {len(emails)} email(s):\n" + "\n".join(sender_list)
        
        response = {"content": content, "sources": [], "status": "ok"}
        # Always include raw emails so the frontend can render them as A2UI components
        response["emails"] = emails
        return response

    if intent == "calendar":
        result = await fetch_calendar_pi(prompt=topic)
        if "error" in result:
            return {"content": f"Unable to fetch calendar events: {result['error']}", "sources": [], "status": "error"}
        events = result.get("events", [])
        if not events:
            return {"content": "No calendar events found.", "sources": [], "status": "ok"}
        content = f"Found {len(events)} event(s):\n"
        for i, e in enumerate(events[:5], 1):
            title = e.get('title', '') or e.get('summary', '') or '(no title)'
            content += f"\n{i}. {title} at {e.get('start', '')}"
        return {"content": content, "sources": [], "status": "ok"}

    if intent == "task":
        result = await fetch_tasks_pi(prompt=topic)
        if "error" in result:
            return {"content": f"Unable to fetch tasks: {result['error']}", "sources": [], "status": "error"}
        tasks = result.get("tasks", [])
        if not tasks:
            return {"content": "No tasks found.", "sources": [], "status": "ok"}
        content = f"Found {len(tasks)} task(s):\n"
        for i, t in enumerate(tasks[:5], 1):
            status = "✓" if t.get("completed") else "○"
            content += f"\n{i}. {status} {t.get('title', '')}"
        return {"content": content, "sources": [], "status": "ok"}

    if intent == "drive":
        result = await fetch_drive_pi(prompt=topic)
        if "error" in result:
            return {"content": f"Unable to fetch drive files: {result['error']}", "sources": [], "status": "error"}
        files = result.get("files", [])
        if not files:
            return {"content": "No files found.", "sources": [], "status": "ok"}
        content = f"Found {len(files)} file(s):\n"
        for i, f in enumerate(files[:5], 1):
            content += f"\n{i}. {f.get('name', '')} ({f.get('icon', 'file')})"
        return {"content": content, "sources": [], "status": "ok"}

    # Fallback: perform real web research using Playwright directly
    result = await do_web_research(topic)
    return result


@router.post("/design")
async def design_suggestion(request: Dict[str, Any]):
    """Get AI design suggestions for the dashboard."""
    current_layout = request.get("layout", [])
    
    # Simple heuristic: suggest moving calendar to top-left
    changes = []
    for widget in current_layout:
        if isinstance(widget, dict) and widget.get("type") == "calendar" and widget.get("layout", {}).get("x", 0) > 0:
            changes.append({
                "widget_id": widget.get("id"),
                "type": "move",
                "x": widget.get("layout", {}).get("x"),
                "y": widget.get("layout", {}).get("y"),
                "new_x": 0,
                "new_y": 0,
            })
    
    # If no calendar found, suggest reorganizing first widget
    if not changes and current_layout:
        first = current_layout[0]
        if isinstance(first, dict):
            changes.append({
                "widget_id": first.get("id"),
                "type": "move",
                "x": first.get("layout", {}).get("x"),
                "y": first.get("layout", {}).get("y"),
                "new_x": 0,
                "new_y": 0,
            })
    
    return {
        "suggestion": {
            "description": "I've analyzed your layout and suggest moving your most important widgets to the top-left for better visibility. This follows the F-pattern reading flow where users scan from top-left to bottom-right.",
            "changes": changes,
        }
    }


# ─── Headless pi deep-research queue ───────────────────────────────────────

@router.post("/research/queue")
async def research_queue(request: Dict[str, Any]):
    """Enqueue a deep-research job. Returns job ID to poll."""
    topic = request.get("topic", "")
    if not topic:
        raise HTTPException(status_code=400, detail="Topic is required")
    job_id = enqueue(topic)
    return {"job_id": job_id, "status": "queued", "topic": topic}


@router.get("/research/queue/pending")
async def research_pending():
    """Get the next pending job (for the daemon)."""
    job = pick_next_pending()
    if not job:
        return {"job": None}
    return {"job": {"id": job["id"], "topic": job["topic"]}}


@router.get("/research/queue/{job_id}")
async def research_queue_status(job_id: str):
    """Get status of a research job."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "id": job["id"],
        "topic": job["topic"],
        "status": job["status"],
        "result": json.loads(job["result"]) if job.get("result") else None,
        "created_at": job["created_at"],
        "updated_at": job["updated_at"],
    }


@router.post("/research/queue/{job_id}/running")
async def research_running(job_id: str):
    mark_running(job_id)
    return {"ok": True}


@router.post("/research/queue/{job_id}/done")
async def research_done(job_id: str, body: Dict[str, Any]):
    mark_done(job_id, body)
    return {"ok": True}


@router.post("/research/queue/{job_id}/error")
async def research_error(job_id: str, body: Dict[str, Any]):
    mark_error(job_id, body.get("error", "Unknown error"))
    return {"ok": True}

