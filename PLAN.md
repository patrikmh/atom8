# Living Canvas Dashboard — Implementation Plan

## Vision

A drag-and-drop canvas dashboard where AI-generated components and user-built components coexist. Users can arrange, resize, and style widgets that display data from Google services (Gmail, Calendar, Tasks, Drive). An AI assistant with a floating chat widget can answer questions, create new components on demand, and even rearrange the dashboard in "Designer Mode".

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│  🎨 React Frontend (Canvas Shell)            │
│  ┌─────────────────────────────────────────┐ │
│  │  react-grid-layout + custom canvas      │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐    │ │
│  │  │ 📧     │ │ 📅     │ │ 🤖 AI  │    │ │
│  │  │Gmail   │ │Calendar│ │Widget │    │ │
│  │  │(React) │ │(React) │ │(A2UI) │    │ │
│  │  └────────┘ └────────┘ └────────┘    │ │
│  └─────────────────────────────────────────┘ │
│  ┌────────────┐  ┌─────────────────────────┐ │
│  │ Component  │  │ 🤖 AI Chat Widget       │ │
│  │ Library    │  │ (AG-UI streaming)       │ │
│  │ Sidebar    │  │ Bottom-right, floating  │ │
│  └────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│  🐍 Python FastAPI Backend                  │
│  ┌─────────────────────────────────────────┐ │
│  │  /api/dashboard          - CRUD layout  │ │
│  │  /api/components         - CRUD widgets │ │
│  │  /api/data/gmail         - Gmail proxy  │ │
│  │  /api/data/calendar      - Calendar     │ │
│  │  /api/data/tasks         - Tasks        │ │
│  │  /api/data/drive         - Drive        │ │
│  │  /api/ai/chat            - AI chat SSE  │ │
│  │  /api/ai/design          - AI designer  │ │
│  │  /api/ai/component       - A2UI gen     │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│  🤖 Headless Pi (per-request spawn)         │
│  ┌─────────────────────────────────────────┐ │
│  │  Spawns on-demand for data requests     │ │
│  │  Uses .pi/extensions/*.ts tools         │ │
│  │  Returns structured JSON                │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│  📡 Google APIs (via extensions)            │
│  ┌─────────────────────────────────────────┐ │
│  │  Gmail / Calendar / Tasks / Drive         │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React + Vite | UI framework |
| **Canvas** | react-grid-layout | Drag-and-drop grid layout |
| **Drag & Drop** | react-dnd (or @dnd-kit) | Custom drag interactions |
| **User Components** | React + Tailwind CSS | Pre-built data widgets |
| **AI Components** | A2UI React renderer | Dynamically generated widgets |
| **AI Streaming** | AG-UI event protocol | Chat, tool calls, thinking |
| **State** | Zustand (lightweight) | Global state |
| **Backend** | Python FastAPI + uvicorn | API server |
| **Data Bridge** | Headless pi (subprocess) | Google API proxy |
| **Persistence** | SQLite (v1) / PostgreSQL (later) | Layout, configs, cache |
| **Auth** | OAuth 2.0 (Google) | Per-user Google auth |
| **AI** | Claude/OpenAI API (via pi) | AI assistant intelligence |

---

## Sprints Overview

| Sprint | Focus | Duration Estimate |
|--------|-------|-------------------|
| **Sprint 1** | Foundation — Canvas Shell, Grid Layout, Component Library | 2-3 days |
| **Sprint 2** | Google Data Integration — Gmail, Calendar, Tasks, Drive | 3-4 days |
| **Sprint 3** | AI Assistant — Chat Widget, AG-UI Streaming, A2UI Component Generation | 3-4 days |
| **Sprint 4** | AI Designer Mode — Suggest, Auto-Apply, Full Control | 2-3 days |
| **Sprint 5** | Polish — Themes, Persistence, Responsive, Performance | 2-3 days |

---

## Sprint 1: Foundation — Canvas Shell

### Goal
Create the core canvas experience: drag-and-drop grid, component library sidebar, and basic widget rendering.

### Key Decisions
- Use `react-grid-layout` for grid-based drag-and-drop (proven, well-maintained)
- Use `react-dnd` for sidebar-to-canvas drag-and-drop
- Store layout state in localStorage for v1 (SQLite later)
- Canvas supports: plain color, grid pattern, image wallpaper, dark mode

### Components
- `Canvas` — Main grid area with configurable background
- `ComponentLibrary` — Collapsible sidebar with categories + search
- `GridWidget` — Wrapper around react-grid-layout item
- `GmailWidget` (basic) — Placeholder for email data
- `CalendarWidget` (basic) — Placeholder for calendar data
- `TasksWidget` (basic) — Placeholder for tasks data
- `DriveWidget` (basic) — Placeholder for drive data

### Out of Scope
- Real data (placeholder data only)
- AI assistant
- Themes (basic styling only)
- Persistence beyond localStorage

---

## Sprint 2: Google Data Integration

### Goal
Connect the widgets to real Google data via the headless pi backend.

### Key Decisions
- Python FastAPI backend with `/api/data/*` endpoints
- Headless pi spawned per-request via subprocess
- Pi uses the existing `.pi/extensions/*.ts` tools
- OAuth flow handled via Google OAuth 2.0
- Token management in SQLite
- All data fetched simultaneously on startup

### Backend API
- `POST /api/data/gmail` — body: `{ count: 10 }`
- `POST /api/data/calendar` — body: `{ date: "2026-06-02" }`
- `POST /api/data/tasks` — body: `{ listId: "default" }`
- `POST /api/data/drive` — body: `{ count: 10 }`

### Frontend
- Data fetching on component mount
- Manual refresh button per component
- Loading states
- Error handling

### Out of Scope
- AI assistant
- Component styling customization
- Real-time updates

---

## Sprint 3: AI Assistant

### Goal
Build the AI assistant with chat widget, AG-UI streaming, and A2UI component generation.

### Key Decisions
- Floating chat widget in bottom-right
- AG-UI events over SSE for real-time streaming
- AI can answer questions about user data
- AI can generate new dashboard components via A2UI JSON
- A2UI React renderer for dynamic components
- Claude API via pi for AI intelligence

### Features
- `AIChatWidget` — Floating chat with message history
- `AGUIStream` — SSE connection for streaming events
- `A2UIComponent` — Dynamic component renderer
- `ComponentPrompt` — Prompt field per widget
- AI can create: charts, metrics, analysis cards, summaries

### AI Capabilities
- "How many emails do I have today?" → Data query
- "Show me a chart of email senders" → A2UI component generation
- "What's on my calendar?" → Data query
- "Add a component showing my tasks" → A2UI component creation

### Out of Scope
- AI Designer Mode (suggest layouts)
- Persistent AI conversation history
- Multi-modal AI (images, voice)

---

## Sprint 4: AI Designer Mode

### Goal
Enable the AI to rearrange, suggest, and auto-organize the dashboard.

### Key Decisions
- Three modes: Suggest & Approve, Auto-Apply with Undo, Full Control
- AI analyzes usage patterns to suggest layouts
- Blueprint/diff format for suggested changes
- Undo stack for all AI changes
- Toggle switch for "AI Designer Mode"

### Features
- `AIDesigner` — AI layout suggestion engine
- `BlueprintPanel` — Review AI suggestions before applying
- `UndoManager` — Undo/redo stack for AI changes
- `UsageAnalyzer` — Track component interactions for AI suggestions
- AI can suggest: group related components, create morning briefing view, auto-organize by priority

### Out of Scope
- AI learning across sessions (no ML model)
- Collaborative editing (single user only)

---

## Sprint 5: Polish & Themes

### Goal
Make the dashboard beautiful, persistent, and responsive.

### Key Decisions
- Pre-built themes: Light, Dark, Midnight, Ocean, Forest
- Custom theme per component: background, border, font, shadow
- Global theme overrides all components
- SQLite persistence for layout, configs, user prefs
- Responsive breakpoints for tablet/mobile

### Features
- `ThemeProvider` — Global theme system
- `ThemePicker` — Pre-built + custom theme editor
- `ComponentStyler` — Per-component style panel
- `SQLitePersistence` — Save/load everything
- `ResponsiveCanvas` — Adaptive grid for mobile

### Out of Scope
- Multi-user SaaS (v1 is personal)
- Component sharing/templates
- Real-time collaboration
- PWA/offline mode

---

## Out of Scope for v1

- Multi-user / SaaS (personal only)
- Component sharing / templates
- Real-time collaboration
- PWA / offline mode
- Push notifications
- Mobile app (responsive web only)
- Voice commands
- Custom AI model training
- Enterprise SSO (only Google OAuth)
- Performance analytics
- Data export

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Headless pi spawn latency | Cache data, background refresh |
| Google OAuth token expiry | Refresh token flow, re-auth prompt |
| A2UI component complexity | Start with simple components (Text, Card) |
| AG-UI streaming reliability | Fallback to polling, retry logic |
| react-grid-layout limitations | Custom DnD for advanced features |
| SQLite scaling | Abstract storage layer, swap to PostgreSQL later |

---

## File Structure

```
/Users/patrikandersson/telegram/atom8/
├── PLAN.md
├── SPRINT_CONTRACT.md
├── SPRINT_STATUS.md
├── frontend/                    # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Canvas.tsx
│   │   │   ├── ComponentLibrary.tsx
│   │   │   ├── GridWidget.tsx
│   │   │   ├── AIChatWidget.tsx
│   │   │   ├── AGUIStream.tsx
│   │   │   ├── A2UIComponent.tsx
│   │   │   └── widgets/
│   │   │       ├── GmailWidget.tsx
│   │   │       ├── CalendarWidget.tsx
│   │   │       ├── TasksWidget.tsx
│   │   │       └── DriveWidget.tsx
│   │   ├── hooks/
│   │   ├── stores/
│   │   ├── types/
│   │   ├── services/
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
├── backend/                     # Python FastAPI backend
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── routers/
│   │   │   ├── dashboard.py
│   │   │   ├── components.py
│   │   │   ├── data.py
│   │   │   └── ai.py
│   │   ├── services/
│   │   │   ├── pi_bridge.py
│   │   │   ├── google_auth.py
│   │   │   └── a2ui_renderer.py
│   │   ├── models/
│   │   └── database.py
│   ├── requirements.txt
│   └── pyproject.toml
├── .pi/                         # Existing pi extensions
│   └── extensions/
│       ├── google-auth.ts
│       ├── gmail.ts
│       ├── calendar.ts
│       ├── tasks.ts
│       ├── drive.ts
│       └── ...
└── docs/
    ├── architecture.md
    └── api.md
```

---

## Next Steps

1. Review and approve PLAN.md
2. Review and approve SPRINT_CONTRACT.md
3. Begin Sprint 1: Foundation

---

*Plan created by pbe-planner on 2026-06-02*
*Based on user interview covering 23 questions*