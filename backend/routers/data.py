"""Data endpoints: Gmail, Calendar, Tasks, Drive, Docs.

Uses pi_simple.run_pi which spawns `pi -p --mode json` per request.
Responses are typed via parsers.parse_output() so the frontend can render
appropriately based on the detected type (email_list, event_list, etc.).
"""
import asyncio
from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel

from pi_simple import run_pi
from parsers import parse_output
from models import (
    DataRequest, AllDataRequest,
    DocsListRequest, DocsReadRequest, DocsWriteRequest,
    NotionRequest,
)
from cache_manager import cache

router = APIRouter(prefix="/api/data", tags=["data"])


def _build_response(result, extra: dict | None = None) -> dict:
    """Convert a ParseResult into the response dict."""
    resp = result.to_dict()
    if extra:
        resp.update(extra)
    return resp


# ─── Gmail ───────────────────────────────────────────────────────────────────

async def _fetch_gmail_logic(count: int, prompt: str, nocache: bool = False):
    params = {"count": count, "prompt": prompt}
    if not nocache:
        cached = cache.get("gmail", params)
        if cached:
            return cached
    try:
        text = await run_pi(
            "gmail",
            f"/skill:format-guide /skill:gmail-fetch Fetch {count} emails. Query: '{prompt}'",
            timeout=120,
        )
    except asyncio.TimeoutError:
        return {"type": "email_list", "status": "error", "error": "Request timed out. Please try again.", "data": {}}
    result = parse_output(text, type_hint="email_list")
    response = _build_response(result)
    cache.set("gmail", params, response)
    return response


@router.post("/gmail")
async def fetch_gmail(request: Request, body: DataRequest):
    # Check for _cb (cache-bust) in query string - frontend sends this on refresh
    nocache = body.nocache or request.query_params.get("_cb") is not None
    return await _fetch_gmail_logic(body.count, body.prompt, nocache)


@router.get("/gmail")
async def fetch_gmail_get(
    request: Request,
    count: int = Query(10, description="Number of emails to fetch"),
    q: str = Query("Show my latest emails", description="Query/prompt"),
    nocache: bool = Query(False, description="Bypass cache")
):
    return await _fetch_gmail_logic(count, q, nocache)


# ─── Calendar ─────────────────────────────────────────────────────────────────

async def _fetch_calendar_logic(date: str, prompt: str, nocache: bool = False):
    params = {"date": date, "prompt": prompt}
    if not nocache:
        cached = cache.get("calendar", params)
        if cached:
            return cached
    date_str = f"Date: '{date}'." if date else ""
    try:
        text = await run_pi(
            "calendar",
            f"/skill:format-guide /skill:calendar-fetch Fetch events. {date_str} Query: '{prompt}'",
            timeout=120,
        )
    except asyncio.TimeoutError:
        return {"type": "event_list", "status": "error", "error": "Request timed out. Please try again.", "date": date or "", "data": {}}
    result = parse_output(text, type_hint="event_list")
    response = _build_response(result, {"date": date or ""})
    cache.set("calendar", params, response)
    return response


@router.post("/calendar")
async def fetch_calendar(request: Request, body: DataRequest):
    # Check for _cb (cache-bust) in query string - frontend sends this on refresh
    nocache = body.nocache or request.query_params.get("_cb") is not None
    return await _fetch_calendar_logic(body.date or "", body.prompt, nocache)


@router.get("/calendar")
async def fetch_calendar_get(
    request: Request,
    date: str = Query("", description="Date filter"),
    q: str = Query("Show today's events", description="Query/prompt"),
    nocache: bool = Query(False, description="Bypass cache")
):
    return await _fetch_calendar_logic(date, q, nocache)


# ─── Tasks ───────────────────────────────────────────────────────────────────

async def _fetch_tasks_logic(list_id: str, prompt: str, nocache: bool = False):
    params = {"list_id": list_id, "prompt": prompt}
    if not nocache:
        cached = cache.get("tasks", params)
        if cached:
            return cached
    list_str = f"List: '{list_id}'." if list_id else ""
    try:
        text = await run_pi(
            "tasks",
            f"/skill:format-guide /skill:tasks-fetch Fetch tasks. {list_str} Query: '{prompt}'",
            timeout=120,
        )
    except asyncio.TimeoutError:
        return {"type": "task_list", "status": "error", "error": "Request timed out. Please try again.", "data": {}}
    result = parse_output(text, type_hint="task_list")
    response = _build_response(result)
    cache.set("tasks", params, response)
    return response


@router.post("/tasks")
async def fetch_tasks(request: Request, body: DataRequest):
    # Check for _cb (cache-bust) in query string - frontend sends this on refresh
    nocache = body.nocache or request.query_params.get("_cb") is not None
    return await _fetch_tasks_logic(body.list_id or "", body.prompt, nocache)


@router.get("/tasks")
async def fetch_tasks_get(
    request: Request,
    list_id: str = Query("", description="Task list ID"),
    q: str = Query("Show my tasks", description="Query/prompt"),
    nocache: bool = Query(False, description="Bypass cache")
):
    return await _fetch_tasks_logic(list_id, q, nocache)


# ─── Drive ───────────────────────────────────────────────────────────────────

async def _fetch_drive_logic(count: int, folder_id: str, prompt: str, nocache: bool = False):
    params = {"count": count, "folder_id": folder_id, "prompt": prompt}
    if not nocache:
        cached = cache.get("drive", params)
        if cached:
            return cached
    folder_str = f"Folder: '{folder_id}'." if folder_id else ""
    try:
        text = await run_pi(
            "drive",
            f"/skill:format-guide /skill:drive-fetch Fetch {count} files. {folder_str} Query: '{prompt}'",
            timeout=120,
        )
    except asyncio.TimeoutError:
        return {"type": "file_list", "status": "error", "error": "Request timed out. Please try again.", "data": {}}
    result = parse_output(text, type_hint="file_list")
    response = _build_response(result)
    cache.set("drive", params, response)
    return response


@router.post("/drive")
async def fetch_drive(request: Request, body: DataRequest):
    # Check for _cb (cache-bust) in query string - frontend sends this on refresh
    nocache = body.nocache or request.query_params.get("_cb") is not None
    return await _fetch_drive_logic(body.count, body.folder_id or "", body.prompt, nocache)


@router.get("/drive")
async def fetch_drive_get(
    request: Request,
    count: int = Query(10, description="Number of files to fetch"),
    folder_id: str = Query("", description="Folder ID"),
    q: str = Query("Show my files", description="Query/prompt"),
    nocache: bool = Query(False, description="Bypass cache")
):
    return await _fetch_drive_logic(count, folder_id, q, nocache)


# ─── Docs ────────────────────────────────────────────────────────────────────

async def _fetch_docs_logic(count: int, query: str, prompt: str, nocache: bool = False):
    params = {"count": count, "query": query, "prompt": prompt}
    if not nocache:
        cached = cache.get("docs", params)
        if cached:
            return cached
    query_str = f"Query: '{query}'." if query else ""
    text = await run_pi(
        "docs",
        f"/skill:format-guide /skill:docs-fetch Fetch {count} docs. {query_str} Prompt: '{prompt}'",
        timeout=60,
    )
    result = parse_output(text, type_hint="doc_list")
    response = _build_response(result)
    cache.set("docs", params, response)
    return response


async def _fetch_doc_content_logic(document_id: str, prompt: str, nocache: bool = False):
    params = {"document_id": document_id, "prompt": prompt}
    if not nocache:
        cached = cache.get("doc_content", params)
        if cached:
            return cached
    text = await run_pi(
        "docs",
        f"/skill:format-guide /skill:docs-fetch Read doc content for document ID '{document_id}'. Prompt: '{prompt}'",
        timeout=60,
    )
    result = parse_output(text, type_hint="doc_content")
    response = _build_response(result, {"document_id": document_id})
    cache.set("doc_content", params, response)
    return response


class DocsReadRequestWithNoCache(DocsReadRequest):
    nocache: bool = False


@router.post("/docs")
async def fetch_docs(request: Request, body: DocsListRequest):
    # Check for _cb (cache-bust) in query string - frontend sends this on refresh
    nocache = body.nocache or request.query_params.get("_cb") is not None
    return await _fetch_docs_logic(body.count, body.query or "", body.prompt, nocache)


@router.get("/docs")
async def fetch_docs_get(
    request: Request,
    count: int = Query(10, description="Number of docs to fetch"),
    q: str = Query("", description="Query"),
    prompt: str = Query("Show my documents", description="Prompt"),
    nocache: bool = Query(False, description="Bypass cache")
):
    return await _fetch_docs_logic(count, q, prompt, nocache)


@router.post("/docs/content")
async def fetch_doc_content(request: Request, body: DocsReadRequestWithNoCache):
    # Check for _cb (cache-bust) in query string - frontend sends this on refresh
    nocache = body.nocache or request.query_params.get("_cb") is not None
    return await _fetch_doc_content_logic(body.document_id, body.prompt, nocache)


@router.post("/docs/write")
async def write_doc(request: DocsWriteRequest):
    """Create or update a Google Doc.
    
    When writing to a document, clear its cached content.
    """
    if request.document_id:
        # Clear cache for this document
        cache.delete("doc_content", {"document_id": request.document_id, "prompt": ""})
        cache.delete("doc_content", {"document_id": request.document_id, "prompt": "Read doc content"})
        
        # Update existing document
        append_flag = "--append" if request.append else ""
        text = await run_pi(
            "docs",
            f"/skill:format-guide /skill:docs-fetch Write to doc {request.document_id}. "
            f"Append: {request.append}. Content: {request.content}",
            timeout=60,
        )
    else:
        # Create new document
        text = await run_pi(
            "docs",
            f"/skill:format-guide /skill:docs-fetch Create new doc titled '{request.title or 'Untitled'}'. "
            f"Content: {request.content}",
            timeout=60,
        )
    result = parse_output(text, type_hint="doc_content")
    return _build_response(result)


# ─── Notion ──────────────────────────────────────────────────────────────────

async def _fetch_notion_logic(count: int, query: str, prompt: str, nocache: bool = False):
    params = {"count": count, "query": query, "prompt": prompt}
    if not nocache:
        cached = cache.get("notion", params)
        if cached:
            return cached
    query_str = f"Query: '{query}'." if query else ""
    try:
        text = await run_pi(
            "notion",
            f"/skill:format-guide /skill:notion-cli Search Notion workspace. {query_str} Prompt: '{prompt}'",
            timeout=60,
        )
    except asyncio.TimeoutError:
        return {"type": "notion_list", "status": "error", "error": "Request timed out. Please try again.", "data": {}}
    result = parse_output(text, type_hint="notion_list")
    response = _build_response(result)
    cache.set("notion", params, response)
    return response


@router.post("/notion")
async def fetch_notion(request: Request, body: NotionRequest):
    nocache = body.nocache or request.query_params.get("_cb") is not None
    return await _fetch_notion_logic(body.count, body.query or "", body.prompt, nocache)


@router.get("/notion")
async def fetch_notion_get(
    request: Request,
    count: int = Query(10, description="Number of items to fetch"),
    q: str = Query("", description="Query"),
    prompt: str = Query("Show my Notion pages", description="Prompt"),
    nocache: bool = Query(False, description="Bypass cache")
):
    return await _fetch_notion_logic(count, q, prompt, nocache)


# ─── Batch / All Data ────────────────────────────────────────────────────────

@router.post("/all")
async def fetch_all_data(request: Request, body: AllDataRequest):
    # Check for _cb (cache-bust) in query string - frontend sends this on refresh
    nocache = body.nocache if hasattr(body, 'nocache') else request.query_params.get("_cb") is not None
    async def fetch_gmail():
        try:
            return await _fetch_gmail_logic(body.gmail_count, body.gmail_prompt, nocache)
        except Exception as e:
            return _build_response(parse_output(""), {"error": str(e), "status": "error"})

    async def fetch_calendar():
        try:
            return await _fetch_calendar_logic(body.calendar_date or "", body.calendar_prompt, nocache)
        except Exception as e:
            return _build_response(parse_output(""), {"error": str(e), "status": "error", "date": body.calendar_date or ""})

    async def fetch_tasks():
        try:
            return await _fetch_tasks_logic(body.tasks_list_id, body.tasks_prompt, nocache)
        except Exception as e:
            return _build_response(parse_output(""), {"error": str(e), "status": "error"})

    async def fetch_drive():
        try:
            return await _fetch_drive_logic(body.drive_count, "", body.drive_prompt, nocache)
        except Exception as e:
            return _build_response(parse_output(""), {"error": str(e), "status": "error"})

    async def fetch_docs():
        try:
            return await _fetch_docs_logic(body.docs_count, "", body.docs_prompt, nocache)
        except Exception as e:
            return _build_response(parse_output(""), {"error": str(e), "status": "error"})

    async def fetch_notion():
        try:
            return await _fetch_notion_logic(body.notion_count, "", body.notion_prompt, nocache)
        except Exception as e:
            return _build_response(parse_output(""), {"error": str(e), "status": "error"})

    gmail_data, calendar_data, tasks_data, drive_data, docs_data, notion_data = await asyncio.gather(
        fetch_gmail(), fetch_calendar(), fetch_tasks(), fetch_drive(), fetch_docs(), fetch_notion()
    )

    return {
        "gmail": gmail_data,
        "calendar": calendar_data,
        "tasks": tasks_data,
        "drive": drive_data,
        "docs": docs_data,
        "notion": notion_data,
        "status": "ok",
    }


# ─── Cache Management ───────────────────────────────────────────────────────


@router.get("/cache/stats")
async def cache_stats():
    """Get cache statistics."""
    return {
        "stats": cache.stats(),
        "status": "ok",
    }


@router.post("/cache/clear")
async def clear_cache(endpoint: str = None):
    """Clear cache entries.
    
    Args:
        endpoint: Optional endpoint name (gmail, calendar, tasks, drive, docs)
    
    Returns:
        Number of cache entries cleared
    """
    cleared = cache.clear(endpoint)
    return {
        "cleared": cleared,
        "endpoint": endpoint or "all",
        "status": "ok",
    }


@router.delete("/cache/expired")
async def cleanup_expired_cache():
    """Remove all expired cache entries."""
    removed = cache.cleanup_expired()
    return {
        "removed": removed,
        "status": "ok",
    }
