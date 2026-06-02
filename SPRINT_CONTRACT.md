# Sprint Contract — Living Canvas Dashboard

## Sprint 1: Foundation — Canvas Shell

### Overview
Create the core canvas experience: drag-and-drop grid, component library sidebar, and basic widget rendering with placeholder data.

### Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|------------|
| 1.1 | Canvas displays as a grid with configurable columns (default 12) | Visual inspection: grid is visible, items snap to columns |
| 1.2 | User can drag components from the sidebar onto the canvas | Playwright: drag a Gmail component from sidebar to canvas, verify it appears |
| 1.3 | Components on canvas can be dragged to reposition | Playwright: drag an existing component to a new grid position |
| 1.4 | Components can be resized by dragging resize handles | Playwright: resize a component, verify width/height changes in grid units |
| 1.5 | Sidebar is collapsible and expandable | Click sidebar toggle, verify it collapses to icon-only and expands back |
| 1.6 | Sidebar shows categories: Gmail, Calendar, Tasks, Drive, AI, Custom | Visual inspection: all 6 categories are visible with icons |
| 1.7 | Sidebar search filters components by name | Type "gmail" in search box, verify only Gmail-related components appear |
| 1.8 | Canvas supports 4 background modes: plain color, grid pattern, image wallpaper, dark theme | Switch each mode, verify visual change |
| 1.9 | Default layout is pre-populated with 3 components: Calendar (today), Gmail (last 10), Tasks (today) | Clear localStorage, refresh page, verify 3 components appear |
| 1.10 | Components have placeholder data (no real API calls yet) | Inspect a Gmail component, verify it shows mock email data |
| 1.11 | Layout is saved to and restored from localStorage | Move components, refresh page, verify positions are restored |

### Out of Scope
- Real Google API data
- AI assistant
- Component styling customization
- Themes beyond basic background
- Persistence beyond localStorage

---

## Sprint 2: Google Data Integration

### Overview
Connect the widgets to real Google data via the Python FastAPI backend and headless pi bridge.

### Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|------------|
| 2.1 | FastAPI backend serves on `http://localhost:8000` with CORS enabled | `curl http://localhost:8000/health` returns `{"status": "ok"}` |
| 2.2 | Backend endpoint `POST /api/data/gmail` returns real emails from Gmail | Send request with `{count: 5}`, verify response contains email subjects |
| 2.3 | Backend endpoint `POST /api/data/calendar` returns real calendar events | Send request with `{date: "2026-06-02"}`, verify response contains events |
| 2.4 | Backend endpoint `POST /api/data/tasks` returns real tasks | Send request, verify response contains task titles |
| 2.5 | Backend endpoint `POST /api/data/drive` returns real recent files | Send request with `{count: 5}`, verify response contains file names |
| 2.6 | Headless pi spawns on-demand and returns structured JSON | Backend logs show pi spawn, response JSON has expected structure |
| 2.7 | Gmail component fetches and displays real email data on mount | Visual: component shows real email subjects, not placeholder |
| 2.8 | Calendar component fetches and displays real today's events | Visual: component shows real events with times |
| 2.9 | Tasks component fetches and displays real tasks | Visual: component shows real task titles |
| 2.10 | Drive component fetches and displays real recent files | Visual: component shows real file names |
| 2.11 | Each component has a manual refresh button that re-fetches data | Click refresh, verify data updates (or loading spinner appears) |
| 2.12 | On app startup, all components fetch data simultaneously | Network tab: 4 parallel requests to backend on page load |
| 2.13 | Google OAuth flow works and stores tokens in SQLite | Complete OAuth flow, verify token in SQLite database |
| 2.14 | Error state shows user-friendly message when API fails | Disconnect network, verify error message appears in component |
| 2.15 | Loading state shows spinner while data is fetching | Throttle network to 3G, verify loading spinner appears |

### Out of Scope
- AI assistant
- Component styling customization
- Real-time updates
- Token refresh (manual re-auth only)

---

## Sprint 3: AI Assistant

### Overview
Build the floating AI chat widget with AG-UI streaming, data-aware answers, and A2UI component generation.

### Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|------------|
| 3.1 | Floating chat widget is visible in bottom-right corner | Visual: chat widget appears fixed in bottom-right |
| 3.2 | Chat widget can be minimized and maximized | Click minimize, verify widget collapses to icon; click to expand |
| 3.3 | User can send a message and receive a response | Type "Hello", verify response appears within 10 seconds |
| 3.4 | AI can answer questions about user data (e.g., "How many emails today?") | Type "How many emails do I have?", verify answer is based on real data |
| 3.5 | AI can create a new dashboard component on demand | Type "Add a chart of my email senders", verify new component appears on canvas |
| 3.6 | AI-generated components use A2UI JSON format | Inspect new component props, verify A2UI JSON structure |
| 3.7 | AI-generated components are rendered via A2UI React renderer | Visual: component renders correctly with A2UI renderer |
| 3.8 | AG-UI streaming shows thinking indicators during AI processing | Type a message, verify "thinking" indicator appears before response |
| 3.9 | Each component has a prompt field showing what it queries | Inspect component, verify prompt field is visible and editable |
| 3.10 | Prompt field accepts free text input | Type a custom prompt, verify it saves and can be re-executed |
| 3.11 | Prompt field accepts template with placeholders | Verify template like "Show last {{count}} emails" works |
| 3.12 | AI can re-execute a component's prompt and refresh data | Click AI refresh, verify component data updates |
| 3.13 | Web research via Playwright CLI is available in chat | Type "Research the latest AI news", verify web search results |
| 3.14 | Chat history is maintained during the session | Send 3 messages, verify all are visible in scrollable history |
| 3.15 | AI can summarize data across multiple components | Type "Summarize my day", verify answer references calendar + tasks + emails |

### Out of Scope
- AI Designer Mode
- Persistent chat history across sessions
- Multi-modal AI (images, voice)
- Voice commands

---

## Sprint 4: AI Designer Mode

### Overview
Enable the AI to suggest, auto-apply, and fully control dashboard layouts.

### Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|------------|
| 4.1 | AI Designer Mode toggle is accessible from the toolbar | Visual: toggle switch visible in top toolbar |
| 4.2 | Mode A: AI suggests layout changes for user approval | Trigger suggestion, verify blueprint panel shows proposed changes |
| 4.3 | User can approve or reject individual suggestions | Blueprint panel shows approve/reject buttons per suggestion |
| 4.4 | Mode B: AI auto-applies changes with undo capability | Enable auto-apply, trigger AI, verify layout changes, click undo |
| 4.5 | Undo stack supports multiple undo/redo operations | Make 3 AI changes, verify 3 undo operations restore previous states |
| 4.6 | Mode C: Full AI Designer Mode gives AI complete control | Enable full mode, verify AI can move/resize/create without approval |
| 4.7 | AI can group related components (e.g., all Gmail-related) | Trigger grouping, verify related components are placed adjacent |
| 4.8 | AI can create a "Morning Briefing" view with relevant components | Trigger briefing view, verify calendar + priority emails + tasks appear |
| 4.9 | AI analyzes usage patterns and suggests optimizations | Use dashboard for 5 minutes, verify AI suggests a layout optimization |
| 4.10 | AI suggestions are shown as a visual diff (before/after) | Trigger suggestion, verify side-by-side or overlay comparison |
| 4.11 | AI Designer Mode can be disabled, returning full control to user | Toggle off, verify user can manually drag/resize without AI interference |
| 4.12 | AI changes are saved to layout persistence | Apply AI change, refresh page, verify change persists |

### Out of Scope
- AI learning across sessions (no ML model)
- Collaborative editing
- AI predicting user needs before asked

---

## Sprint 5: Polish & Themes

### Overview
Make the dashboard beautiful, fully persistent, and responsive.

### Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|------------|
| 5.1 | 5 pre-built themes are available: Light, Dark, Midnight, Ocean, Forest | Theme picker shows all 5, switching changes global appearance |
| 5.2 | Custom theme per component: background color/opacity | Select component, change background, verify visual change |
| 5.3 | Custom theme per component: border color and radius | Change border color to red, radius to 12px, verify rendering |
| 5.4 | Custom theme per component: font family, size, color | Change font to "Inter", size 14, color #333, verify text rendering |
| 5.5 | Custom theme per component: shadow/elevation | Add shadow, verify drop shadow appears on component |
| 5.6 | Custom theme per component: padding and margins | Adjust padding to 20px, verify internal spacing changes |
| 5.7 | Global theme overrides all component styles | Set global theme, verify all components adopt global colors/fonts |
| 5.8 | Canvas layout is persisted to SQLite database | Move component, check SQLite, verify layout JSON saved |
| 5.9 | Component configurations are persisted to SQLite | Edit prompt, check SQLite, verify config saved |
| 5.10 | User preferences are persisted to SQLite | Change theme, check SQLite, verify preference saved |
| 5.11 | Cached data is persisted for fast loading | Load dashboard, verify data appears without API calls (from cache) |
| 5.12 | Responsive layout adapts to tablet (≤1024px) | Resize to 1024px, verify grid columns reduce, components stack |
| 5.13 | Responsive layout adapts to mobile (≤768px) | Resize to 768px, verify single column, touch-friendly controls |
| 5.14 | Dashboard loads in under 3 seconds on revisit | Clear cache, load once, reload, verify <3s load time |
| 5.15 | Error boundary catches component crashes | Introduce a bug in one component, verify error boundary shows fallback |
| 5.16 | Keyboard shortcuts exist for common actions | Test: Ctrl+R refreshes, Ctrl+D toggles designer mode, Escape closes chat |

### Out of Scope
- Multi-user SaaS
- Component sharing/templates
- PWA/offline mode
- Push notifications
- Mobile app
- Performance analytics
- Data export

---

## Grading Instructions

### Pass Criteria
- Sprint passes if ALL criteria in that sprint are graded **PASS**
- Each criterion is binary: PASS or FAIL
- No partial credit

### Fail Criteria
- Any FAIL criterion blocks sprint acceptance
- Maximum 3 rebuild rounds per sprint
- After 3 rounds, document remaining gaps and proceed

### Grading Process
1. Read implementation files
2. Run test suite
3. Verify each criterion with test or manual inspection
4. Record PASS or FAIL with specific evidence
5. Write EVALUATION.md

---

*Contract created by pbe-planner on 2026-06-02*
*Total criteria: 73 (Sprint 1: 11, Sprint 2: 15, Sprint 3: 15, Sprint 4: 12, Sprint 5: 16)*