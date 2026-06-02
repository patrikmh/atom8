# Multilingual Agent-Based Data Fetching — Implementation Notes

## Step 1: `.pi/extensions/living-canvas.ts` — Update `fetch_gmail` Tool Description

**Location:** Lines 282-287

**Current:**
```typescript
description: "Fetch the latest emails from the user's Gmail inbox. Returns emails with id, subject, from, date, preview.",
parameters: Type.Object({
  count: Type.Optional(Type.Number({ description: "Number of emails to fetch (default 10)" })),
  query: Type.Optional(Type.String({ description: "Gmail search query (e.g., 'from:sender' or 'subject:topic')" })),
}),
```

**New:**
```typescript
description: "Fetch the latest emails from the user's Gmail inbox. Returns emails with id, subject, from, date, preview.",
promptGuidelines: [
  "Use fetch_gmail when the user needs to retrieve email messages from their Gmail account.",
  "The query parameter should be a valid Gmail search query. Examples:",
  "  - 'from:alice' — emails from sender",
  "  - 'subject:meeting' — emails with subject",
  "  - 'is:important' or 'is:starred' or 'is:unread' — status filters",
  "  - 'newer_than:7d' — last week",
  "  - 'newer_than:1d' — today",
  "  - 'has:attachment' — with attachments",
  "If the user asks in a different language, translate their intent into the correct Gmail query syntax.",
],
parameters: Type.Object({
  count: Type.Optional(Type.Number({ description: "Number of emails to fetch (default 10)" })),
  query: Type.Optional(Type.String({ description: "Gmail search query (e.g., 'from:sender', 'subject:topic', 'is:important', 'newer_than:7d')" })),
}),
```

**Rationale:** The agent needs to know Gmail query syntax to translate natural language prompts correctly. Without this, it might pass "last week" directly as a query string, which Gmail won't recognize.

---

## Step 2: `backend/services/pi_data_fetch.py` — Remove `parse_gmail_query`, Pass Raw Prompt

### 2A. Remove `parse_gmail_query` function

**Delete:** Lines 48-150 (the entire `parse_gmail_query` function and its docstring).

**What it currently does:**
- Extracts count numbers via regex
- Checks for explicit Gmail operators
- Natural language pattern matching for "from X", "starred", "today", "last week", "about X"
- Generic token filtering with a hardcoded English filler set
- Returns `(query, count)`

**Why remove it:**
- The regex is English-only and produces invalid queries (e.g., `from:last` for "from last week")
- The filler word set is English-only
- The agent can do this better in any language

### 2B. Update `fetch_gmail_pi`

**Location:** Lines 152-169

**Current:**
```python
async def fetch_gmail_pi(prompt: str = None, count: int = 10) -> dict:
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
```

**New:**
```python
async def fetch_gmail_pi(prompt: str = None, count: int = 10) -> dict:
    key = _cache_key("gmail", prompt, count)
    cached = _get_cached(key)
    if cached:
        return cached

    if prompt:
        task = (
            f"The user asks: '{prompt}'. "
            f"Use the fetch_gmail tool to get {count} emails matching their request. "
            "Translate their intent into the correct Gmail query syntax if needed. "
            "Return the results as JSON with emails array containing id, subject, from, date, preview."
        )
    else:
        task = (
            f"Use the fetch_gmail tool to get the last {count} emails from the user's inbox. "
            "Return the results as JSON with emails array containing id, subject, from, date, preview."
        )
    
    output = await run_pi_agent(task, timeout=120)
    result = parse_pi_output(output)
    _set_cached(key, result)
    return result
```

**Key changes:**
- Remove `parse_gmail_query` call
- Cache key uses raw prompt instead of parsed query
- Agent task includes the raw user prompt and instructs the agent to translate intent into Gmail query syntax
- The agent decides whether to pass a query parameter based on the prompt

### 2C. Update `fetch_calendar_pi`

**Location:** Lines 171-188

**Current:**
```python
async def fetch_calendar_pi(prompt: str = None, date: str = None) -> dict:
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
```

**New:**
```python
async def fetch_calendar_pi(prompt: str = None, date: str = None) -> dict:
    key = _cache_key("calendar", prompt, date)
    cached = _get_cached(key)
    if cached:
        return cached

    if prompt:
        task = (
            f"The user asks: '{prompt}'. "
            "Use the fetch_calendar tool to get calendar events matching their request."
        )
    else:
        task = "Use the fetch_calendar tool to get today's calendar events."
    if date:
        task += f" Use date: '{date}'."
    task += " Return the results as JSON with events array containing id, summary, start, end, location."
    output = await run_pi_agent(task, timeout=120)
    result = parse_pi_output(output)
    _set_cached(key, result)
    return result
```

### 2D. Update `fetch_tasks_pi`

**Location:** Lines 190-205

**Current:**
```python
async def fetch_tasks_pi(prompt: str = None, list_id: str = "default") -> dict:
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
```

**New:**
```python
async def fetch_tasks_pi(prompt: str = None, list_id: str = "default") -> dict:
    key = _cache_key("tasks", prompt, list_id)
    cached = _get_cached(key)
    if cached:
        return cached

    if prompt:
        task = (
            f"The user asks: '{prompt}'. "
            f"Use the fetch_tasks tool to get tasks from list '{list_id}' matching their request."
        )
    else:
        task = f"Use the fetch_tasks tool to get tasks from list '{list_id}'."
    task += " Return the results as JSON with tasks array containing id, title, completed, due."
    output = await run_pi_agent(task, timeout=120)
    result = parse_pi_output(output)
    _set_cached(key, result)
    return result
```

### 2E. Update `fetch_drive_pi`

**Location:** Lines 207-222

**Current:**
```python
async def fetch_drive_pi(prompt: str = None, count: int = 10) -> dict:
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
```

**New:**
```python
async def fetch_drive_pi(prompt: str = None, count: int = 10) -> dict:
    key = _cache_key("drive", prompt, count)
    cached = _get_cached(key)
    if cached:
        return cached

    if prompt:
        task = (
            f"The user asks: '{prompt}'. "
            f"Use the fetch_drive tool to get {count} files from the user's Drive matching their request."
        )
    else:
        task = f"Use the fetch_drive tool to get the last {count} files from the user's Drive."
    task += " Return the results as JSON with files array containing id, name, mimeType, modifiedTime, size."
    output = await run_pi_agent(task, timeout=120)
    result = parse_pi_output(output)
    _set_cached(key, result)
    return result
```

---

## Step 3: `backend/services/ai_research.py` — Remove `analyze_intent` and `DATA_SOURCE_KEYWORDS`

**Delete:** Lines 8-21

```python
DATA_SOURCE_KEYWORDS = {
    "email": ["email", "emails", "mail", "gmail", "message", "messages"],
    "calendar": ["calendar", "event", "events", "schedule", "meeting", "meetings", "appointment"],
    "task": ["task", "tasks", "todo", "to-do", "todoist", "reminder"],
    "drive": ["file", "files", "drive", "document", "documents", "folder", "folders"],
}


def analyze_intent(topic: str) -> str:
    """Determine if the topic is a data query or a general research question."""
    t = topic.lower()
    for intent, keywords in DATA_SOURCE_KEYWORDS.items():
        if any(kw in t for kw in keywords):
            return intent
    return "research"
```

**Why:** This is the English-only keyword router. The agent will handle intent detection in any language.

**Keep:** `do_web_research` and its helper functions (`_search_duckduckgo`, `_extract_page_content`) — these are still used for general web research.

---

## Step 4: `backend/routers/ai.py` — Replace Keyword Routing with Direct Agent Call

**Location:** Lines 130-200 in the `/research` endpoint

**Current flow:**
1. `intent = analyze_research_intent(topic)`
2. If `intent == "email"`, call `fetch_gmail_pi(prompt=topic)`
3. If `intent == "calendar"`, call `fetch_calendar_pi(prompt=topic)`
4. etc.

**New flow:**

Replace the entire `if intent == "email" / "calendar" / "task" / "drive"` block with a single agent call that lets the agent decide which tool to use.

**Implementation:**

```python
@router.post("/research")
async def research(request: Dict[str, Any]):
    """Analyze topic and route to real data sources via headless pi sessions."""
    topic = request.get("topic", "")
    if not topic:
        raise HTTPException(status_code=400, detail="Topic is required")

    # Pass the user's natural language prompt directly to the agent
    # The agent will decide which tool to use based on the prompt
    task = (
        f"The user asks: '{topic}'. "
        "Use the appropriate tool (fetch_gmail, fetch_calendar, fetch_tasks, or fetch_drive) "
        "to fetch the data they need. Return the results as JSON with the appropriate data array."
    )
    
    output = await run_pi_agent(task, timeout=120)
    result = parse_pi_output(output)
    
    if "error" in result:
        return {"content": f"Unable to fetch data: {result['error']}", "sources": [], "status": "error"}
    
    # Determine which data type was returned and format accordingly
    if "emails" in result:
        emails = result.get("emails", [])
        if not emails:
            return {"content": "No emails found matching your query.", "sources": [], "status": "ok"}
        sender_list = []
        for i, e in enumerate(emails[:10]):
            sender = e.get('from_name', '') or e.get('from_email', '') or e.get('from', '') or 'Unknown'
            sender_list.append(f"{i+1}. {e.get('subject', '(no subject)')} from {sender}")
        content = f"Found {len(emails)} email(s):\n" + "\n".join(sender_list)
        response = {"content": content, "sources": [], "status": "ok"}
        response["emails"] = emails
        return response
    
    elif "events" in result:
        events = result.get("events", [])
        if not events:
            return {"content": "No events found for your query.", "sources": [], "status": "ok"}
        event_list = []
        for i, e in enumerate(events[:10]):
            event_list.append(f"{i+1}. {e.get('summary', '(no title)')} at {e.get('start', 'N/A')}")
        content = f"Found {len(events)} event(s):\n" + "\n".join(event_list)
        response = {"content": content, "sources": [], "status": "ok"}
        response["events"] = events
        return response
    
    elif "tasks" in result:
        tasks = result.get("tasks", [])
        if not tasks:
            return {"content": "No tasks found for your query.", "sources": [], "status": "ok"}
        task_list = []
        for i, t in enumerate(tasks[:10]):
            status = "✓" if t.get('completed') else "○"
            task_list.append(f"{i+1}. {status} {t.get('title', '(no title)')}")
        content = f"Found {len(tasks)} task(s):\n" + "\n".join(task_list)
        response = {"content": content, "sources": [], "status": "ok"}
        response["tasks"] = tasks
        return response
    
    elif "files" in result:
        files = result.get("files", [])
        if not files:
            return {"content": "No files found for your query.", "sources": [], "status": "ok"}
        file_list = []
        for i, f in enumerate(files[:10]):
            file_list.append(f"{i+1}. {f.get('name', '(no name)')} ({f.get('mimeType', 'unknown')})")
        content = f"Found {len(files)} file(s):\n" + "\n".join(file_list)
        response = {"content": content, "sources": [], "status": "ok"}
        response["files"] = files
        return response
    
    else:
        # Fallback to web research if the agent didn't return recognized data
        result = await do_web_research(topic)
        if "error" in result:
            return {"content": f"Unable to research: {result['error']}", "sources": [], "status": "error"}
        return result
```

**Note:** The `run_pi_agent` and `parse_pi_output` imports need to be added at the top of `ai.py`:

```python
from services.pi_agent import run_pi_agent, parse_pi_output
```

**Also:** The import of `analyze_intent` from `ai_research` should be removed:

```python
# Remove this line:
from services.ai_research import do_web_research, analyze_intent as analyze_research_intent
# Keep this line:
from services.ai_research import do_web_research
```

---

## Testing Checklist

After implementation, verify:

1. **Standard Gmail widget** (prompt: "Get last 10 emails") → Returns emails
2. **Custom widget with Swedish prompt** ("Sammanfatta mejlen från förra veckan och visa viktiga") → Returns emails
3. **Custom widget with complex query** ("Summarize emails from last week and show important ones") → Returns emails
4. **Calendar widget** → Returns events
5. **Tasks widget** → Returns tasks
6. **Drive widget** → Returns files
7. **Web research** ("What is the capital of France?") → Returns web research results

---

## Edge Cases Handled

- **Empty prompt**: `fetch_gmail_pi` still defaults to getting last 10 emails
- **Explicit Gmail operators**: The agent will pass them through correctly (e.g., `from:me`, `is:starred`)
- **Mixed language prompts**: The agent natively understands context in multiple languages
- **Non-data prompts**: Falls back to web research if the agent doesn't return a recognized data array
- **Agent errors**: Returns structured error response with `status: "error"` and error message
