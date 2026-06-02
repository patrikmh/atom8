# Google Productivity Suite for Pi

A complete set of pi extensions for Google Workspace productivity tools. Manage your email, calendar, tasks, contacts, files, documents, and spreadsheets — all from within pi.

## Extensions

| Extension | File | APIs | Status |
|-----------|------|------|--------|
| **Gmail** | `gmail.ts` | Gmail API | ✅ Built-in |
| **Calendar** | `calendar.ts` | Google Calendar API | ✅ Ready |
| **Tasks** | `tasks.ts` | Google Tasks API | ✅ Ready |
| **Contacts** | `contacts.ts` | Google People API | ✅ Ready |
| **Drive** | `drive.ts` | Google Drive API | ✅ Ready |
| **Docs** | `docs.ts` | Google Docs API | ✅ Ready |
| **Sheets** | `sheets.ts` | Google Sheets API | ✅ Ready |

## Quick Setup

### 1. Enable All APIs in Google Cloud Console

Go to [APIs & Services > Library](https://console.cloud.google.com/apis/library) and enable each API:

- Gmail API
- Google Calendar API
- Google Tasks API
- People API
- Google Drive API
- Google Docs API
- Google Sheets API

### 2. Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**
2. Add all scopes for the APIs you want to use
3. Add `http://localhost` and `http://localhost:8000` as authorized redirect URIs for each OAuth client

### 3. Create OAuth Credentials

For each API, create a **Web application** OAuth client ID (or reuse the same one across APIs if they share the same project). Download each `credentials.json`.

### 4. Set Environment Variables

**Option A — Unified (recommended):** Set one pair for all Google APIs:

```bash
export GOOGLE_CLIENT_ID="your-id"
export GOOGLE_CLIENT_SECRET="your-secret"
```

**Option B — Per-service:** Set individual env vars (useful if APIs are in different projects):

```bash
export GMAIL_CLIENT_ID="your-id"
export GMAIL_CLIENT_SECRET="your-secret"
export CALENDAR_CLIENT_ID="your-id"
export CALENDAR_CLIENT_SECRET="your-secret"
export TASKS_CLIENT_ID="your-id"
export TASKS_CLIENT_SECRET="your-secret"
export CONTACTS_CLIENT_ID="your-id"
export CONTACTS_CLIENT_SECRET="your-secret"
export DRIVE_CLIENT_ID="your-id"
export DRIVE_CLIENT_SECRET="your-secret"
export DOCS_CLIENT_ID="your-id"
export DOCS_CLIENT_SECRET="your-secret"
export SHEETS_CLIENT_ID="your-id"
export SHEETS_CLIENT_SECRET="your-secret"
```

> **Tip:** Each extension falls back to `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` if its specific env var isn't set. Use the unified pair for simplicity.

### 5. Authenticate

**Option A — One-click for all (recommended):**

```
/google-auth
```

This authenticates with all 7 Google APIs at once using a single OAuth flow.

**Option B — Per-service:**

```
/gmail-auth
/calendar-auth
/tasks-auth
/contacts-auth
/drive-auth
/docs-auth
/sheets-auth
```

## Productivity Workflows

### Daily Standup
```
show my calendar for today
show my unread emails
show my tasks
```

### Project Planning
```
create folder "Project Alpha"
create a spreadsheet titled "Project Alpha Tracker" with sheets ["Tasks", "Budget", "Timeline"]
create a document titled "Project Alpha Brief" with content "Project overview..."
add event: Project Kickoff on June 5 at 2:00 PM
```

### Meeting Notes
```
read document meeting-notes-abc123
append to document meeting-notes-abc123: "Action items: Follow up with design team by Friday"
```

### Data Entry
```
append to sheet budget-tracker range Budget values [["Office supplies", "$450", "2026-06-01"]]
```

## Microsoft Graph Alternative

For Microsoft 365 users, see `microsoft-graph.ts` — a unified extension for Outlook, Calendar, To Do, Contacts, and OneDrive.

## Security Notes

- All tokens are stored in pi session entries (never on disk unencrypted)
- Set all `*_CLIENT_SECRET` values in your shell profile, never commit them to version control
- Each extension auto-refreshes expired access tokens using refresh tokens
- OAuth flows use local server callbacks with CSRF state protection
