# Google Calendar Pi Extension

This pi extension provides authenticated access to Google Calendar via the Google Calendar API. It allows you to list, create, update, and delete events, check free/busy availability, and manage calendars directly from pi.

## Setup

### 1. Enable the Calendar API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one — e.g., `atom8-498213`)
3. Navigate to **APIs & Services > Library**
4. Search for **Google Calendar API** and enable it

### 2. Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**
2. Select **External** (or Internal if within a Google Workspace organization)
3. Fill in the required app information (name, user support email, etc.)
4. Add the following scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events`
5. Add **Authorized redirect URIs**:
   - `http://localhost`
   - `http://localhost:8000` (pi picks a random port in the 8000–8999 range)
6. Add yourself as a test user (required for external apps until verified)

### 3. Create OAuth Credentials

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Choose **Web application** as the application type (this allows redirect URIs)
4. Name it (e.g., "pi-calendar-extension")
5. Under **Authorized redirect URIs**, add:
   - `http://localhost`
   - `http://localhost:8000`
6. Save and download the client credentials JSON
7. Extract the `client_id` and `client_secret` values

### 4. Set Environment Variables

Add these to your shell profile (`.zshrc`, `.bashrc`, etc.):

```bash
export CALENDAR_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export CALENDAR_CLIENT_SECRET="your-client-secret"
```

Then reload: `source ~/.zshrc` (or `.bashrc`)

### 5. Authenticate

Start pi in this project directory. The extension will auto-discover. Then run:

```
/calendar-auth
```

Or ask pi to authenticate:

```
authenticate my google calendar
```

This will:
1. **Start a temporary local server** inside pi (on a random port 8000–8999)
2. **Open your browser** with the Google OAuth consent screen
3. **You click "Authorize"** in the browser
4. Google **redirects back to localhost** — pi captures the code automatically
5. **Tokens are stored** in the session

No copy-pasting of codes. The whole flow stays inside pi.

## Available Tools

| Tool | Description |
|------|-------------|
| `calendar_auth` | Check auth status or trigger OAuth flow |
| `calendar_list_events` | List events from a calendar (with date range, search) |
| `calendar_get_event` | Read a specific event by ID |
| `calendar_create_event` | Create a new event |
| `calendar_update_event` | Update an existing event (partial update) |
| `calendar_delete_event` | Delete an event |
| `calendar_list_calendars` | List all calendars you have access to |
| `calendar_get_calendar` | Get metadata for a specific calendar |
| `calendar_freebusy` | Check free/busy availability across calendars |

## Usage Examples

```
show my calendar for today
```

```
list my events this week
```

```
what meetings do i have tomorrow?
```

```
find my free time between 2pm and 6pm tomorrow
```

```
schedule a meeting with alice@example.com tomorrow at 14:00 for 1 hour
```

```
update my meeting titled "Team standup" to 10:00
```

```
cancel the meeting with id abc123
```

## Date/Time Input Formats

The extension accepts several formats for `timeMin`, `timeMax`, and event start/end times:

- **ISO 8601**: `2026-06-02T14:00:00+02:00` or `2026-06-02T12:00:00Z`
- **Relative terms**: `today`, `tomorrow`
- **Simple dates**: `2026-06-02` (interpreted as midnight UTC)

## Calendar IDs

- `primary` — your main calendar (default for most tools)
- Email addresses — shared calendars (e.g., `team@company.com`)
- `sv.swedish#holiday@group.v.calendar.google.com` — Swedish holidays
- Use `calendar_list_calendars` to discover all IDs

## Security Notes

- Your OAuth tokens are stored in the pi session file. They persist across restarts of the same session.
- The extension requests `offline` access so it can refresh tokens automatically.
- Never commit your `CALENDAR_CLIENT_SECRET` to version control.
- For production/team use, consider using a service account or more restrictive scopes.

## Troubleshooting

**"Not authenticated with Google Calendar"**
→ Run `/calendar-auth` and follow the flow.

**"Token exchange failed"**
→ Verify `CALENDAR_CLIENT_ID` and `CALENDAR_CLIENT_SECRET` are correct.
→ Check that your Google account is added as a test user in the OAuth consent screen.
→ Make sure `http://localhost` is added as an authorized redirect URI.

**"Calendar API error (403)"**
→ Your app may not be verified by Google. Test users can still use it.
→ Make sure the **Google Calendar API** is enabled in the API Library.

**"Calendar API error (404)"**
→ The calendar ID or event ID may not exist. Use `calendar_list_calendars` to verify IDs.

**Browser doesn't open automatically**
→ The auth URL will be shown in pi. You can copy-paste it into your browser manually.

**"Local auth server error: EADDRINUSE"**
→ The random port is already in use. Try again — pi will pick a different port.
