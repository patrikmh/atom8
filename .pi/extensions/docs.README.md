# Google Docs Pi Extension

This pi extension provides authenticated access to Google Docs via the Google Docs API. It allows you to list, read, create, and edit documents directly from pi.

## Setup

### 1. Enable the Docs API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to your project
3. Go to **APIs & Services > Library**
4. Search for **Google Docs API** and enable it

### 2. Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**
2. Add the following scopes:
   - `https://www.googleapis.com/auth/documents`
   - `https://www.googleapis.com/auth/documents.readonly`
   - `https://www.googleapis.com/auth/drive` (for listing docs)
3. Add `http://localhost` and `http://localhost:8000` as authorized redirect URIs

### 3. Create OAuth Credentials

Create a **Web application** OAuth client ID and download the credentials.

### 4. Set Environment Variables

```bash
export DOCS_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export DOCS_CLIENT_SECRET="your-client-secret"
```

### 5. Authenticate

```
/docs-auth
```

## Available Tools

| Tool | Description |
|------|-------------|
| `docs_auth` | Check auth status or trigger OAuth flow |
| `docs_list` | List Google Docs documents |
| `docs_read` | Read a document by ID (extracts plain text) |
| `docs_create` | Create a new document with optional content |
| `docs_append` | Append text to the end of a document |
| `docs_update` | Find and replace text in a document |

## Usage Examples

```
list my documents
```

```
read document abc123
```

```
create a document titled "Meeting Notes" with content "Discussed Q3 roadmap"
```

```
append to document abc123: "Action items: Follow up with sales team"
```

```
replace "Q3" with "Q4" in document abc123
```

## Security Notes

- Tokens stored in pi session. Set `DOCS_CLIENT_SECRET` in your shell profile, never commit it.
- The extension auto-refreshes expired tokens.
