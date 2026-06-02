# Google Tasks Pi Extension

This pi extension provides authenticated access to Google Tasks via the Google Tasks API. It allows you to manage to-do lists, create tasks, mark them complete, and organize your task lists directly from pi.

## Setup

### 1. Enable the Tasks API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to your project (e.g., `atom8-498213`)
3. Go to **APIs & Services > Library**
4. Search for **Google Tasks API** and enable it

### 2. Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**
2. Add the following scopes:
   - `https://www.googleapis.com/auth/tasks`
   - `https://www.googleapis.com/auth/tasks.readonly`
3. Add `http://localhost` and `http://localhost:8000` as authorized redirect URIs

### 3. Create OAuth Credentials

Same process as Gmail — create a **Web application** OAuth client ID and download the credentials.

### 4. Set Environment Variables

```bash
export TASKS_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export TASKS_CLIENT_SECRET="your-client-secret"
```

### 5. Authenticate

```
/tasks-auth
```

## Available Tools

| Tool | Description |
|------|-------------|
| `tasks_auth` | Check auth status or trigger OAuth flow |
| `tasks_list_tasklists` | List all task lists |
| `tasks_list_tasks` | List tasks in a list (with showCompleted/showHidden) |
| `tasks_get_task` | Read a specific task by ID |
| `tasks_create_task` | Create a new task |
| `tasks_update_task` | Update a task (title, notes, due, status) |
| `tasks_delete_task` | Delete a task permanently |
| `tasks_clear_completed` | Clear all completed tasks from a list |
| `tasks_move_task` | Move a task to a different position/parent |

## Usage Examples

```
show my tasks
```

```
add a task: buy groceries due tomorrow
```

```
mark task abc123 as completed
```

```
show completed tasks
```

```
clear all completed tasks
```

## Security Notes

- Tokens stored in pi session. Set `TASKS_CLIENT_SECRET` in your shell profile, never commit it.
- The extension auto-refreshes expired tokens.
