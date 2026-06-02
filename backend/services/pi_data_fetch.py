"""Data fetch wrappers that route every request through a headless pi session.

Each function spawns a pi agent, gives it a task description, and lets the agent
use the project-specific extension tools (fetch_gmail, fetch_calendar, fetch_tasks, fetch_drive)
to fetch data directly. The agent exits after returning the result.

A simple in-memory TTL cache keeps responses warm so widgets don't block on
every refresh.
"""

import re
import time
from typing import Any, Dict, Optional

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


def parse_gmail_query(prompt: str) -> tuple[Optional[str], int]:
    """Parse a natural language prompt into a Gmail search query.
    
    Returns (gmail_query, count).  gmail_query is None if no filter found.
    
    Handles:
      - "emails from tradera"        → query='from:tradera'
      - "tldr ai emails"              → query='from:tldr.ai'
      - "starred emails"              → query='is:starred'
      - "unread emails"               → query='is:unread'
      - "emails about meeting"        → query='subject:meeting'
      - "emails from alice@example"   → query='from:alice@example'
      - "last 5 emails"               → count=5
      - "today's emails"              → query='newer_than:1d'
      - "this week emails"            → query='newer_than:7d'
    """
    if not prompt:
        return None, 10
    
    p = prompt.strip().lower()
    parts = []
    count = 10
    
    # Extract count
    count_match = re.search(r'(\d+)\s*(?:emails?|messages?)', p)
    if count_match:
        count = int(count_match.group(1))
    
    # Check for explicit Gmail operators first
    for op in ['from:', 'to:', 'subject:', 'is:', 'after:', 'before:', 'has:', 'label:', 'newer_than:', 'older_than:']:
        if op in p:
            # Already has operators — use as-is
            return prompt, count
    
    # Natural language patterns
    
    # "from X" / "emails from X" / "get emails from X"
    from_match = re.search(r'emails?\s+(?:from|by)\s+([\w.@-]+)', p)
    if not from_match:
        from_match = re.search(r'from\s+([\w.@-]+)\s+emails?', p)
    if from_match:
        sender = from_match.group(1)
        # "myself", "me", "self" → Gmail's from:me
        if sender in ('myself', 'me', 'self'):
            parts.append('from:me')
        else:
            parts.append(f'from:{sender}')
    
    # "starred" / "unread" / "important"
    if 'starred' in p:
        parts.append('is:starred')
    if 'unread' in p:
        parts.append('is:unread')
    if 'important' in p:
        parts.append('is:important')
    
    # "today" / "this week" / "last week"
    if any(w in p for w in ["today", "today's", "todays"]):
        parts.append('newer_than:1d')
    elif 'this week' in p:
        parts.append('newer_than:7d')
    elif 'last week' in p:
        parts.append('newer_than:14d')
    
    # "about X" / "subject X" / "mentioning X" / "containing X"
    about_match = re.search(r'(?:about|subject|mentioning|containing|with\s+subject)\s+["\']?(.+?)["\']?(?:\s|$)', p)
    if about_match:
        parts.append(f'subject:{about_match.group(1).strip()}')
    
    # Brand/newsletter detection: "tldr ai emails" → from:tldr.ai
    # If no parts matched yet and there are non-stopword tokens, use them as a generic query
    if not parts:
        # Remove common filler words
        fillers = {'get', 'all', 'my', 'the', 'last', 'recent', 'latest', 'emails', 'email',
                   'messages', 'message', 'show', 'find', 'fetch', 'list', 'display', 'a', 'an',
                   'me', 'myself', 'i', 'you', 'your', 'we', 'us', 'our', 'him', 'her', 'his',
                   'they', 'them', 'their', 'its', 'it'}
        tokens = [t for t in re.split(r'\s+', p) if t not in fillers and len(t) > 1]
        if tokens:
            # If the remaining tokens are purely numeric (e.g. "10" from "last 10 emails"),
            # there is no filter query — just return the count.
            if all(t.isdigit() for t in tokens):
                return None, count
            # If it looks like a domain or brand, search from: that
            combined = ' '.join(tokens)
            if '.' in combined or len(tokens) <= 2:
                parts.append(f'from:{combined.replace(' ', '.')}')
            else:
                parts.append(f'subject:({combined})')
    
    query = ' '.join(parts) if parts else None
    return query, count


async def fetch_gmail_pi(prompt: str = None, count: int = 10) -> dict:
    """Fetch Gmail data via a headless pi session using the fetch_gmail tool."""
    # Parse natural language into a Gmail query
    gmail_query, parsed_count = parse_gmail_query(prompt)
    effective_count = parsed_count or count
    
    key = _cache_key("gmail", gmail_query, effective_count)
    cached = _get_cached(key)
    if cached:
        return cached

    if gmail_query:
        task = (
            f"Use the fetch_gmail tool with query='{gmail_query}' to get {effective_count} emails. "
            "Return the results as JSON with emails array containing id, subject, from, date, preview."
        )
    else:
        task = (
            f"Use the fetch_gmail tool to get the last {effective_count} emails from the user's inbox. "
            "Return the results as JSON with emails array containing id, subject, from, date, preview."
        )
    
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
