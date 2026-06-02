# Living Canvas Dashboard

A modular, AI-powered dashboard for visualizing Google Workspace data (Gmail, Calendar, Tasks, Drive) and performing web research. Built with React 18, FastAPI, and the Pi agent CLI.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│  React 18 + Vite + TypeScript + Tailwind CSS + Zustand                │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   Gmail     │  │  Calendar   │  │   Tasks     │  │   Drive     │  │
│  │  Widget     │  │   Widget    │  │   Widget    │  │   Widget    │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────────┐ │
│  │  AI Research│  │  Custom     │  │         AI Chat Widget          │ │
│  │   Widget    │  │   Widget    │  │    (A2UI component renderer)    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────────────┘ │
│                                                                         │
│  Shared: useWidgetData hook, WidgetUI components, api.ts client        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP (JSON)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                     │
│  FastAPI + SQLAlchemy + SQLite + Pydantic                               │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  /api/data  │  │  /api/auth  │  │/api/dashboard│  │  /api/ai    │      │
│  │  (gmail,    │  │  (Google    │  │  (layout,   │  │  (chat,     │      │
│  │  calendar,  │  │  OAuth)     │  │  cache)     │  │  research)  │      │
│  │  tasks,     │  │             │  │             │  │             │      │
│  │  drive)     │  │             │  │             │  │             │      │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘      │
│                                                                         │
│  Shared: PiRunner (subprocess runner), Google API client,               │
│          input sanitization, in-memory TTL cache                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ subprocess
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              PI AGENT CLI                                │
│  Headless agent sessions with skill-based workflows                     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Skills: gmail-fetch, calendar-fetch, tasks-fetch, drive-fetch,   │  │
│  │          web-research                                           │  │
│  │  Tools:  read, grep, find, bash (curl + playwright-cli)         │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  Google API calls via curl + OAuth tokens from auth.json              │
│  Web research via playwright-cli (browser automation)                 │
└─────────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI framework |
| Vite | 5.2.11 | Build tool & dev server |
| TypeScript | 5.4.5 | Type system |
| Tailwind CSS | 3.4.3 | Utility-first styling |
| Zustand | 4.5.2 | State management |
| react-grid-layout | 1.4.4 | Draggable/resizable grid |
| react-dnd | 16.0.1 | Drag-and-drop |
| Vitest | 1.6.0 | Test runner |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| FastAPI | 0.111.0 | API framework |
| Uvicorn | 0.30.0 | ASGI server |
| Pydantic | 2.7.0 | Data validation |
| SQLAlchemy | 2.0.0 | ORM (SQLite) |
| httpx | 0.27.0 | HTTP client |
| pytest | 8.4.2 | Test runner |

### External Dependencies
- **Pi CLI** — Local agent CLI for AI/chat/data features (required)
- **Playwright** — Browser automation for web research
- **Google OAuth** — Required for Gmail, Calendar, Tasks, Drive widgets

## Setup

### Prerequisites
- Node.js 18+ and npm
- Python 3.11+ with pip
- [Pi CLI](https://github.com/patrikandersson/pi-cli) installed and available on PATH
- Google Cloud OAuth 2.0 credentials (Client ID + Client Secret)

### 1. Clone and Install

```bash
git clone https://github.com/patrikmh/atom8.git
cd atom8

# Frontend
npm install --prefix frontend

# Backend
python3 -m venv backend/venv
source backend/venv/bin/activate
pip install -r backend/requirements.txt
```

### 2. Environment Variables

Create `.env` in the project root:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Pi CLI (optional — defaults to fireworks/kimi-k2p6-turbo)
PI_PROVIDER=fireworks
PI_MODEL=accounts/fireworks/routers/kimi-k2p6-turbo

# CORS (production)
CORS_ALLOW_ORIGINS=https://yourdomain.com
CORS_ALLOW_CREDENTIALS=false

# Database (optional — defaults to SQLite)
DATABASE_URL=sqlite:///./living_canvas.db
```

### 3. Run Development Servers

```bash
# Terminal 1 — Backend
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev
```

The frontend will be at `http://localhost:5173` and the backend at `http://localhost:8000`.

### 4. Google OAuth Setup

1. Visit `http://localhost:5173` and click **Connect Google Account**
2. Follow the OAuth flow
3. Tokens are stored in `backend/auth.json` and the SQLite database

## Running Tests

### Frontend
```bash
cd frontend
npm test
```

### Backend
```bash
cd backend
python3 -m pytest tests/ -v
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/data/gmail` | Fetch emails |
| POST | `/api/data/calendar` | Fetch calendar events |
| POST | `/api/data/tasks` | Fetch tasks |
| POST | `/api/data/drive` | Fetch Drive files |
| POST | `/api/ai/chat` | AI chat message |
| POST | `/api/ai/research` | Web research |
| GET | `/api/auth/google/url` | OAuth URL |
| POST | `/api/auth/google/callback` | OAuth callback |
| POST | `/api/dashboard/layout` | Save/load layout |

## Skills System

The backend uses **Pi skills** — markdown files that define workflows for the agent. Skills are loaded at runtime and guide the agent through specific tasks:

- `gmail-fetch` — Read OAuth tokens, refresh if needed, call Gmail API via curl
- `calendar-fetch` — Fetch events from Google Calendar API
- `tasks-fetch` — Fetch tasks from Google Tasks API
- `drive-fetch` — Fetch files from Google Drive API
- `web-research` — Search web with playwright-cli, browse pages, synthesize report

Skills are located in `~/.pi/agent/skills/` and are referenced by the backend via `--skill` flags when spawning the Pi CLI.

## Key Design Decisions

### 1. Pi CLI as the AI Layer

All AI/data operations go through the Pi CLI subprocess rather than direct API calls. This allows:
- **Skill-based workflows** — Reusable, documented patterns for common tasks
- **Tool access** — The agent can use `read`, `grep`, `find`, `bash` (curl, playwright-cli)
- **Extensibility** — New skills can be added without code changes

### 2. Frontend Widget Architecture

All data widgets use the shared `useWidgetData` hook which encapsulates:
- Loading state, error handling, data storage
- Refresh triggers (manual + interval polling)
- Integration with the Zustand layout store

This eliminates ~80% of the duplicated boilerplate that existed in v1.

### 3. Input Sanitization

User-provided prompts are sanitized in `services/pi_data_fetch.py` to remove shell metacharacters (`;`, `|`, `&`, `$`, `` ` ``, `<`, `>`) before they reach the Pi CLI subprocess.

### 4. CORS Configuration

CORS is configurable via environment variables:
- `CORS_ALLOW_ORIGINS` — Comma-separated list of allowed origins (default: `*`)
- `CORS_ALLOW_CREDENTIALS` — Boolean for credentials support (default: `false`)

For production, set `CORS_ALLOW_ORIGINS` to your frontend domain and `CORS_ALLOW_CREDENTIALS=true` if using cookies.

## Project Structure

```
atom8/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── widgets/          # Gmail, Calendar, Tasks, Drive, AI, Custom
│   │   │   ├── Canvas.tsx         # Grid layout container
│   │   │   ├── GridWidget.tsx     # Widget wrapper
│   │   │   └── AIChatWidget.tsx   # Floating chat
│   │   ├── hooks/
│   │   │   └── useWidgetData.ts   # Shared data-fetching hook
│   │   ├── stores/
│   │   │   └── layoutStore.ts     # Zustand state
│   │   ├── services/
│   │   │   └── api.ts             # API client
│   │   └── types/
│   │       └── index.ts           # TypeScript types
│   ├── package.json
│   └── vite.config.ts
├── backend/
│   ├── routers/
│   │   ├── ai.py                  # Chat, research, design
│   │   ├── data.py                # Gmail, Calendar, Tasks, Drive
│   │   ├── auth.py                # Google OAuth
│   │   └── dashboard.py           # Layout persistence
│   ├── services/
│   │   ├── pi_runner.py           # Unified Pi CLI runner
│   │   ├── pi_agent.py            # Backward-compatible shim
│   │   ├── pi_chat.py             # Chat session manager
│   │   ├── pi_data_fetch.py       # Data fetch wrappers
│   │   └── google_api.py          # Token management
│   ├── models.py                  # Pydantic models
│   ├── database.py                # SQLAlchemy setup
│   ├── main.py                    # FastAPI entry point
│   ├── tests/                     # pytest suite
│   └── requirements.txt
└── .env
```

## Development

### Adding a New Widget Type

1. **Add to types** — `frontend/src/types/index.ts` (`WidgetType`, `Category`, `COMPONENT_LIBRARY_ITEMS`)
2. **Add icon mapping** — `frontend/src/components/GridWidget.tsx` and `DragPreview.tsx`
3. **Create component** — `frontend/src/components/widgets/YourWidget.tsx` using `useWidgetData`
4. **Add backend endpoint** — `backend/routers/data.py` (or extend existing)
5. **Add API method** — `frontend/src/services/api.ts`

### Adding a New Skill

1. Create `~/.pi/agent/skills/your-skill/SKILL.md`
2. Follow the skill format (see existing skills for examples)
3. Update `backend/services/pi_data_fetch.py` to use the new skill

## License

MIT
