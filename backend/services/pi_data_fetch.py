"""Data fetch wrappers that route every request through a headless pi session.

Each function spawns a pi agent, gives it a task description, and lets the agent
follow the relevant skill workflow to fetch data directly using bash + curl.
The agent exits after returning the result.

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
    """Fetch Gmail data via a headless pi session using the gmail-fetch skill."""
    key = _cache_key("gmail", prompt, count)
    cached = _get_cached(key)
    if cached:
        return cached

    task = f"Follow the gmail-fetch skill workflow. Fetch {count} emails from Gmail"
    if prompt:
        task += f" matching the query: '{prompt}'"
    task += ". Return the results as JSON with emails array containing id, subject, from_name, from_email, date, preview."

    output = await run_pi_agent(task, timeout=120)
    result = parse_pi_output(output)
    _set_cached(key, result)
    return result


async def fetch_calendar_pi(prompt: str = None, date: str = None) -> dict:
    """Fetch Calendar data via a headless pi session using the calendar-fetch skill."""
    key = _cache_key("calendar", prompt, date)
    cached = _get_cached(key)
    if cached:
        return cached

    task = "Follow the calendar-fetch skill workflow. Fetch calendar events"
    if prompt:
        task += f" matching the query: '{prompt}'"
    if date:
        task += f" for date '{date}'"
    else:
        task += " for today"
    task += ". Return the results as JSON with events array containing id, summary, start, end, location."

    output = await run_pi_agent(task, timeout=120)
    result = parse_pi_output(output)
    _set_cached(key, result)
    return result


async def fetch_tasks_pi(prompt: str = None, list_id: str = "default") -> dict:
    """Fetch Tasks data via a headless pi session using the tasks-fetch skill."""
    key = _cache_key("tasks", prompt, list_id)
    cached = _get_cached(key)
    if cached:
        return cached

    task = f"Follow the tasks-fetch skill workflow. Fetch tasks from list '{list_id}'"
    if prompt:
        task += f" matching the query: '{prompt}'"
    task += ". Return the results as JSON with tasks array containing id, title, completed, due."

    output = await run_pi_agent(task, timeout=120)
    result = parse_pi_output(output)
    _set_cached(key, result)
    return result


async def fetch_drive_pi(prompt: str = None, count: int = 10) -> dict:
    """Fetch Drive data via a headless pi session using the drive-fetch skill."""
    key = _cache_key("drive", prompt, count)
    cached = _get_cached(key)
    if cached:
        return cached

    task = f"Follow the drive-fetch skill workflow. Fetch {count} recent files from Google Drive"
    if prompt:
        task += f" matching the query: '{prompt}'"
    task += ". Return the results as JSON with files array containing id, name, mimeType, modifiedTime, size."

    output = await run_pi_agent(task, timeout=120)
    result = parse_pi_output(output)
    _set_cached(key, result)
    return result


async def do_web_research_pi(topic: str) -> dict:
    """Perform web research via a headless pi session using the web-research skill."""
    key = _cache_key("research", topic)
    cached = _get_cached(key)
    if cached:
        return cached

    task = f"Follow the web-research skill workflow. Research the topic: '{topic}'. Return a structured report with summary, key findings, and sources as JSON."
    output = await run_pi_agent(task, timeout=120)
    result = parse_pi_output(output)
    _set_cached(key, result)
    return result
