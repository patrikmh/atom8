"""Data endpoints: Gmail, Calendar, Tasks, Drive.

Uses pi_simple.run_pi which spawns `pi -p --mode json` per request.
Returns raw markdown text from the pi agent so the frontend can render it.
"""
import time
import asyncio
from fastapi import APIRouter, HTTPException, Request

from pi_simple import run_pi
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

async def _fetch_gmail_logic(count: int, prompt: str, nocache: bool = False):
    cache_key = _cache_key("gmail", {"count": count, "prompt": prompt})
    if not nocache:
        cached = _get_cached(cache_key)
        if cached:
            return cached
    text = await run_pi("gmail", f"/skill:gmail-fetch Fetch {count} emails. Query: '{prompt}'", timeout=60)
    response = {"text": text, "status": "ok"}
    _set_cached(cache_key, response)
    return response


@router.post("/gmail")
async def fetch_gmail(request: DataRequest):
    """Fetch Gmail using the gmail-fetch skill via pi."""
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
    text = await run_pi("calendar", f"/skill:calendar-fetch Fetch events. {date_str} Query: '{prompt}'", timeout=60)
    response = {"text": text, "status": "ok", "date": date or ""}
    _set_cached(cache_key, response)
    return response


@router.post("/calendar")
async def fetch_calendar(request: DataRequest):
    """Fetch Calendar events using the calendar-fetch skill via pi."""
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
    text = await run_pi("tasks", f"/skill:tasks-fetch Fetch tasks. {list_str} Query: '{prompt}'", timeout=60)
    response = {"text": text, "status": "ok"}
    _set_cached(cache_key, response)
    return response


@router.post("/tasks")
async def fetch_tasks(request: DataRequest):
    """Fetch Tasks using the tasks-fetch skill via pi."""
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
    text = await run_pi("drive", f"/skill:drive-fetch Fetch {count} files. {folder_str} Query: '{prompt}'", timeout=60)
    response = {"text": text, "status": "ok"}
    _set_cached(cache_key, response)
    return response


@router.post("/drive")
async def fetch_drive(request: DataRequest):
    """Fetch Drive files using the drive-fetch skill via pi."""
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
            return {"text": "", "status": "error", "error": str(e)}

    async def fetch_calendar():
        try:
            return await _fetch_calendar_logic(request.calendar_date or "", request.calendar_prompt)
        except Exception as e:
            return {"text": "", "status": "error", "error": str(e), "date": request.calendar_date or ""}

    async def fetch_tasks():
        try:
            return await _fetch_tasks_logic(request.tasks_list_id, request.tasks_prompt)
        except Exception as e:
            return {"text": "", "status": "error", "error": str(e)}

    async def fetch_drive():
        try:
            return await _fetch_drive_logic(request.drive_count, "", request.drive_prompt)
        except Exception as e:
            return {"text": "", "status": "error", "error": str(e)}

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
