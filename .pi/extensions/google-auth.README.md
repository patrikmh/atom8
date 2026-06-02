# Unified Google Auth Pi Extension

This extension provides a **single OAuth flow** that authenticates with all Google APIs at once — Gmail, Calendar, Tasks, Contacts, Drive, Docs, and Sheets. Instead of running 8 separate auth commands, you authenticate once and all extensions share the same token.

## Setup

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
2. Add all scopes from the [main README](README.md)
3. Add `http://localhost` and `http://localhost:8000` as authorized redirect URIs

### 3. Create OAuth Credentials

Create a **Web application** OAuth client ID and download the credentials.

### 4. Set Environment Variables

```bash
export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="your-client-secret"
```

> **Fallback:** If `GOOGLE_CLIENT_ID` is not set, the extension falls back to `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`.

### 5. Authenticate

```
/google-auth
```

This requests all scopes from all 7 Google APIs in a single OAuth flow. Once complete, you can immediately use any of the Google extensions without re-authenticating.

## How It Works

- The `/google-auth` command requests all 20+ OAuth scopes at once
- The token is stored as a `google-auth` session entry
- Each individual extension (gmail, calendar, tasks, etc.) checks for `google-auth` entries on startup and uses that token if available
- Each extension also falls back to `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` if its specific env var isn't set

## Individual Auth Still Works

You can still use per-service auth if you prefer:

```
/gmail-auth
/calendar-auth
/tasks-auth
...
```

Each extension prioritizes its own token (`gmail-auth`, `calendar-auth`, etc.) over the shared one. This is useful if different APIs need different Google Cloud projects.

## Available Tools

| Tool | Description |
|------|-------------|
| `google_auth` | Check status or trigger the unified OAuth flow |

## Security Notes

- Tokens stored in pi session. Set `GOOGLE_CLIENT_SECRET` in your shell profile, never commit it.
- The extension auto-refreshes expired tokens.
