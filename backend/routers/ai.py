from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List, Optional
import json
import os

from models import ChatRequest, ChatClearRequest, ChatNewRequest, ResearchRequest, DesignRequest
from services.research_queue import enqueue, get_job, pick_next_pending, mark_running, mark_done, mark_error
from services.pi_agent import run_pi_agent, parse_pi_output
from services.pi_chat import chat as pi_chat, get_or_create_session, clear_session, delete_session, list_sessions
from services.pi_data_fetch import (
    fetch_gmail_pi,
    fetch_calendar_pi,
    fetch_tasks_pi,
    fetch_drive_pi,
)

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/chat")
async def chat(request: ChatRequest):
    """Process a chat message via a headless pi session."""
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    result = await pi_chat(request.session_id, request.message)

    return {
        "content": result["content"],
        "session_id": result["session_id"],
        "status": result["status"],
    }


@router.post("/chat/clear")
async def chat_clear(request: ChatClearRequest):
    """Clear messages in a session (keep the session ID)."""
    clear_session(request.session_id)
    return {"status": "ok", "session_id": request.session_id}


@router.post("/chat/new")
async def chat_new(request: ChatNewRequest):
    """Delete an old session and create a new one."""
    if request.session_id:
        delete_session(request.session_id)
    new_id = get_or_create_session(None)
    return {"status": "ok", "session_id": new_id}


@router.get("/chat/sessions")
async def chat_sessions():
    """List all active chat sessions."""
    return {"sessions": list_sessions()}


@router.post("/research")
async def research(request: ResearchRequest):
    """Analyze topic and route to real data sources via headless pi sessions."""
    topic = request.topic
    if not topic or not topic.strip():
        raise HTTPException(status_code=400, detail="Topic is required")

    # Detect intent: is this a Google data query or a web research topic?
    msg = topic.lower()
    is_google_data = any(w in msg for w in [
        "email", "mail", "inbox", "message",
        "calendar", "event", "meeting", "schedule", "today",
        "task", "todo", "checklist",
        "file", "drive", "document", "folder"
    ])

    if is_google_data:
        # Google data fetch via skill + bash + curl
        # Determine which skill to use based on intent
        if any(w in msg for w in ["email", "mail", "inbox", "message"]):
            skill_name = "gmail-fetch"
            task = f"/{skill_name} Fetch emails from Gmail matching: '{topic}'. Return JSON with emails array."
        elif any(w in msg for w in ["calendar", "event", "meeting", "schedule", "today"]):
            skill_name = "calendar-fetch"
            task = f"/{skill_name} Fetch calendar events matching: '{topic}'. Return JSON with events array."
        elif any(w in msg for w in ["task", "todo", "checklist"]):
            skill_name = "tasks-fetch"
            task = f"/{skill_name} Fetch tasks matching: '{topic}'. Return JSON with tasks array."
        elif any(w in msg for w in ["file", "drive", "document", "folder"]):
            skill_name = "drive-fetch"
            task = f"/{skill_name} Fetch files from Google Drive matching: '{topic}'. Return JSON with files array."
        else:
            skill_name = "gmail-fetch"
            task = f"/{skill_name} Fetch data from Google matching: '{topic}'. Return JSON."

        system = (
            f"You are a data fetch agent. Use the /{skill_name} skill to fetch data. "
            "Follow the skill workflow: read auth.json, refresh token if needed, call API with curl. "
            "Return ONLY the JSON result, no extra text, no markdown, no explanations."
        )
        skills = [os.path.expanduser(f"~/.pi/agent/skills/{skill_name}/SKILL.md")]
        output = await run_pi_agent(task, system_prompt=system, timeout=120, skills=skills)
    else:
        # Web research via skill + bash + playwright-cli
        system = (
            "You are a web research agent. Use the /web-research skill. "
            "Search the web using playwright-cli via the bash tool. "
            "Browse pages, extract relevant content, and synthesize a structured report. "
            "Return ONLY the JSON result, no extra text, no markdown, no explanations."
        )
        task = f"/web-research Research the topic: '{topic}'. Return a structured report with summary, key findings, and sources as JSON."
        skills = [os.path.expanduser("~/.pi/agent/skills/web-research/SKILL.md")]
        output = await run_pi_agent(task, system_prompt=system, timeout=120, skills=skills)

    result = parse_pi_output(output)

    if "error" in result:
        return {"content": f"Unable to fetch data: {result['error']}", "sources": [], "status": "error"}

    # Determine which data type was returned and format accordingly
    if "emails" in result:
        emails = result.get("emails", [])
        if not emails:
            return {"content": "No emails found matching your query.", "sources": [], "status": "ok"}
        sender_list = []
        for i, e in enumerate(emails[:10]):
            sender = e.get('from_name', '') or e.get('from_email', '') or e.get('from', '') or 'Unknown'
            sender_list.append(f"{i+1}. {e.get('subject', '(no subject)')} from {sender}")
        content = f"Found {len(emails)} email(s):\n" + "\n".join(sender_list)
        response = {"content": content, "sources": [], "status": "ok"}
        response["emails"] = emails
        return response

    elif "events" in result:
        events = result.get("events", [])
        if not events:
            return {"content": "No events found for your query.", "sources": [], "status": "ok"}
        event_list = []
        for i, e in enumerate(events[:10]):
            event_list.append(f"{i+1}. {e.get('summary', '(no title)')} at {e.get('start', 'N/A')}")
        content = f"Found {len(events)} event(s):\n" + "\n".join(event_list)
        response = {"content": content, "sources": [], "status": "ok"}
        response["events"] = events
        return response

    elif "tasks" in result:
        tasks = result.get("tasks", [])
        if not tasks:
            return {"content": "No tasks found for your query.", "sources": [], "status": "ok"}
        task_list = []
        for i, t in enumerate(tasks[:10]):
            status = "✓" if t.get('completed') else "○"
            task_list.append(f"{i+1}. {status} {t.get('title', '(no title)')}")
        content = f"Found {len(tasks)} task(s):\n" + "\n".join(task_list)
        response = {"content": content, "sources": [], "status": "ok"}
        response["tasks"] = tasks
        return response

    elif "files" in result:
        files = result.get("files", [])
        if not files:
            return {"content": "No files found for your query.", "sources": [], "status": "ok"}
        file_list = []
        for i, f in enumerate(files[:10]):
            file_list.append(f"{i+1}. {f.get('name', '(no name)')} ({f.get('mimeType', 'unknown')})")
        content = f"Found {len(files)} file(s):\n" + "\n".join(file_list)
        response = {"content": content, "sources": [], "status": "ok"}
        response["files"] = files
        return response

    else:
        # If the agent returned a research-style response, format it
        summary = result.get("summary", "")
        findings = result.get("key_findings", [])
        sources = result.get("sources", [])
        if summary or findings:
            content = summary
            if findings:
                content += "\n\nKey findings:\n"
                for i, f in enumerate(findings[:10]):
                    content += f"\n{i+1}. {f.get('claim', '')}"
                    if f.get('evidence'):
                        content += f"\n   Evidence: {f.get('evidence', '')[:200]}"
            return {"content": content, "sources": sources, "status": "ok"}

        # Fallback: just return whatever we got
        return {"content": result.get("content", str(result)), "sources": [], "status": "ok"}


@router.post("/design")
async def design_suggestion(request: DesignRequest):
    """Get AI design suggestions for the dashboard."""
    current_layout = request.layout.get("widgets", []) if isinstance(request.layout, dict) else []
    
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


# ─── Headless pi research queue ───────────────────────────────────────

@router.post("/research/queue")
async def research_queue(request: Dict[str, Any]):
    """Enqueue a research job. Returns job ID to poll."""
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

