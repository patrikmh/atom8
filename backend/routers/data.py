from fastapi import APIRouter, HTTPException
from models import GmailRequest, CalendarRequest, TasksRequest, DriveRequest
from services.pi_data_fetch import fetch_gmail_pi, fetch_calendar_pi, fetch_tasks_pi, fetch_drive_pi

router = APIRouter(prefix="/api/data", tags=["data"])


@router.post("/gmail")
async def get_gmail_data(request: GmailRequest):
    """Fetch real Gmail data via a headless pi session."""
    result = await fetch_gmail_pi(prompt=request.prompt, count=request.count)
    if "error" in result:
        return {"emails": [], "error": result["error"], "status": "error"}
    return {"emails": result.get("emails", []), "status": "ok"}


@router.post("/calendar")
async def get_calendar_data(request: CalendarRequest):
    """Fetch real Calendar data via a headless pi session."""
    result = await fetch_calendar_pi(prompt=request.prompt, date=request.date)
    if "error" in result:
        return {"events": [], "error": result["error"], "status": "error"}
    return {
        "events": result.get("events", []),
        "date": result.get("date", request.date),
        "status": "ok",
    }


@router.post("/tasks")
async def get_tasks_data(request: TasksRequest):
    """Fetch real Tasks data via a headless pi session."""
    result = await fetch_tasks_pi(prompt=request.prompt, list_id=request.list_id)
    if "error" in result:
        return {"tasks": [], "error": result["error"], "status": "error"}
    return {"tasks": result.get("tasks", []), "status": "ok"}


@router.post("/drive")
async def get_drive_data(request: DriveRequest):
    """Fetch real Drive data via a headless pi session."""
    result = await fetch_drive_pi(prompt=request.prompt, count=request.count)
    if "error" in result:
        return {"files": [], "error": result["error"], "status": "error"}
    return {"files": result.get("files", []), "status": "ok"}
