"""Google API service using stored OAuth tokens."""
import json
import os
import httpx
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta

AUTH_JSON_PATH = os.path.expanduser("~/.pi/agent/auth.json")
SESSION_DIR = os.path.expanduser("~/.pi/agent/sessions/--Users-patrikandersson-telegram-atom8--/")
GOOGLE_API_BASE = "https://www.googleapis.com"
GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"


def get_google_token_from_session() -> Optional[Dict[str, Any]]:
    """Read the most recent Google OAuth token from pi session store."""
    try:
        import glob
        files = sorted(glob.glob(os.path.join(SESSION_DIR, "*.jsonl")), key=os.path.getmtime, reverse=True)
        for f in files:
            with open(f, "r") as fh:
                for line in fh:
                    try:
                        entry = json.loads(line)
                        if entry.get("type") == "custom" and entry.get("customType") == "google-auth":
                            data = entry.get("data", {})
                            if data.get("accessToken") and data.get("refreshToken"):
                                return {
                                    "access": data["accessToken"],
                                    "refresh": data["refreshToken"],
                                    "expires": data.get("expiresAt", 0),
                                }
                    except Exception:
                        pass
    except Exception:
        pass
    return None


def get_google_token() -> Optional[Dict[str, Any]]:
    """Read the freshest valid Google OAuth token from session store or auth.json."""
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    session_token = get_google_token_from_session()
    auth_token = None
    try:
        with open(AUTH_JSON_PATH, "r") as f:
            auth = json.load(f)
        raw = auth.get("google-antigravity")
        if raw and raw.get("access") and raw.get("refresh"):
            auth_token = {
                "access": raw["access"],
                "refresh": raw["refresh"],
                "expires": raw.get("expires", 0),
            }
    except Exception:
        pass

    # Pick the non-expired token, or the one with the later expiry
    session_valid = session_token and session_token.get("expires", 0) > now_ms + 60000
    auth_valid = auth_token and auth_token.get("expires", 0) > now_ms + 60000

    if session_valid and auth_valid:
        # Both valid — pick the one that expires later
        return session_token if session_token["expires"] >= auth_token["expires"] else auth_token
    if session_valid:
        return session_token
    if auth_valid:
        return auth_token

    # Neither is valid — return the one that exists (caller will handle refresh)
    return session_token or auth_token


def get_client_credentials() -> tuple[Optional[str], Optional[str]]:
    """Get Google OAuth client ID and secret from environment."""
    client_id = os.getenv("GOOGLE_CLIENT_ID") or os.getenv("GMAIL_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET") or os.getenv("GMAIL_CLIENT_SECRET")
    return client_id, client_secret


async def refresh_access_token(refresh_token: str) -> Optional[Dict[str, Any]]:
    """Refresh Google access token using refresh token."""
    client_id, client_secret = get_client_credentials()
    if not client_id or not client_secret:
        return None

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_OAUTH_TOKEN_URL,
            data={
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "refresh_token",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        return {
            "access": data["access_token"],
            "expires": int((datetime.now(timezone.utc).timestamp() + data["expires_in"]) * 1000),
        }


async def get_access_token() -> Optional[str]:
    """Get current Google access token, refreshing if needed."""
    token = get_google_token()
    if not token:
        return None

    access = token.get("access")
    expires = token.get("expires", 0)
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    # If expired, try to refresh
    if expires < now_ms + 60000:  # 1 minute buffer
        refresh_token = token.get("refresh")
        if refresh_token:
            new_token = await refresh_access_token(refresh_token)
            if new_token:
                # Update auth.json
                try:
                    with open(AUTH_JSON_PATH, "r") as f:
                        auth = json.load(f)
                    if "google-antigravity" in auth:
                        auth["google-antigravity"]["access"] = new_token["access"]
                        auth["google-antigravity"]["expires"] = new_token["expires"]
                        with open(AUTH_JSON_PATH, "w") as f:
                            json.dump(auth, f, indent=2)
                    access = new_token["access"]
                except Exception:
                    pass
            else:
                # Refresh failed — token is permanently invalid
                return None
        else:
            # No refresh token available
            return None

    return access


async def get_auth_header() -> Optional[Dict[str, str]]:
    """Get Authorization header with current access token."""
    access = await get_access_token()
    if not access:
        return None
    return {"Authorization": f"Bearer {access}"}


def parse_email(msg: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Gmail API message into simplified format."""
    headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
    return {
        "id": msg.get("id", ""),
        "from_name": headers.get("from", "").split("<")[0].strip(),
        "from_email": headers.get("from", ""),
        "subject": headers.get("subject", "(no subject)"),
        "preview": msg.get("snippet", "")[:120],
        "date": headers.get("date", ""),
        "is_read": "UNREAD" not in msg.get("labelIds", []),
    }


def parse_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Calendar API event into simplified format."""
    start = event.get("start", {})
    end = event.get("end", {})
    start_time = start.get("dateTime", start.get("date", ""))
    end_time = end.get("dateTime", end.get("date", ""))

    # Color mapping
    colors = {
        "1": "#a4bdfc", "2": "#7ae7bf", "3": "#dbadff", "4": "#ff887c",
        "5": "#fbd75b", "6": "#ffb878", "7": "#46d6db", "8": "#e1e1e1",
        "9": "#5484ed", "10": "#51b749", "11": "#dc2127",
    }
    color = colors.get(str(event.get("colorId", "")), "#4285f4")

    return {
        "id": event.get("id", ""),
        "title": event.get("summary", "(no title)"),
        "start": start_time,
        "end": end_time,
        "location": event.get("location", ""),
        "color": color,
    }


def _infer_priority(task: Dict[str, Any]) -> str:
    """Infer priority from task title/notes using keyword heuristics."""
    text = f"{task.get('title', '')} {task.get('notes', '')}".lower()
    high_keywords = ['urgent', 'asap', 'critical', 'important', 'high priority', 'p1', 'priority: high']
    low_keywords = ['low priority', 'whenever', 'someday', 'later', 'p3', 'priority: low']
    if any(k in text for k in high_keywords):
        return 'high'
    if any(k in text for k in low_keywords):
        return 'low'
    return 'medium'


def parse_task(task: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Tasks API task into simplified format."""
    return {
        "id": task.get("id", ""),
        "title": task.get("title", ""),
        "completed": task.get("status") == "completed",
        "priority": _infer_priority(task),
        "due_date": task.get("due", None),
    }


def parse_drive_file(file: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Drive API file into simplified format."""
    size = file.get("size")
    mime = file.get("mimeType", "")
    icon = "document"
    if "folder" in mime:
        icon = "folder"
    elif "pdf" in mime:
        icon = "pdf"
    elif "spreadsheet" in mime or "excel" in mime:
        icon = "spreadsheet"
    elif "image" in mime:
        icon = "image"
    elif "presentation" in mime or "powerpoint" in mime:
        icon = "presentation"

    return {
        "id": file.get("id", ""),
        "name": file.get("name", ""),
        "mime_type": mime,
        "size": int(size) if size else None,
        "modified": file.get("modifiedTime", ""),
        "icon": icon,
    }


async def fetch_gmail(count: int = 10, prompt: Optional[str] = None) -> Dict[str, Any]:
    """Fetch recent emails from Gmail API."""
    headers = await get_auth_header()
    if not headers:
        return {"error": "Google authentication required. Please re-authenticate.", "emails": [], "needs_auth": True}

    # Parse prompt for query parameters
    query = ""
    if prompt:
        prompt_lower = prompt.lower()
        import re

        # Extract count from prompt
        count_match = re.search(r'\b(\d+)\s+email', prompt_lower)
        if count_match:
            count = int(count_match.group(1))

        # Extract sender
        from_match = re.search(r'from\s+([\w.@-]+)', prompt_lower)
        if from_match:
            query += f"from:{from_match.group(1)} "

        # Extract unread filter
        if "unread" in prompt_lower:
            query += "is:unread "

        # Extract starred filter
        if "starred" in prompt_lower:
            query += "is:starred "

        # Extract subject filter
        subject_match = re.search(r'subject\s+(["\']?)(.+?)\1', prompt_lower)
        if subject_match:
            query += f"subject:{subject_match.group(2)} "

        # Extract explicit after/before dates
        after_match = re.search(r'after\s+(\d{4}-\d{2}-\d{2})', prompt_lower)
        if after_match:
            query += f"after:{after_match.group(1)} "
        before_match = re.search(r'before\s+(\d{4}-\d{2}-\d{2})', prompt_lower)
        if before_match:
            query += f"before:{before_match.group(1)} "

        # Handle natural language date ranges
        now = datetime.now(timezone.utc)
        if "last week" in prompt_lower:
            # Monday to Sunday of last week
            days_since_monday = now.weekday()
            last_monday = now - timedelta(days=days_since_monday + 7)
            last_sunday = last_monday + timedelta(days=6)
            query += f"after:{last_monday.strftime('%Y-%m-%d')} before:{last_sunday.strftime('%Y-%m-%d')} "
        elif "this week" in prompt_lower:
            days_since_monday = now.weekday()
            this_monday = now - timedelta(days=days_since_monday)
            this_sunday = this_monday + timedelta(days=6)
            query += f"after:{this_monday.strftime('%Y-%m-%d')} before:{this_sunday.strftime('%Y-%m-%d')} "
        elif "yesterday" in prompt_lower:
            yesterday = now - timedelta(days=1)
            query += f"after:{yesterday.strftime('%Y-%m-%d')} before:{now.strftime('%Y-%m-%d')} "
        elif "today" in prompt_lower:
            query += f"after:{now.strftime('%Y-%m-%d')} "
        elif "last month" in prompt_lower:
            first_this_month = now.replace(day=1)
            last_month_end = first_this_month - timedelta(days=1)
            last_month_start = last_month_end.replace(day=1)
            query += f"after:{last_month_start.strftime('%Y-%m-%d')} before:{last_month_end.strftime('%Y-%m-%d')} "

        # Extract keyword / "mentioning X" / "about X" / "containing X"
        # These are words that aren't matched by other filters
        keyword_patterns = [
            r'(?:mentioning|about|containing|with|searching for|find|find all)\s+(["\']?)(.+?)\1',
            r'(?:emails?|messages?|mail)\s+(?:about|mentioning|with|containing)\s+(["\']?)(.+?)\1',
        ]
        for pattern in keyword_patterns:
            kw_match = re.search(pattern, prompt_lower)
            if kw_match:
                keyword = kw_match.group(2).strip()
                # Don't add if it's already part of another filter
                if keyword and keyword not in ['email', 'emails', 'mail', 'messages', 'message', 'unread', 'starred']:
                    # Add keyword if not already in query
                    if keyword not in query:
                        query += f"{keyword} "
                    break

        # Extract attachment filter
        if "attachment" in prompt_lower or "attached" in prompt_lower:
            query += "has:attachment "

    async with httpx.AsyncClient() as client:
        # First list messages
        params: Dict[str, Any] = {"maxResults": count, "labelIds": "INBOX"}
        if query:
            params["q"] = query.strip()
        resp = await client.get(
            f"{GOOGLE_API_BASE}/gmail/v1/users/me/messages",
            headers=headers,
            params=params,
        )
        if resp.status_code == 401:
            return {"error": "Google session expired. Please re-authenticate.", "emails": [], "needs_auth": True}
        if resp.status_code != 200:
            return {"error": f"Gmail API error: {resp.status_code}", "emails": [], "raw": resp.text}

        data = resp.json()
        messages = data.get("messages", [])

        emails = []
        for msg_ref in messages:
            msg_id = msg_ref.get("id")
            if not msg_id:
                continue
            detail_resp = await client.get(
                f"{GOOGLE_API_BASE}/gmail/v1/users/me/messages/{msg_id}",
                headers=headers,
                params={"format": "metadata"},
            )
            if detail_resp.status_code == 200:
                emails.append(parse_email(detail_resp.json()))

        return {"emails": emails, "status": "ok"}


async def fetch_calendar(date: Optional[str] = None, prompt: Optional[str] = None) -> Dict[str, Any]:
    """Fetch today's events from Calendar API."""
    headers = await get_auth_header()
    if not headers:
        return {"error": "Google authentication required. Please re-authenticate.", "events": [], "needs_auth": True}

    import re
    from datetime import timedelta

    now = datetime.now(timezone.utc)

    # Default to today
    if not date or date.lower() == "today":
        date = now.strftime("%Y-%m-%d")

    # Parse prompt for date range
    time_min = f"{date}T00:00:00Z"
    time_max = f"{date}T23:59:59Z"
    max_results = 20

    if prompt:
        prompt_lower = prompt.lower()
        if "this week" in prompt_lower or "week" in prompt_lower:
            # Find Monday of this week
            monday = now - timedelta(days=now.weekday())
            sunday = monday + timedelta(days=6)
            time_min = f"{monday.strftime('%Y-%m-%d')}T00:00:00Z"
            time_max = f"{sunday.strftime('%Y-%m-%d')}T23:59:59Z"
            date = f"{monday.strftime('%Y-%m-%d')} to {sunday.strftime('%Y-%m-%d')}"
        elif "next week" in prompt_lower:
            monday = now + timedelta(days=7 - now.weekday())
            sunday = monday + timedelta(days=6)
            time_min = f"{monday.strftime('%Y-%m-%d')}T00:00:00Z"
            time_max = f"{sunday.strftime('%Y-%m-%d')}T23:59:59Z"
            date = f"{monday.strftime('%Y-%m-%d')} to {sunday.strftime('%Y-%m-%d')}"
        elif "tomorrow" in prompt_lower:
            tomorrow = now + timedelta(days=1)
            time_min = f"{tomorrow.strftime('%Y-%m-%d')}T00:00:00Z"
            time_max = f"{tomorrow.strftime('%Y-%m-%d')}T23:59:59Z"
            date = tomorrow.strftime("%Y-%m-%d")
        elif "next 7 days" in prompt_lower or "7 days" in prompt_lower:
            time_min = f"{now.strftime('%Y-%m-%d')}T00:00:00Z"
            time_max = f"{(now + timedelta(days=7)).strftime('%Y-%m-%d')}T23:59:59Z"
            date = f"{now.strftime('%Y-%m-%d')} to {(now + timedelta(days=7)).strftime('%Y-%m-%d')}"
        elif "next 30 days" in prompt_lower or "30 days" in prompt_lower:
            time_min = f"{now.strftime('%Y-%m-%d')}T00:00:00Z"
            time_max = f"{(now + timedelta(days=30)).strftime('%Y-%m-%d')}T23:59:59Z"
            date = f"{now.strftime('%Y-%m-%d')} to {(now + timedelta(days=30)).strftime('%Y-%m-%d')}"

        # Parse max results from prompt
        count_match = re.search(r'\b(\d+)\s+event', prompt_lower)
        if count_match:
            max_results = int(count_match.group(1))

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GOOGLE_API_BASE}/calendar/v3/calendars/primary/events",
            headers=headers,
            params={
                "timeMin": time_min,
                "timeMax": time_max,
                "maxResults": max_results,
                "singleEvents": "true",
                "orderBy": "startTime",
            },
        )
        if resp.status_code == 401:
            return {"error": "Google session expired. Please re-authenticate.", "events": [], "needs_auth": True}
        if resp.status_code != 200:
            return {"error": f"Calendar API error: {resp.status_code}", "events": [], "raw": resp.text}

        data = resp.json()
        events = [parse_event(e) for e in data.get("items", [])]
        return {"events": events, "date": date, "status": "ok"}


async def fetch_tasks(list_id: str = "default", prompt: Optional[str] = None) -> Dict[str, Any]:
    """Fetch tasks from Google Tasks API."""
    headers = await get_auth_header()
    if not headers:
        return {"error": "Google authentication required. Please re-authenticate.", "tasks": [], "needs_auth": True}

    show_completed = "true"
    filter_completed = None
    if prompt:
        prompt_lower = prompt.lower()
        if "completed" in prompt_lower and "not" not in prompt_lower and "uncompleted" not in prompt_lower:
            # Show only completed tasks
            show_completed = "true"
            filter_completed = True
        elif "not completed" in prompt_lower or "uncompleted" in prompt_lower or "pending" in prompt_lower or "todo" in prompt_lower:
            # Show only uncompleted tasks
            show_completed = "false"
            filter_completed = False
        elif "all" in prompt_lower:
            show_completed = "true"

    async with httpx.AsyncClient() as client:
        # First get task lists to find the right list ID
        lists_resp = await client.get(
            f"{GOOGLE_API_BASE}/tasks/v1/users/@me/lists",
            headers=headers,
        )
        if lists_resp.status_code == 401:
            return {"error": "Google session expired. Please re-authenticate.", "tasks": [], "needs_auth": True}
        if lists_resp.status_code != 200:
            return {"error": f"Tasks API error: {lists_resp.status_code}", "tasks": [], "raw": lists_resp.text}

        lists_data = lists_resp.json()
        lists = lists_data.get("items", [])

        # Find the requested list or default to first
        target_list_id = None
        for lst in lists:
            if list_id == "default" or lst.get("id") == list_id:
                target_list_id = lst.get("id")
                break

        if not target_list_id and lists:
            target_list_id = lists[0].get("id")

        if not target_list_id:
            return {"tasks": [], "status": "ok"}

        resp = await client.get(
            f"{GOOGLE_API_BASE}/tasks/v1/lists/{target_list_id}/tasks",
            headers=headers,
            params={"showCompleted": show_completed},
        )
        if resp.status_code == 401:
            return {"error": "Google session expired. Please re-authenticate.", "tasks": [], "needs_auth": True}
        if resp.status_code != 200:
            return {"error": f"Tasks API error: {resp.status_code}", "tasks": [], "raw": resp.text}

        data = resp.json()
        tasks = [parse_task(t) for t in data.get("items", [])]

        # Apply filter based on prompt
        if filter_completed is not None:
            tasks = [t for t in tasks if t["completed"] == filter_completed]

        return {"tasks": tasks, "status": "ok"}


async def fetch_drive(count: int = 10, prompt: Optional[str] = None) -> Dict[str, Any]:
    """Fetch recent files from Google Drive API."""
    headers = await get_auth_header()
    if not headers:
        return {"error": "Google authentication required. Please re-authenticate.", "files": [], "needs_auth": True}

    import re

    query = None
    order_by = "modifiedTime desc"
    if prompt:
        prompt_lower = prompt.lower()
        # Extract count from prompt
        count_match = re.search(r'\b(\d+)\s+file', prompt_lower)
        if count_match:
            count = int(count_match.group(1))
        # Extract folder name
        folder_match = re.search(r'folder\s+(["\']?)(.+?)\1', prompt_lower)
        if folder_match:
            # Search for files in a specific folder
            folder_name = folder_match.group(2)
            query = f"'{folder_name}' in parents"
        # Extract file type
        if "spreadsheet" in prompt_lower or "excel" in prompt_lower:
            query = "mimeType='application/vnd.google-apps.spreadsheet'"
        elif "document" in prompt_lower or "doc" in prompt_lower:
            query = "mimeType='application/vnd.google-apps.document'"
        elif "pdf" in prompt_lower:
            query = "mimeType='application/pdf'"
        elif "image" in prompt_lower or "photo" in prompt_lower:
            query = "mimeType contains 'image/'"
        elif "presentation" in prompt_lower or "slide" in prompt_lower:
            query = "mimeType='application/vnd.google-apps.presentation'"
        # Extract name filter
        name_match = re.search(r'name\s+(["\']?)(.+?)\1', prompt_lower)
        if name_match:
            query = f"name contains '{name_match.group(2)}'"
        # Extract recent filter
        if "recent" in prompt_lower:
            order_by = "modifiedTime desc"
        elif "oldest" in prompt_lower:
            order_by = "modifiedTime"

    async with httpx.AsyncClient() as client:
        params: Dict[str, Any] = {
            "pageSize": count,
            "fields": "files(id,name,mimeType,size,modifiedTime)",
            "orderBy": order_by,
        }
        if query:
            params["q"] = query
        resp = await client.get(
            f"{GOOGLE_API_BASE}/drive/v3/files",
            headers=headers,
            params=params,
        )
        if resp.status_code == 401:
            return {"error": "Google session expired. Please re-authenticate.", "files": [], "needs_auth": True}
        if resp.status_code != 200:
            return {"error": f"Drive API error: {resp.status_code}", "files": [], "raw": resp.text}

        data = resp.json()
        files = [parse_drive_file(f) for f in data.get("files", [])]
        return {"files": files, "status": "ok"}
