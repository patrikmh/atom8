"""Data endpoints: Gmail, Calendar, Tasks, Drive.

All endpoints use a persistent pi --mode rpc process with the relevant skill.
"""
from fastapi import APIRouter, HTTPException, Request

from pi_rpc import pi_manager
from models import DataRequest, DataResponse

router = APIRouter(prefix="/api/data", tags=["data"])


async def _fetch_gmail_logic(count: int, prompt: str):
    prompt = f"/gmail-fetch Fetch {count} emails. Query: '{prompt}'"
    result = await pi_manager.get("gmail").prompt(prompt, timeout=60)
    if result.get("status") == "error":
        raise HTTPException(500, result.get("error", "Gmail fetch failed"))
    data = result.get("data", [])
    return DataResponse(
        data=data if isinstance(data, list) else [data],
        count=_parse_count(data),
    )


async def _fetch_calendar_logic(date: str, prompt: str):
    date_str = f"Date: '{date}'." if date else ""
    prompt = f"/calendar-fetch Fetch events. {date_str} Query: '{prompt}'"
    result = await pi_manager.get("calendar").prompt(prompt, timeout=60)
    if result.get("status") == "error":
        raise HTTPException(500, result.get("error", "Calendar fetch failed"))
    data = result.get("data", [])
    return DataResponse(
        data=data if isinstance(data, list) else [data],
        count=_parse_count(data),
    )


async def _fetch_tasks_logic(list_id: str, prompt: str):
    list_str = f"List: '{list_id}'." if list_id else ""
    prompt = f"/tasks-fetch Fetch tasks. {list_str} Query: '{prompt}'"
    result = await pi_manager.get("tasks").prompt(prompt, timeout=60)
    if result.get("status") == "error":
        raise HTTPException(500, result.get("error", "Tasks fetch failed"))
    data = result.get("data", [])
    return DataResponse(
        data=data if isinstance(data, list) else [data],
        count=_parse_count(data),
    )


async def _fetch_drive_logic(count: int, folder_id: str, prompt: str):
    folder_str = f"Folder: '{folder_id}'." if folder_id else ""
    prompt = f"/drive-fetch Fetch {count} files. {folder_str} Query: '{prompt}'"
    result = await pi_manager.get("drive").prompt(prompt, timeout=60)
    if result.get("status") == "error":
        raise HTTPException(500, result.get("error", "Drive fetch failed"))
    data = result.get("data", [])
    return DataResponse(
        data=data if isinstance(data, list) else [data],
        count=_parse_count(data),
    )


def _parse_count(data: any) -> int:
    """Extract count from data response."""
    if isinstance(data, list):
        return len(data)
    if isinstance(data, dict):
        return data.get("count", 0)
    return 0


@router.post("/gmail")
async def fetch_gmail(request: DataRequest):
    """Fetch Gmail using the gmail-fetch skill via pi RPC."""
    return await _fetch_gmail_logic(request.count, request.prompt)


@router.get("/gmail")
async def fetch_gmail_get(request: Request):
    """Fetch Gmail via GET (frontend cache-busting queries)."""
    params = dict(request.query_params)
    count = int(params.get("count", 10))
    prompt = params.get("q", "Show my latest emails")
    return await _fetch_gmail_logic(count, prompt)


@router.post("/calendar")
async def fetch_calendar(request: DataRequest):
    """Fetch Calendar events using the calendar-fetch skill via pi RPC."""
    return await _fetch_calendar_logic(request.date or "", request.prompt)


@router.get("/calendar")
async def fetch_calendar_get(request: Request):
    """Fetch Calendar via GET (frontend cache-busting queries)."""
    params = dict(request.query_params)
    date = params.get("date", "")
    prompt = params.get("q", "Show today's events")
    return await _fetch_calendar_logic(date, prompt)


@router.post("/tasks")
async def fetch_tasks(request: DataRequest):
    """Fetch Tasks using the tasks-fetch skill via pi RPC."""
    return await _fetch_tasks_logic(request.list_id or "", request.prompt)


@router.get("/tasks")
async def fetch_tasks_get(request: Request):
    """Fetch Tasks via GET (frontend cache-busting queries)."""
    params = dict(request.query_params)
    list_id = params.get("list_id", "")
    prompt = params.get("q", "Show my tasks")
    return await _fetch_tasks_logic(list_id, prompt)


@router.post("/drive")
async def fetch_drive(request: DataRequest):
    """Fetch Drive files using the drive-fetch skill via pi RPC."""
    return await _fetch_drive_logic(request.count, request.folder_id or "", request.prompt)


@router.get("/drive")
async def fetch_drive_get(request: Request):
    """Fetch Drive via GET (frontend cache-busting queries)."""
    params = dict(request.query_params)
    count = int(params.get("count", 10))
    folder_id = params.get("folder_id", "")
    prompt = params.get("q", "Show my files")
    return await _fetch_drive_logic(count, folder_id, prompt)
