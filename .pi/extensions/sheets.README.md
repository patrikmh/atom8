# Google Sheets Pi Extension

This pi extension provides authenticated access to Google Sheets via the Google Sheets API. It allows you to read, write, append, and manage spreadsheet data directly from pi.

## Setup

### 1. Enable the Sheets API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to your project
3. Go to **APIs & Services > Library**
4. Search for **Google Sheets API** and enable it

### 2. Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**
2. Add the following scopes:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/spreadsheets.readonly`
   - `https://www.googleapis.com/auth/drive` (for listing sheets)
3. Add `http://localhost` and `http://localhost:8000` as authorized redirect URIs

### 3. Create OAuth Credentials

Create a **Web application** OAuth client ID and download the credentials.

### 4. Set Environment Variables

```bash
export SHEETS_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export SHEETS_CLIENT_SECRET="your-client-secret"
```

### 5. Authenticate

```
/sheets-auth
```

## Available Tools

| Tool | Description |
|------|-------------|
| `sheets_auth` | Check auth status or trigger OAuth flow |
| `sheets_list` | List Google Sheets spreadsheets |
| `sheets_read` | Read cell values from a range |
| `sheets_write` | Write values to a range (overwrites) |
| `sheets_append` | Append rows to a sheet |
| `sheets_clear` | Clear values from a range |
| `sheets_create` | Create a new spreadsheet |
| `sheets_get_info` | Get spreadsheet metadata (sheets, dimensions) |

## Usage Examples

```
list my spreadsheets
```

```
read sheet abc123 range A1:D10
```

```
write to sheet abc123 range Sheet1!A1:B2 with values [["Name","Score"],["Alice","95"]]
```

```
append to sheet abc123 range Sheet1 values [["Bob","87"]]
```

```
clear sheet abc123 range Sheet1!A1:D10
```

```
create a spreadsheet titled "Budget Tracker" with sheets ["Income", "Expenses"]
```

## Security Notes

- Tokens stored in pi session. Set `SHEETS_CLIENT_SECRET` in your shell profile, never commit it.
- The extension auto-refreshes expired tokens.
