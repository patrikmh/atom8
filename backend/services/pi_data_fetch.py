"""Data fetch wrappers that route every request through a headless pi session.

Each function spawns a pi agent, gives it a task description, and lets the agent
use the project-specific extension tools (fetch_gmail, fetch_calendar, fetch_tasks, fetch_drive)
to fetch data directly. The agent exits after returning the result.

A simple in-memory TTL cache keeps responses warm so widgets don't block on
every refresh.
"""

import time
from typing import Any, Dict

from services.pi_agent import run_pi_agent, parse_pi_output

# In-memory TTL cache: {key: (timestamp, data)}
_cache: Dict[str, Any] = {}
DEFAULT_CACHE_TTL = 30  # seconds


def _cache_key(endpoint: str, *args) -> str:
    return f"{endpoint}:{':'.join(str(a) for a in args)}"


def _get_cached(key: str, ttl: int = DEFAULT_CACHE_TTL):
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry[0] < ttl:
        return entry[1]
    return None


def _set_cached(key: str, data: dict):
    _cache[key] = (time.time(), data)


def clear_cache():
    """Clear the data fetch cache."""
    _cache.clear()


async def fetch_gmail_pi(prompt: str = None, count: int = 10) -> dict:
    """Fetch Gmail data via a headless pi session using the fetch_gmail tool."""
    key = _cache_key("gmail", prompt, count)
    cached = _get_cached(key)
    if cached:
        return cached

    task = f"Use the fetch_gmail tool to get the last {count} emails from the user's inbox."
    if prompt and any(kw in prompt.lower() for kw in ['from:', 'to:', 'subject:', 'is:', 'after:', 'before:', 'has:', 'label:']):
        task += f" Filter with query: '{prompt}'."
    task += " Return the results as JSON with emails array containing id, subject, from, date, preview."
    output = await run_pi_agent(task, timeout=120)
    result = parse_pi_output(output)
    _set_cached(key, result)
    return result


async def fetch_calendar_pi(prompt: str = None, date: str = None) -> dict:
    """Fetch Calendar data via a headless pi session using the fetch_calendar tool."""
    key = _cache_key("calendar", prompt, date)
    cached = _get_cached(key)
    if cached:
        return cached

    task = "Use the fetch_calendar tool to get today's calendar events."
    if date:
        task += f" Use date: '{date}'."
    task += " Return the results as JSON with events array containing id, summary, start, end, location."
    output = await run_pi_agent(task, timeout=120)
    result = parse_pi_output(output)
    _set_cached(key, result)
    return result


async def fetch_tasks_pi(prompt: str = None, list_id: str = "default") -> dict:
    """Fetch Tasks data via a headless pi session using the fetch_tasks tool."""
    key = _cache_key("tasks", prompt, list_id)
    cached = _get_cached(key)
    if cached:
        return cached

    task = f"Use the fetch_tasks tool to get tasks from list '{list_id}'."
    task += " Return the results as JSON with tasks array containing id, title, completed, due."
    output = await run_pi_agent(task, timeout=120)
    result = parse_pi_output(output)
    _set_cached(key, result)
    return result


async def fetch_drive_pi(prompt: str = None, count: int = 10) -> dict:
    """Fetch Drive data via a headless pi session using the fetch_drive tool."""
    key = _cache_key("drive", prompt, count)
    cached = _get_cached(key)
    if cached:
        return cached

    task = f"Use the fetch_drive tool to get the last {count} files from the user's Drive."
    task += " Return the results as JSON with files array containing id, name, mimeType, modifiedTime, size."
    output = await run_pi_agent(task, timeout=120)
    result = parse_pi_output(output)
    _set_cached(key, result)
    return result


async def do_web_research_pi(topic: str) -> dict:
    """Perform web research via a headless pi session."""
    key = _cache_key("research", topic)
    cached = _get_cached(key)
    if cached:
        return cached

    system = (
        "You are a web research agent. Use the deep-research skill to research the topic. "
        "Return ONLY the JSON output, no extra text."
    )
    task = f"Research the topic: '{topic}'. Return a summary with sources as JSON."
    output = await run_pi_agent(task, system_prompt=system, timeout=120)
    result = parse_pi_output(output)
    _set_cached(key, result)
    return result
