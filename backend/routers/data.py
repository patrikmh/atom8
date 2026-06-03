"""Data endpoints: Gmail, Calendar, Tasks, Drive.

Uses pi_simple.run_pi which spawns `pi -p --mode json` per request.
Responses are typed via parsers.parse_output() so the frontend can render
appropriately based on the detected type (email_list, event_list, etc.).
"""
import time
import asyncio
from fastapi import APIRouter, HTTPException, Request

from pi_simple import run_pi
from parsers import parse_output
from models import DataRequest, AllDataRequest

router = APIRouter(prefix="/api/data", tags=["data"])

# ─── Cache ───────────────────────────────────────────────────────────────────
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


def _build_response(result, extra: dict | None = None) -> dict:
    """Convert a ParseResult into the response dict."""
    resp = result.to_dict()
    if extra:
        resp.update(extra)
    return resp


# ─── Gmail ───────────────────────────────────────────────────────────────────

async def _fetch_gmail_logic(count: int, prompt: str, nocache: bool = False):
    cache_key = _cache_key("gmail", {"count": count, "prompt": prompt})
    if not nocache:
        cached = _get_cached(cache_key)
        if cached:
            return cached
    text = await run_pi(
        "gmail",
        f"/skill:format-guide /skill:gmail-fetch Fetch {count} emails. Query: '{prompt}'",
        timeout=60,
    )
    result = parse_output(text, type_hint="email_list")
    response = _build_response(result)
    _set_cached(cache_key, response)
    return response


@router.post("/gmail")
async def fetch_gmail(request: DataRequest):
    return await _fetch_gmail_logic(request.count, request.prompt)


@router.get("/gmail")
async def fetch_gmail_get(request: Request):
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
    text = await run_pi(
        "calendar",
        f"/skill:format-guide /skill:calendar-fetch Fetch events. {date_str} Query: '{prompt}'",
        timeout=60,
    )
    result = parse_output(text, type_hint="event_list")
    response = _build_response(result, {"date": date or ""})
    _set_cached(cache_key, response)
    return response


@router.post("/calendar")
async def fetch_calendar(request: DataRequest):
    return await _fetch_calendar_logic(request.date or "", request.prompt)


@router.get("/calendar")
async def fetch_calendar_get(request: Request):
    params = dict(request.query_params)
    date = params.get("date", "")
    prompt = params.get("q", "Show today's events")
    return await _fetch_calendar_logic(date, prompt)


# ─── Tasks ───────────────────────────────────────────────────────────────────

async def _fetch_tasks_logic(list_id: str, prompt: str):
    cache_key = _cache_key("tasks", {"list_id": list_id, "prompt": prompt})
    cached = _get_cached(cache_key)
    if cached:
        return cached
    list_str = f"List: '{list_id}'." if list_id else ""
    text = await run_pi(
        "tasks",
        f"/skill:format-guide /skill:tasks-fetch Fetch tasks. {list_str} Query: '{prompt}'",
        timeout=60,
    )
    result = parse_output(text, type_hint="task_list")
    response = _build_response(result)
    _set_cached(cache_key, response)
    return response


@router.post("/tasks")
async def fetch_tasks(request: DataRequest):
    return await _fetch_tasks_logic(request.list_id or "", request.prompt)


@router.get("/tasks")
async def fetch_tasks_get(request: Request):
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
    text = await run_pi(
        "drive",
        f"/skill:format-guide /skill:drive-fetch Fetch {count} files. {folder_str} Query: '{prompt}'",
        timeout=60,
    )
    result = parse_output(text, type_hint="file_list")
    response = _build_response(result)
    _set_cached(cache_key, response)
    return response


@router.post("/drive")
async def fetch_drive(request: DataRequest):
    return await _fetch_drive_logic(request.count, request.folder_id or "", request.prompt)


@router.get("/drive")
async def fetch_drive_get(request: Request):
    params = dict(request.query_params)
    count = int(params.get("count", 10))
    folder_id = params.get("folder_id", "")
    prompt = params.get("q", "Show my files")
    return await _fetch_drive_logic(count, folder_id, prompt)


# ─── Batch / All Data ────────────────────────────────────────────────────────

@router.post("/all")
async def fetch_all_data(request: AllDataRequest):
    async def fetch_gmail():
        try:
            return await _fetch_gmail_logic(request.gmail_count, request.gmail_prompt)
        except Exception as e:
            return _build_response(parse_output(""), {"error": str(e), "status": "error"})

    async def fetch_calendar():
        try:
            return await _fetch_calendar_logic(request.calendar_date or "", request.calendar_prompt)
        except Exception as e:
            return _build_response(parse_output(""), {"error": str(e), "status": "error", "date": request.calendar_date or ""})

    async def fetch_tasks():
        try:
            return await _fetch_tasks_logic(request.tasks_list_id, request.tasks_prompt)
        except Exception as e:
            return _build_response(parse_output(""), {"error": str(e), "status": "error"})

    async def fetch_drive():
        try:
            return await _fetch_drive_logic(request.drive_count, "", request.drive_prompt)
        except Exception as e:
            return _build_response(parse_output(""), {"error": str(e), "status": "error"})

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
