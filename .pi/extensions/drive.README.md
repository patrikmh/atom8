# Google Drive Pi Extension

This pi extension provides authenticated access to Google Drive via the Google Drive API. It allows you to list, search, and manage files and folders directly from pi.

## Setup

### 1. Enable the Drive API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to your project
3. Go to **APIs & Services > Library**
4. Search for **Google Drive API** and enable it

### 2. Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**
2. Add the following scopes:
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/drive.file`
3. Add `http://localhost` and `http://localhost:8000` as authorized redirect URIs

### 3. Create OAuth Credentials

Create a **Web application** OAuth client ID and download the credentials.

### 4. Set Environment Variables

```bash
export DRIVE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export DRIVE_CLIENT_SECRET="your-client-secret"
```

### 5. Authenticate

```
/drive-auth
```

## Available Tools

| Tool | Description |
|------|-------------|
| `drive_auth` | Check auth status or trigger OAuth flow |
| `drive_list_files` | List files in a folder (default: root) |
| `drive_get_file` | Get file metadata by ID |
| `drive_create_folder` | Create a new folder |
| `drive_trash_file` | Move to trash or permanently delete |
| `drive_search_files` | Search files by name or query |

## Usage Examples

```
list my files
```

```
search drive for "budget"
```

```
get file metadata abc123
```

```
create folder "Project Alpha"
```

```
trash file abc123
```

## Security Notes

- Tokens stored in pi session. Set `DRIVE_CLIENT_SECRET` in your shell profile, never commit it.
- The extension auto-refreshes expired tokens.
