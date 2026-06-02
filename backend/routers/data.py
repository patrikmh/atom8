from fastapi import APIRouter
from models import GmailRequest, CalendarRequest, TasksRequest, DriveRequest
from services.google_api import fetch_gmail, fetch_calendar, fetch_tasks, fetch_drive

router = APIRouter(prefix="/api/data", tags=["data"])


@router.post("/gmail")
async def get_gmail_data(request: GmailRequest):
    """Fetch real Gmail data via Google API."""
    result = await fetch_gmail(count=request.count, prompt=request.prompt)
    if "error" in result:
        return {"emails": [], "error": result["error"], "status": "error", "needs_auth": result.get("needs_auth", False)}
    return {"emails": result.get("emails", []), "status": "ok"}


@router.post("/calendar")
async def get_calendar_data(request: CalendarRequest):
    """Fetch real Calendar data via Google API."""
    result = await fetch_calendar(date=request.date, prompt=request.prompt)
    if "error" in result:
        return {"events": [], "error": result["error"], "status": "error", "needs_auth": result.get("needs_auth", False)}
    return {
        "events": result.get("events", []),
        "date": result.get("date", request.date),
        "status": "ok",
    }


@router.post("/tasks")
async def get_tasks_data(request: TasksRequest):
    """Fetch real Tasks data via Google API."""
    result = await fetch_tasks(list_id=request.list_id or "default", prompt=request.prompt)
    if "error" in result:
        return {"tasks": [], "error": result["error"], "status": "error", "needs_auth": result.get("needs_auth", False)}
    return {"tasks": result.get("tasks", []), "status": "ok"}


@router.post("/drive")
async def get_drive_data(request: DriveRequest):
    """Fetch real Drive data via Google API."""
    result = await fetch_drive(count=request.count, prompt=request.prompt)
    if "error" in result:
        return {"files": [], "error": result["error"], "status": "error", "needs_auth": result.get("needs_auth", False)}
    return {"files": result.get("files", []), "status": "ok"}
