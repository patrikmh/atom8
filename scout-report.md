# Scout Report — Atom8 / Living Canvas Dashboard

## 1. Project Structure

```
/Users/patrikandersson/telegram/atom8/
├── frontend/                 # React 18 + Vite + TypeScript dashboard
│   ├── src/
│   │   ├── components/       # React components (Canvas, widgets, sidebar, chat)
│   │   ├── components/widgets/  # Gmail, Calendar, Tasks, Drive, AI, Custom
│   │   ├── stores/           # Zustand state management (layoutStore.ts)
│   │   ├── services/         # API client (api.ts)
│   │   ├── types/            # TypeScript types & constants
│   │   ├── __tests__/        # Empty directory
│   │   └── App.tsx           # Root DndProvider + layout
│   ├── package.json
│   ├── vite.config.ts
│   └── vitest.config.ts
├── backend/                  # FastAPI + Python
│   ├── main.py               # App entry point, CORS, router mounting
│   ├── models.py             # Pydantic request/response models
│   ├── database.py           # SQLAlchemy SQLite setup
│   ├── routers/
│   │   ├── ai.py             # Chat, research, design, queue endpoints
│   │   ├── data.py           # Gmail, Calendar, Tasks, Drive data endpoints
│   │   ├── auth.py           # Google OAuth flow + token storage
│   │   └── dashboard.py      # Layout & widget cache persistence
│   ├── services/
│   │   ├── pi_agent.py       # Generic headless pi subprocess runner
│   │   ├── pi_chat.py        # Chat-specific pi subprocess runner
│   │   ├── pi_data_fetch.py  # Data fetch wrappers (Gmail, Calendar, Tasks, Drive)
│   │   ├── google_api.py     # Direct Google API calls (httpx)
│   │   ├── ai_research.py    # Playwright-based web research
│   │   └── research_queue.py # SQLite-backed research job queue
│   └── scripts/
│       └── pi_research_daemon.py  # Standalone daemon for queued research
├── .env / .env.example
├── PLAN.md / IMPLEMENTATION.md / SPRINT_CONTRACT.md / SPRINT_STATUS.md
└── README.md (one-liner)
```

---

## 2. Tech Stack & Key Dependencies

### Frontend
| Technology | Version | Role |
|---|---|---|
| React | 18.3.1 | UI framework |
| Vite | 5.2.11 | Build tool & dev server |
| TypeScript | 5.4.5 | Type system |
| Tailwind CSS | 3.4.3 | Utility-first styling |
| Zustand | 4.5.2 | State management (with persist middleware) |
| react-grid-layout | 1.4.4 | Draggable/resizable grid canvas |
| react-dnd + HTML5Backend | 16.0.1 | Sidebar-to-canvas drag-and-drop |
| lucide-react | 0.378.0 | Iconography |
| Vitest | 1.6.0 | Test runner (with jsdom) |

### Backend
| Technology | Version | Role |
|---|---|---|
| FastAPI | 0.111.0 | API framework |
| Uvicorn | 0.30.0 | ASGI server |
| Pydantic | 2.7.0 | Data validation |
| SQLAlchemy | 2.0.0 | ORM (SQLite) |
| Alembic | 1.13.0 | **Listed but unused** |
| httpx | 0.27.0 | HTTP client (Google API calls) |
| python-dotenv | 1.0.0 | Environment loading |

### External Dependencies
- **Local `pi` CLI** — The backend spawns subprocesses running `pi` (a local agent CLI). This is a hard runtime dependency for all AI/chat/data features.
- **Playwright** — Used in `ai_research.py` for web scraping; **not in `requirements.txt`**.
- **Google OAuth** — Required for Gmail, Calendar, Tasks, Drive widgets.

---

## 3. Key Source Files & Their Roles

### Frontend
| File | Lines | Role |
|---|---|---|
| `src/App.tsx` | 60 | Root DndProvider, theme background, keyboard shortcuts (Ctrl+Z undo/redo) |
| `src/stores/layoutStore.ts` | ~400 | Zustand store: widgets, undo/redo, themes, AI suggestions, localStorage persistence |
| `src/types/index.ts` | ~250 | All TS types, DEFAULT_LAYOUT, DEFAULT_THEME, COMPONENT_LIBRARY_ITEMS |
| `src/services/api.ts` | ~80 | Centralized fetch wrapper with cache-busting for data/AI endpoints |
| `src/components/Canvas.tsx` | ~250 | Grid layout, drop zone, ghost cell preview, empty state |
| `src/components/GridWidget.tsx` | ~250 | Widget wrapper: drag handle, title/prompt editing, settings, refresh, error boundary |
| `src/components/AIChatWidget.tsx` | ~500 | Floating chat UI with A2UI component renderer, localStorage message persistence |
| `src/components/ComponentLibrary.tsx` | ~300 | Sidebar with search, category filters, collapsible panels, draggable items |
| `src/components/AIDesignerPanel.tsx` | ~150 | AI Designer mode toggle + auto-optimize suggestion flow |
| `src/components/widgets/GmailWidget.tsx` | ~200 | Real email fetching via `apiClient.getGmail` |
| `src/components/widgets/CalendarWidget.tsx` | ~200 | Real calendar fetching via `apiClient.getCalendar` |
| `src/components/widgets/TasksWidget.tsx` | ~200 | Real tasks fetching via `apiClient.getTasks` |
| `src/components/widgets/DriveWidget.tsx` | ~200 | Real Drive fetching via `apiClient.getDrive` |
| `src/components/widgets/AIWidget.tsx` | ~150 | Research topic widget via `apiClient.research` |
| `src/components/widgets/CustomWidget.tsx` | ~150 | Generic prompt-based widget |

### Backend
| File | Lines | Role |
|---|---|---|
| `main.py` | 40 | FastAPI init, CORS, router registration, health check |
| `models.py` | 80 | Pydantic models: request/response shapes for data endpoints |
| `database.py` | 60 | SQLAlchemy engine, `User`, `Layout`, `WidgetCache` tables |
| `routers/data.py` | 50 | Thin wrappers: calls `pi_data_fetch` functions, returns JSON |
| `routers/auth.py` | ~150 | Google OAuth: URL generation, callback, token storage in DB + auth.json |
| `routers/ai.py` | ~300 | Chat (`pi_chat`), research (`pi_agent` / `pi_data_fetch`), design suggestions, queue |
| `routers/dashboard.py` | ~100 | Layout save/load, widget cache save/load (SQLite) |
| `services/pi_agent.py` | ~100 | Generic `pi` subprocess runner: builds command, parses JSON from stdout |
| `services/pi_chat.py` | ~150 | Chat-specific `pi` runner: session management, A2UI component parsing, system prompt |
| `services/pi_data_fetch.py` | ~100 | In-memory TTL cache + `pi` task wrappers for Gmail/Calendar/Tasks/Drive/Web |
| `services/google_api.py` | ~350 | **Direct** Google API implementation (httpx + regex prompt parsing) — **largely orphaned** |
| `services/ai_research.py` | ~100 | Playwright-based DuckDuckGo web research — **orphaned** |
| `services/research_queue.py` | ~100 | SQLite job queue for deferred research |
| `scripts/pi_research_daemon.py` | ~100 | Standalone polling daemon for queued research jobs |

---

## 4. Architecture Overview

### Data Flow
1. **User** drags a widget from sidebar → `layoutStore.addWidget()` → localStorage + SQLite (via `/api/dashboard/layout`)
2. **Widget mounts** → `useEffect` calls `apiClient.get<Data>()` → `POST /api/data/<endpoint>`
3. **Backend endpoint** → `services.pi_data_fetch.fetch_<data>_pi()` → spawns `pi` CLI subprocess
4. **Pi agent** follows skill workflows (gmail-fetch, calendar-fetch, etc.) using bash + curl, returns JSON
5. **Backend** parses JSON (`pi_agent.parse_pi_output`) → returns to frontend
6. **Frontend** renders data in widget-specific components (GmailWidget, CalendarWidget, etc.)

### AI Chat Flow
1. **User sends message** → `POST /api/ai/chat` → `pi_chat.chat()`
2. **Backend** builds system prompt with conversation history + A2UI component spec
3. **Spawns `pi` subprocess** → gets raw text → parses `\`\`\`a2ui` blocks into structured components
4. **Returns** `{content, components, session_id}` to frontend
5. **Frontend** renders text + `A2UIRenderer` components inside chat bubbles

### AI Designer Flow
1. **User clicks Auto-Optimize** → `POST /api/ai/design` → heuristic-based suggestion (currently very simple)
2. **Backend** returns `{description, changes}` where changes are move/resize/add/remove ops
3. **Frontend** shows suggestion card → user applies/rejects → `layoutStore` pushes snapshot to undo stack

---

## 5. Obvious Code Smells, Duplication & Architectural Issues

### 5.1 Severe Duplication in Backend Subprocess Runners
**`services/pi_agent.py` and `services/pi_chat.py`** both implement nearly identical subprocess logic:
- Same `PI_PROVIDER`, `PI_MODEL` constants duplicated
- Same `subprocess.run` command structure (only skills list differs slightly)
- Same `run_in_executor` async wrapper pattern
- **Risk:** Any change to pi CLI flags, timeout handling, or error parsing must be made in two places.
- **Fix:** Extract a shared `PiRunner` class or utility module.

### 5.2 Orphaned / Dead Code
- **`services/google_api.py`** (~350 lines) implements direct Google API calls with regex-based prompt parsing. It is **never called by the main routers** — all data flows through the `pi` agent subprocess (`pi_data_fetch.py`). The file appears to be a legacy fallback.
- **`services/ai_research.py`** (~100 lines) uses Playwright for web research. It is **never imported by the main app**; web research in `ai.py` goes through the `pi` agent subprocess instead.
- **Fix:** Remove or consolidate these into a single fallback path.

### 5.3 In-Memory Caches & Session Stores (Not Production-Ready)
- **`pi_data_fetch.py`** uses a module-level `_cache: Dict[str, Any]` with a 30-second TTL. This is **not shared across workers** and leaks memory over time.
- **`pi_chat.py`** uses a module-level `CHAT_SESSIONS: Dict[str, List[Dict]]` with a 50-session limit. Sessions are **lost on backend restart**.
- **Fix:** Move to Redis, SQLite, or at least an LRU cache with TTL.

### 5.4 Massive Frontend Widget Duplication
All six widget components (`GmailWidget`, `CalendarWidget`, `TasksWidget`, `DriveWidget`, `AIWidget`, `CustomWidget`) share ~80% identical boilerplate:
- `useState` for `localData`, `isLoading`, `error`, `fetchedAt`
- Identical `fetchData()` pattern: set loading, call API, handle error, set data
- Identical `useEffect` patterns for refresh trigger + refresh interval
- `formatTimeAgo` helper duplicated in every widget
- `SkeletonRow` and `EmptyState` duplicated (or very similar) across widgets
- **Fix:** Extract a `useWidgetData` hook and generic `WidgetDataContainer` wrapper.

### 5.5 Inline Styles Everywhere
The frontend uses **inline styles for all theming** (e.g., `style={{ backgroundColor: theme.widgetBg }}`) rather than CSS variables or Tailwind classes. This:
- Prevents CSS-based optimizations
- Makes debugging harder
- Creates massive DOM bloat
- **Fix:** Migrate to CSS variables driven by the theme config, or use a Tailwind plugin.

### 5.6 Weak Backend Type Safety
Many router endpoints accept `Dict[str, Any]` instead of Pydantic models:
- `ai.py`: `chat(message: Dict[str, Any])`, `research(request: Dict[str, Any])`, `design_suggestion(request: Dict[str, Any])`
- `dashboard.py`: `set_widget_cache(widget_id: str, data: dict)`
- **Fix:** Define explicit Pydantic request/response models for every endpoint.

### 5.7 Hardcoded Single-User Assumption
- `database.py`: `user_id = "default"` everywhere
- `auth.py`: `user_id = "default"` everywhere
- `dashboard.py`: `user_id = "default"` everywhere
- **Fix:** Pass `user_id` from JWT/auth token or session.

### 5.8 Mock Data Still Present
- `routers/ai.py` contains a `MOCK_RESPONSES` dictionary with hardcoded English strings for email, calendar, task, drive, component, default intents. It is **never referenced in the actual code** (the router now spawns `pi` for everything), but it remains in the file.
- **Fix:** Remove dead code.

### 5.9 `react-hooks/exhaustive-deps` Disabled Everywhere
Every widget component has `// eslint-disable-next-line react-hooks/exhaustive-deps` on the main `useEffect` that triggers data fetching. This is a **react anti-pattern** that will cause stale closure bugs or missed updates.
- **Fix:** Properly memoize `fetchData` with `useCallback` and include all dependencies.

### 5.10 CORS Misconfiguration
`main.py` sets:
```python
allow_origins=["*"]
allow_credentials=False
allow_methods=["*"]
allow_headers=["*"]
```
While `allow_credentials=False` mitigates the worst risk, wildcard origins with permissive headers is still a **security smell** for any production deployment.

### 5.11 Prompt Injection Risk
User-provided `prompt` strings are interpolated directly into subprocess command arguments in `pi_data_fetch.py`:
```python
task = f"Follow the gmail-fetch skill workflow. Fetch {count} emails from Gmail"
if prompt:
    task += f" matching the query: '{prompt}'"
```
While the `pi` agent likely escapes its own inputs, this is an **unvalidated user string reaching a shell subprocess**. If the `pi` CLI ever had a shell injection bug, this would be exploitable.
- **Fix:** Sanitize/validate prompts, or pass them via stdin/file rather than string interpolation.

### 5.12 No Alembic Migrations
`alembic` is in `requirements.txt` but there is no `alembic.ini`, no migration directory, and `database.py` calls `Base.metadata.create_all(bind=engine)` on startup. This is fine for a local dev SQLite DB but **will break in production** if the schema ever changes.
- **Fix:** Initialize Alembic and replace `create_all` with migration-driven schema management.

### 5.13 Missing Playwright Dependency
`services/ai_research.py` imports `playwright` and `playwright_stealth`, but neither is in `requirements.txt`.
- **Fix:** Add `playwright>=1.44.0` and `playwright-stealth` to requirements, or remove the file.

### 5.14 API Base URL Construction Bug
`frontend/src/services/api.ts`:
```typescript
const API_BASE = (import.meta as any).env?.VITE_API_BASE || 
  (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8000` : 'http://localhost:8000')
```
`import.meta.env` is the correct Vite API, not `import.meta.env`. This will always fall back to the window-based URL, which breaks in non-8000 deployments or HTTPS frontends.
- **Fix:** Use `import.meta.env.VITE_API_BASE` correctly.

### 5.15 Frontend-Backend Contract Inconsistencies
- `models.py` defines `GmailResponse` with `emails: List[EmailItem]`, but `routers/data.py` returns a plain dict `{"emails": [...], "status": "ok"}` — not the Pydantic model.
- `models.py` defines `EmailItem` with `from_name: str`, `from_email: str`, `preview: str`, but the frontend expects `email.from` or `email.from_name` (with fallback) — inconsistent field naming.
- `CalendarEvent` model has `title: str`, but Google API returns `summary`. The backend `google_api.py` parser maps `summary→title`, but the `pi` agent skill may return `summary` directly. The frontend does `e.title || e.summary` as a fallback, indicating the contract is **not guaranteed**.
- `DriveFile` model has `mime_type: str`, but the frontend uses `file.mime_type` and `file.type` interchangeably (`DriveWidget.tsx` has a `getFileType` helper that checks both).

---

## 6. Missing Documentation & Test Coverage

### 6.1 Documentation
- **README.md** is a one-liner (`# atom8`). No setup instructions, architecture docs, or API reference.
- **No API documentation** (FastAPI auto-generated OpenAPI docs exist at runtime, but no static docs).
- **No developer onboarding guide** explaining the `pi` CLI dependency or skill system.
- **No `.env` documentation** beyond the example file.

### 6.2 Test Coverage
- **Frontend `__tests__/` directory is empty** — all tests are co-located with components (e.g., `Canvas.test.tsx`, `ComponentLibrary.test.tsx`, `GmailWidget.test.tsx`).
- Only **3 test files** exist in the entire frontend:
  - `Canvas.test.tsx` — 3 basic render tests (all mocked)
  - `ComponentLibrary.test.tsx` — 3 tests (category rendering, collapse, search)
  - `GmailWidget.test.tsx` — 2 tests (render with mock data, render with custom data)
- **No backend tests** at all. No pytest, no FastAPI `TestClient` usage.
- **No integration tests** between frontend and backend.
- **No E2E tests** (Playwright is installed as a `.playwright-cli` skill but not used for testing the app itself).
- **Coverage estimate:** <5% of total code.

### 6.3 Missing CI/CD
- No GitHub Actions, no pre-commit hooks, no linting enforcement.
- `package.json` has a `lint` script but no CI to run it.

---

## 7. Summary of Risks for Large-Scale Refactor

| Risk | Severity | Notes |
|---|---|---|
| `pi` CLI is a hard dependency | **High** | All AI/data features break if `pi` is unavailable or changes CLI interface |
| In-memory stores | **High** | Sessions and caches are not production-ready; scale is limited to 1 process |
| No backend tests | **High** | Refactoring backend services is unsafe without a test harness |
| Prompt injection surface | **Medium** | User prompts reach shell subprocesses; needs sanitization |
| Orphaned code (`google_api.py`, `ai_research.py`) | **Medium** | Confusing for new devs; may be accidentally re-activated |
| Inline styles + theme system | **Medium** | Refactoring UI will be tedious; theming is not CSS-driven |
| No Alembic migrations | **Medium** | Schema changes are risky; `create_all` is naive |
| Duplicate `formatTimeAgo` / widget boilerplate | **Low** | Easy to extract hooks; not blocking but noisy |
| CORS wildcard | **Low** | Fix before production deployment |
| Mock responses in `ai.py` | **Low** | Dead code; cleanup only |

---

## 8. Start Here (For the Next Agent)

**If you need to refactor or extend this project, open these files first:**

1. **`frontend/src/stores/layoutStore.ts`** — This is the beating heart of the frontend. Every widget action, theme, undo/redo, and AI suggestion flows through here.
2. **`backend/routers/ai.py`** — The most complex backend file. It routes chat, research, design, and queue endpoints. Any change to AI behavior starts here.
3. **`backend/services/pi_data_fetch.py`** — All Google data flows through this file. The `pi` agent task construction happens here.
4. **`frontend/src/services/api.ts`** — The single source of truth for frontend-backend contracts. Any new endpoint must be added here.

**If adding a new widget type:**
- Add to `frontend/src/types/index.ts` (`WidgetType`, `Category`, `COMPONENT_LIBRARY_ITEMS`)
- Add icon mapping in `frontend/src/components/GridWidget.tsx` and `DragPreview.tsx`
- Add component in `frontend/src/components/widgets/`
- Add backend endpoint in `backend/routers/data.py` (or extend existing ones)
- Add API method in `frontend/src/services/api.ts`

**If fixing the biggest backend duplication:**
- Merge `services/pi_agent.py` and `services/pi_chat.py` into a single configurable `PiRunner`.
- Extract shared subprocess logic: command building, timeout handling, JSON parsing, error fallback.
