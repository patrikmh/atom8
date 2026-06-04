---
name: tasks-fetch
description: Comprehensive Google Tasks data fetching via bash + curl + jq. Supports multiple output formats, pagination, task list management, sorting, due date filtering, completion tracking, and subtask handling.
---

# Tasks Fetch

## Output Format

This skill produces `task_list` type output. See `/skill:format-guide` for full format definitions.

Always wrap results in a JSON block with a `tasks` array:

```json
{
  "tasks": [
    {
      "id": "task1",
      "title": "Buy groceries",
      "completed": false,
      "due": "2026-06-01T00:00:00.000Z",
      "notes": "Milk, eggs, bread"
    }
  ]
}
```

### Empty State

If no tasks are found, output **only** the JSON with an empty array. Do not add explanatory text or list metadata.

```json
{"tasks": []}
```

Comprehensive Google Tasks data fetching via bash + curl + jq.

## Prerequisites

- `jq` and `curl` installed
- `google-auth` skill available for token management
- OAuth tokens stored in `~/.pi/agent/auth.json`

## Files

| File | Purpose |
|------|---------|
| `scripts/fetch_tasks.sh` | Main helper — fetch all tasks from all lists |
| `scripts/fetch_tasklist.sh` | Fetch tasks from a specific list |
| `scripts/fetch_tasklists.sh` | List all task lists |
| `scripts/fetch_pending.sh` | Fetch only pending (incomplete) tasks |
| `scripts/fetch_due.sh` | Fetch tasks with due dates |
| `scripts/fetch_task.py` | (legacy) Python helper — kept for reference |

## Quick Start

```bash
# Get a token
TOKEN=$(/Users/patrikandersson/telegram/atom8/.pi/skills/google-auth/scripts/get_token.sh)

# Fetch all tasks from all lists
./scripts/fetch_tasks.sh

# Fetch as markdown table
./scripts/fetch_tasks.sh -f markdown

# Fetch only pending tasks
./scripts/fetch_pending.sh

# Fetch tasks with due dates
./scripts/fetch_due.sh

# List all task lists
./scripts/fetch_tasklists.sh

# Fetch tasks from a specific list
./scripts/fetch_tasklist.sh -i LIST_ID
```

## Main Script: fetch_tasks.sh

```bash
./scripts/fetch_tasks.sh [OPTIONS]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-f FORMAT` | Output format: json, table, csv, tsv, markdown, compact | json |
| `-v` | Verbose | false |
| `-h` | Show help | |

### Examples

#### A. Fetch all tasks (default JSON)
```bash
./scripts/fetch_tasks.sh
```

#### B. As markdown table
```bash
./scripts/fetch_tasks.sh -f markdown
```

#### C. Compact format for quick scanning
```bash
./scripts/fetch_tasks.sh -f compact
```

#### D. CSV export
```bash
./scripts/fetch_tasks.sh -f csv > tasks.csv
```

## Task List Listing

### fetch_tasklists.sh

```bash
./scripts/fetch_tasklists.sh [FORMAT]
```

```bash
# List all task lists
./scripts/fetch_tasklists.sh

# As table
./scripts/fetch_tasklists.sh table
```

## Specific List Tasks

### fetch_tasklist.sh

```bash
./scripts/fetch_tasklist.sh [OPTIONS]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-i ID` | Task list ID | (required) |
| `-f FORMAT` | Output format | json |
| `-c` | Show completed tasks | false |
| `-v` | Verbose | false |
| `-h` | Show help | |

```bash
# Fetch tasks from a list
./scripts/fetch_tasklist.sh -i abc123

# Include completed tasks
./scripts/fetch_tasklist.sh -i abc123 -c

# As table
./scripts/fetch_tasklist.sh -i abc123 -f table
```

## Pending Tasks

### fetch_pending.sh

```bash
./scripts/fetch_pending.sh [OPTIONS]
```

```bash
# Fetch all pending tasks
./scripts/fetch_pending.sh

# As markdown
./scripts/fetch_pending.sh -f markdown
```

## Due Date Tasks

### fetch_due.sh

```bash
./scripts/fetch_due.sh [OPTIONS]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-d DATE` | Due date (YYYY-MM-DD or `today`) | today |
| `-f FORMAT` | Output format | json |
| `-v` | Verbose | false |
| `-h` | Show help | |

```bash
# Fetch tasks due today
./scripts/fetch_due.sh

# Fetch tasks due on a specific date
./scripts/fetch_due.sh -d 2026-06-10

# As table
./scripts/fetch_due.sh -f table
```

## Raw curl Examples

### List task lists
```bash
TOKEN=$(./scripts/get_token.sh)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://tasks.googleapis.com/tasks/v1/users/@me/lists"
```

### List tasks in a list
```bash
TOKEN=$(./scripts/get_token.sh)
LIST_ID="abc123"
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://tasks.googleapis.com/tasks/v1/lists/${LIST_ID}/tasks?maxResults=100"
```

### List pending tasks
```bash
TOKEN=$(./scripts/get_token.sh)
LIST_ID="abc123"
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://tasks.googleapis.com/tasks/v1/lists/${LIST_ID}/tasks?maxResults=100&showCompleted=false"
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `No tasks found` | Check that you have tasks in Google Tasks |
| `List not found` | Verify the list ID with `fetch_tasklists.sh` |
| `Empty output` | All tasks may be completed; try `-c` to show completed |
