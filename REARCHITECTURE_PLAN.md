# Backend Re-architecture Plan: Headless Pi Sessions with Skill-Driven Endpoints

## Research Summary

### 1. Pi Headless Modes

| Mode | Use Case | Pros | Cons |
|------|----------|------|------|
| `--print` | One-shot, spawn → run → exit | Simple | Process spawn overhead per request |
| `--mode json` | Event streaming | Full events | No bidirectional control |
| `--mode rpc` | Full programmatic control | Bidirectional, sessions, steering | Slightly more complex |
| **SDK** (`createAgentSession`) | Node.js embedding | Native, no subprocess | Requires Node.js runtime |

**Recommendation:** Use **RPC mode** (`pi --mode rpc`) for the backend. It provides:
- Persistent process (no spawn overhead)
- Full JSON protocol over stdin/stdout
- Session management (`new_session`, `get_state`, `switch_session`)
- Steering and follow-up messages
- Abort capability
- Tool execution events
- Extension UI support

### 2. Session Management Best Practices

From the pi SDK docs and RPC docs:
- `--no-session` for ephemeral data-fetching endpoints (no disk bloat)
- `SessionManager.inMemory()` for non-persistent chat sessions
- `SessionManager.create(cwd)` for persistent sessions that need continuation
- One pi RPC process per **endpoint type** (gmail, calendar, tasks, drive, research, chat)
- This avoids cross-contamination of context and keeps each agent focused

### 3. Playwright-CLI Best Practices (No Persistent Bash)

From the web-research skill and playwright-cli skill:
- **Always open → work → close** per task
- Use `playwright-cli open "URL"` (no `--persistent`) for clean state
- Use `playwright-cli snapshot` for state inspection
- Use `playwright-cli eval "() => { ... }"` for data extraction
- Use `playwright-cli close` to free resources
- Named sessions (`-s=sessionname`) only when multi-step workflow needed
- Avoid `playwright-cli --persistent` unless login state is required
- The pi agent's `bash` tool handles this — no persistent bash process needed

### 4. Skill Invocation Pattern

From the skills documentation:
- Skills are registered as `/skill:name` commands
- Pass skills via `--skill <path>` flags
- The skill content is loaded into the system prompt context
- When the user includes `/skill:name` in the prompt, the agent knows to load and follow that skill
- The agent then uses the `read` tool to load the full SKILL.md
- The correct pattern is: **`/skill-name <prompt>`** or **`<prompt> using /skill-name`**

---

## Current Architecture Problems

1. **Mixed paradigms**: Direct Google API calls (`google_api.py`) coexist with pi agent calls (`pi_data_fetch.py`)
2. **Process per request**: Each data fetch spawns a new `pi --print` subprocess (~2-5s overhead)
3. **No session reuse**: Chat sessions are in-memory but data fetches are not
4. **Regex parsing**: The `google_api.py` has complex regex-based prompt parsing that duplicates the agent's natural language understanding
5. **Skill path resolution**: The current `_resolve_skill` tries project-level first, but the skill loading is ad-hoc
6. **No RPC mode**: The current `pi_runner.py` only supports `--print` mode
7. **Playwright sessions leak**: No guarantee of `playwright-cli close` on errors

---

## Proposed New Architecture

### Design Principles

1. **One RPC process per endpoint type** — persistent pi process, zero spawn overhead
2. **Skills are the primary interface** — every endpoint maps to a skill
3. **No direct Google API calls** — everything goes through the pi agent
4. **Ephemeral sessions for data** — `--no-session` for Gmail, Calendar, Tasks, Drive
5. **Persistent in-memory sessions for chat** — `SessionManager.inMemory()` for chat
6. **Stateless HTTP API** — FastAPI endpoints remain stateless, pi processes are managed by the backend
7. **Playwright: always close** — every playwright session is wrapped in try/finally

### New Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│  React 18 + Vite + TypeScript + Tailwind + Zustand                    │
│  (unchanged — same API contract)                                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP (JSON)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                     │
│  FastAPI + Pydantic (no SQLAlchemy, no DB needed for v3)               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  PiSessionManager (singleton)                                    │  │
│  │  ├─ gmail_pool: PiRpcSession(skill="gmail-fetch")               │  │
│  │  ├─ calendar_pool: PiRpcSession(skill="calendar-fetch")       │  │
│  │  ├─ tasks_pool: PiRpcSession(skill="tasks-fetch")               │  │
│  │  ├─ drive_pool: PiRpcSession(skill="drive-fetch")               │  │
│  │  ├─ research_pool: PiRpcSession(skill="web-research")           │  │
│  │  └─ chat_pool: PiRpcSession(skill="all", persistent=True)     │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  /api/data  │  │  /api/auth  │  │/api/dashboard│  │  /api/ai    │     │
│  │  (gmail,    │  │  (Google    │  │  (layout,   │  │  (chat,     │     │
│  │  calendar,  │  │  OAuth)     │  │  cache)     │  │  research)  │     │
│  │  tasks,     │  │             │  │             │  │             │     │
│  │  drive)     │  │             │  │             │  │             │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                                         │
│  Shared: PiRpcSession, PiPool, OutputParser, SkillResolver             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ stdin/stdout (JSON-RPC)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           PI RPC PROCESSES                               │
│  pi --mode rpc --no-session --skill <path> --tools read,grep,find,bash  │
│                                                                         │
│  Each endpoint type has its own pi process with the relevant skill:     │
│  - gmail: --skill .pi/skills/gmail-fetch/SKILL.md                       │
│  - calendar: --skill .pi/skills/calendar-fetch/SKILL.md                 │
│  - tasks: --skill .pi/skills/tasks-fetch/SKILL.md                       │
│  - drive: --skill .pi/skills/drive-fetch/SKILL.md                       │
│  - research: --skill .pi/skills/web-research/SKILL.md                    │
│  - chat: --skill all skills (stateful, in-memory sessions)                │
└─────────────────────────────────────────────────────────────────────────┘
```

### Pi RPC Session Protocol

Each `PiRpcSession` manages a single `pi --mode rpc` subprocess:

```python
class PiRpcSession:
    """Manages a persistent pi --mode rpc subprocess."""

    def __init__(self, skill_path: str, tools: str = "read,grep,find,bash"):
        self.process = subprocess.Popen(
            ["pi", "--mode", "rpc", "--no-session",
             "--skill", skill_path,
             "--tools", tools,
             "--provider", os.getenv("PI_PROVIDER", "fireworks"),
             "--model", os.getenv("PI_MODEL", "accounts/fireworks/routers/kimi-k2p6-turbo")],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self._lock = asyncio.Lock()
        self._event_buffer = []

    async def prompt(self, message: str, timeout: int = 120) -> dict:
        """Send a prompt, collect events, return parsed result."""
        async with self._lock:
            # Send prompt command
            cmd = {"type": "prompt", "message": message}
            self.process.stdin.write(json.dumps(cmd) + "\n")
            self.process.stdin.flush()

            # Collect events until agent_end
            events = []
            for line in self.process.stdout:
                event = json.loads(line)
                events.append(event)
                if event.get("type") == "agent_end":
                    break

            # Parse agent_end messages to extract the final response
            return self._parse_events(events)
```

### Endpoint → Skill Mapping

| Endpoint | Skill | Prompt Pattern |
|----------|-------|----------------|
| `POST /api/data/gmail` | `gmail-fetch` | `/gmail-fetch Fetch {count} emails. Query: '{prompt}'` |
| `POST /api/data/calendar` | `calendar-fetch` | `/calendar-fetch Fetch events. Date: '{date}'. Query: '{prompt}'` |
| `POST /api/data/tasks` | `tasks-fetch` | `/tasks-fetch Fetch tasks from list '{list_id}'. Query: '{prompt}'` |
| `POST /api/data/drive` | `drive-fetch` | `/drive-fetch Fetch {count} files. Query: '{prompt}'` |
| `POST /api/ai/research` | `web-research` | `/web-research Research: '{topic}'` |
| `POST /api/ai/chat` | all skills | `Chat message with full history` |

### Skill Resolution

```python
SKILL_PATHS = {
    "gmail-fetch": ".pi/skills/gmail-fetch/SKILL.md",
    "calendar-fetch": ".pi/skills/calendar-fetch/SKILL.md",
    "tasks-fetch": ".pi/skills/tasks-fetch/SKILL.md",
    "drive-fetch": ".pi/skills/drive-fetch/SKILL.md",
    "web-research": ".pi/skills/web-research/SKILL.md",
    "google-auth": ".pi/skills/google-auth/SKILL.md",
}

def resolve_skill(name: str) -> str:
    """Resolve skill name to absolute path."""
    project_path = os.path.join(PROJECT_ROOT, SKILL_PATHS[name])
    if os.path.exists(project_path):
        return os.path.abspath(project_path)
    global_path = os.path.expanduser(f"~/.pi/agent/skills/{name}/SKILL.md")
    if os.path.exists(global_path):
        return os.path.abspath(global_path)
    raise FileNotFoundError(f"Skill {name} not found")
```

### Output Parsing

The `pi --mode rpc` events stream contains `agent_end` with all messages. The parser:
1. Extracts the last assistant message from `agent_end.messages`
2. Looks for JSON blocks in the message content
3. Falls back to the raw text if no JSON found
4. Supports A2UI component extraction (for chat)

### Auth Flow

The auth flow remains the same (OAuth redirect to Google), but token storage:
- `~/.pi/agent/auth.json` — the pi skill ecosystem reads from here
- No need for SQLAlchemy database just for tokens
- Keep `auth.json` as the single source of truth

### Why Remove SQLAlchemy?

- Tokens are already in `auth.json` (pi ecosystem standard)
- Dashboard layout can be stored in a JSON file or SQLite if needed
- The current `User` model is just a single-user "default" user
- Simpler architecture: no DB migrations, no ORM

---

## Implementation Plan

### Phase 1: Foundation (Delete + Rebuild)

1. **Delete `backend/` entirely** — all old code, tests, caches
2. **Create new `backend/` structure**:
   ```
   backend/
   ├── main.py              # FastAPI entry point
   ├── config.py            # Settings (PI_PROVIDER, PI_MODEL, CORS)
   ├── models.py            # Pydantic request/response models
   ├── pi_rpc.py            # PiRpcSession, PiPool, OutputParser
   ├── skill_resolver.py    # Skill path resolution
   ├── auth.py              # Google OAuth token storage (auth.json)
   ├── routers/
   │   ├── data.py          # Gmail, Calendar, Tasks, Drive
   │   ├── ai.py            # Chat, Research
   │   ├── auth.py          # Google OAuth flow
   │   └── dashboard.py     # Layout persistence (JSON file)
   └── tests/
       └── test_api.py      # API contract tests
   ```
3. **Implement `pi_rpc.py`** — the core RPC session manager
4. **Implement `skill_resolver.py`** — resolve skill paths

### Phase 2: Routers

1. **Implement `routers/data.py`** — all endpoints use `pi_rpc.py`
2. **Implement `routers/ai.py`** — chat uses persistent session, research uses ephemeral
3. **Implement `routers/auth.py`** — OAuth flow, store in `auth.json`
4. **Implement `routers/dashboard.py`** — layout persistence (simple JSON file)

### Phase 3: Integration & Testing

1. **Test each endpoint** — verify pi RPC communication
2. **Test skill loading** — verify each skill is correctly injected
3. **Test playwright cleanup** — verify `playwright-cli close` is always called
4. **Test auth flow** — verify token refresh works

---

## Files to Delete

- `backend/__pycache__/` — Python cache
- `backend/.pi/` — Old pi config
- `backend/.playwright-cli/` — Old playwright state
- `backend/.pytest_cache/` — Old test cache
- `backend/aftonbladet_home.yml` — Artifact
- `backend/database.py` — SQLAlchemy (not needed)
- `backend/living_canvas.db` — SQLite DB (not needed)
- `backend/main.py` — Old entry point
- `backend/models.py` — Old models (redesign)
- `backend/pytest.ini` — Old config
- `backend/research_queue.db` — Old queue DB
- `backend/requirements.txt` — Old deps (redesign)
- `backend/routers/` — All old routers
- `backend/services/` — All old services
- `backend/tests/` — Old tests

---

## New Files

| File | Description |
|------|-------------|
| `backend/main.py` | FastAPI entry point with CORS |
| `backend/config.py` | Pydantic Settings for env vars |
| `backend/models.py` | Pydantic request/response models |
| `backend/pi_rpc.py` | Pi RPC session manager, pool, parser |
| `backend/skill_resolver.py` | Skill path resolution |
| `backend/auth_manager.py` | auth.json read/write/refresh |
| `backend/routers/data.py` | Gmail, Calendar, Tasks, Drive endpoints |
| `backend/routers/ai.py` | Chat, Research endpoints |
| `backend/routers/auth.py` | Google OAuth flow |
| `backend/routers/dashboard.py` | Layout persistence |
| `backend/requirements.txt` | FastAPI, uvicorn, pydantic, python-dotenv |
| `backend/tests/test_api.py` | API tests |

---

## API Contract (unchanged for frontend compatibility)

All existing endpoints return the same JSON structure. The frontend doesn't need changes.

---

## Decision Points

1. **Session persistence for data endpoints**: Ephemeral (`--no-session`) to avoid disk bloat. Each request gets a fresh pi session.
2. **Session persistence for chat**: In-memory (no disk) with a max of 50 sessions. Each chat session has a UUID.
3. **One pi process or pool**: One process per endpoint type is simpler. A pool is only needed if we need concurrent requests to the same endpoint type.
4. **Process restart on crash**: If a pi process crashes, automatically restart it.
5. **Timeout handling**: 120s default, configurable per endpoint.
6. **Skill loading**: All skills passed at pi process startup. The task prompt includes `/skill-name` to trigger the specific skill.

---

## Next Steps

1. ✅ **Research** — Completed
2. ⏳ **Review plan** — Awaiting user approval
3. 🔧 **Phase 1** — Delete + rebuild foundation
4. 🔧 **Phase 2** — Implement routers
5. 🔧 **Phase 3** — Test and integrate
