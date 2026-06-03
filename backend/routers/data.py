"""Data endpoints: Gmail, Calendar, Tasks, Drive.

All endpoints use a persistent pi --mode rpc process with the relevant skill.
Returns responses matching the frontend API types.
"""
import time
import asyncio
from fastapi import APIRouter, HTTPException, Request

from pi_rpc import pi_manager
from models import DataRequest, AllDataRequest, AllDataResponse

router = APIRouter(prefix="/api/data", tags=["data"])

# Simple in-memory TTL cache for data endpoints
_cache: dict[str, tuple[dict, float]] = {}
CACHE_TTL = 300  # 5 minutes


def _cache_key(endpoint: str, params: dict) -> str:
    return f"{endpoint}:{hash(tuple(sorted(params.items())))}"


def _get_cached(key: str) -> dict | None:
    entry = _cache.get(key)
    if not entry:
        return None
    data, ts = entry
    if time.time() - ts > CACHE_TTL:
        del _cache[key]
        return None
    return data


def _set_cached(key: str, data: dict) -> None:
    _cache[key] = (data, time.time())


# ─── Gmail ────────────────────────────────────────────────────────────────────

async def _fetch_gmail_logic(count: int, prompt: str):
    cache_key = _cache_key("gmail", {"count": count, "prompt": prompt})
    cached = _get_cached(cache_key)
    if cached:
        return cached
    prompt_text = f"/gmail-fetch Fetch {count} emails. Query: '{prompt}'"
    result = await pi_manager.get("gmail").prompt(prompt_text, timeout=60)
    if result.get("status") == "error":
        raise HTTPException(500, result.get("error", "Gmail fetch failed"))
    data = result.get("data", [])
    # The skill may return a list of objects or a single object with an 'emails' key.
    emails = []
    if isinstance(data, list) and len(data) > 0:
        first = data[0]
        if isinstance(first, dict) and "emails" in first:
            emails = first["emails"]
        elif isinstance(first, dict):
            emails = data
    elif isinstance(data, dict) and "emails" in data:
        emails = data["emails"]
    response = {"emails": emails, "status": "ok", "count": len(emails)}
    _set_cached(cache_key, response)
    return response


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


# ─── Calendar ─────────────────────────────────────────────────────────────────

async def _fetch_calendar_logic(date: str, prompt: str):
    cache_key = _cache_key("calendar", {"date": date, "prompt": prompt})
    cached = _get_cached(cache_key)
    if cached:
        return cached
    date_str = f"Date: '{date}'." if date else ""
    prompt_text = f"/calendar-fetch Fetch events. {date_str} Query: '{prompt}'"
    result = await pi_manager.get("calendar").prompt(prompt_text, timeout=60)
    if result.get("status") == "error":
        raise HTTPException(500, result.get("error", "Calendar fetch failed"))
    data = result.get("data", [])
    # Extract events from the skill response
    events = []
    if isinstance(data, list) and len(data) > 0:
        first = data[0]
        if isinstance(first, dict) and "events" in first:
            events = first["events"]
        elif isinstance(first, dict):
            events = data
    elif isinstance(data, dict) and "events" in data:
        events = data["events"]
    response = {"events": events, "status": "ok", "date": date or "", "count": len(events)}
    _set_cached(cache_key, response)
    return response


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


# ─── Tasks ──────────────────────────────────────────────────────────────────

async def _fetch_tasks_logic(list_id: str, prompt: str):
    cache_key = _cache_key("tasks", {"list_id": list_id, "prompt": prompt})
    cached = _get_cached(cache_key)
    if cached:
        return cached
    list_str = f"List: '{list_id}'." if list_id else ""
    prompt_text = f"/tasks-fetch Fetch tasks. {list_str} Query: '{prompt}'"
    result = await pi_manager.get("tasks").prompt(prompt_text, timeout=60)
    if result.get("status") == "error":
        raise HTTPException(500, result.get("error", "Tasks fetch failed"))
    data = result.get("data", [])
    tasks = []
    if isinstance(data, list) and len(data) > 0:
        first = data[0]
        if isinstance(first, dict) and "tasks" in first:
            tasks = first["tasks"]
        elif isinstance(first, dict):
            tasks = data
    elif isinstance(data, dict) and "tasks" in data:
        tasks = data["tasks"]
    response = {"tasks": tasks, "status": "ok", "count": len(tasks)}
    _set_cached(cache_key, response)
    return response


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


# ─── Drive ───────────────────────────────────────────────────────────────────

async def _fetch_drive_logic(count: int, folder_id: str, prompt: str):
    cache_key = _cache_key("drive", {"count": count, "folder_id": folder_id, "prompt": prompt})
    cached = _get_cached(cache_key)
    if cached:
        return cached
    folder_str = f"Folder: '{folder_id}'." if folder_id else ""
    prompt_text = f"/drive-fetch Fetch {count} files. {folder_str} Query: '{prompt}'"
    result = await pi_manager.get("drive").prompt(prompt_text, timeout=60)
    if result.get("status") == "error":
        raise HTTPException(500, result.get("error", "Drive fetch failed"))
    data = result.get("data", [])
    files = []
    if isinstance(data, list) and len(data) > 0:
        first = data[0]
        if isinstance(first, dict) and "files" in first:
            files = first["files"]
        elif isinstance(first, dict):
            files = data
    elif isinstance(data, dict) and "files" in data:
        files = data["files"]
    response = {"files": files, "status": "ok", "count": len(files)}
    _set_cached(cache_key, response)
    return response


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


# ─── Batch / All Data ─────────────────────────────────────────────────────────

@router.post("/all")
async def fetch_all_data(request: AllDataRequest):
    """Fetch Gmail, Calendar, Tasks, and Drive in parallel.

    Returns all data in a single response, reducing frontend round-trips
    from 4 separate HTTP requests to 1.
    """
    async def fetch_gmail():
        try:
            return await _fetch_gmail_logic(request.gmail_count, request.gmail_prompt)
        except Exception as e:
            return {"emails": [], "status": "error", "error": str(e), "count": 0}

    async def fetch_calendar():
        try:
            return await _fetch_calendar_logic(request.calendar_date or "", request.calendar_prompt)
        except Exception as e:
            return {"events": [], "status": "error", "error": str(e), "date": request.calendar_date or "", "count": 0}

    async def fetch_tasks():
        try:
            return await _fetch_tasks_logic(request.tasks_list_id, request.tasks_prompt)
        except Exception as e:
            return {"tasks": [], "status": "error", "error": str(e), "count": 0}

    async def fetch_drive():
        try:
            return await _fetch_drive_logic(request.drive_count, "", request.drive_prompt)
        except Exception as e:
            return {"files": [], "status": "error", "error": str(e), "count": 0}

    gmail_data, calendar_data, tasks_data, drive_data = await asyncio.gather(
        fetch_gmail(), fetch_calendar(), fetch_tasks(), fetch_drive()
    )

    return {
        "gmail": gmail_data,
        "calendar": calendar_data,
        "tasks": tasks_data,
        "drive": drive_data,
        "status": "ok",
    }
