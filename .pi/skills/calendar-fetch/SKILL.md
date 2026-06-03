---
name: calendar-fetch
description: Comprehensive Google Calendar data fetching via bash + curl + jq. Supports multiple output formats, pagination, multiple calendars, recurring events, color coding, attendee details, timezone handling, free/busy analysis, and conflict detection.
---

# Calendar Fetch

## Output Format

This skill produces `event_list` type output. See `/skill:format-guide` for full format definitions.

Always wrap results in a JSON block with an `events` array:

```json
{
  "events": [
    {
      "id": "abc",
      "title": "Team Meeting",
      "start": "2026-06-01T10:00:00",
      "end": "2026-06-01T11:00:00",
      "location": "Room 101",
      "description": "Weekly sync"
    }
  ]
}
```

Comprehensive Google Calendar data fetching via bash + curl + jq.

## Prerequisites

- `jq` and `curl` installed
- `google-auth` skill available for token management
- OAuth tokens stored in `~/.pi/agent/auth.json`

## Files

| File | Purpose |
|------|---------|
| `scripts/fetch_calendar.sh` | Main helper — list events with many options |
| `scripts/fetch_calendars.sh` | List all calendars |
| `scripts/fetch_freebusy.sh` | Check free/busy slots |
| `scripts/fetch_event.sh` | Get a specific event by ID |
| `scripts/fetch_calendar.py` | (legacy) Python helper — kept for reference |

## Quick Start

```bash
# Get a token
TOKEN=$(/Users/patrikandersson/telegram/atom8/.pi/skills/google-auth/scripts/get_token.sh)

# List today's events
./scripts/fetch_calendar.sh -d today

# List events for next 7 days
./scripts/fetch_calendar.sh -s today -e +7

# List all calendars
./scripts/fetch_calendars.sh

# Check free/busy
./scripts/fetch_freebusy.sh -d today

# Get specific event
./scripts/fetch_event.sh EVENT_ID
```

## Main Script: fetch_calendar.sh

```bash
./scripts/fetch_calendar.sh [OPTIONS]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-d DATE` | Specific date (YYYY-MM-DD or `today`) | (none) |
| `-s START` | Start date (YYYY-MM-DD or `today`) | (none) |
| `-e END` | End date (YYYY-MM-DD or `+N` for N days from start) | (none) |
| `-q QUERY` | Free-text search query | (none) |
| `-c CALENDAR` | Calendar ID (default: `primary`) | primary |
| `-n COUNT` | Max results | 10 |
| `-f FORMAT` | Output format: json, table, csv, tsv, markdown, compact | json |
| `-p` | Paginate to fetch all results | false |
| `-v` | Verbose | false |
| `-h` | Show help | |

### Examples

#### A. Today's events (default JSON)
```bash
./scripts/fetch_calendar.sh -d today
```

#### B. Next 7 days as markdown table
```bash
./scripts/fetch_calendar.sh -s today -e +7 -f markdown
```

#### C. Search events by keyword
```bash
./scripts/fetch_calendar.sh -q "meeting" -n 20
```

#### D. Events from a specific calendar
```bash
./scripts/fetch_calendar.sh -c "work@example.com" -d today
```

#### E. Events for a date range
```bash
./scripts/fetch_calendar.sh -s 2026-06-01 -e 2026-06-30
```

#### F. Paginate all events
```bash
./scripts/fetch_calendar.sh -s today -e +30 -p
```

#### G. Compact format for quick scanning
```bash
./scripts/fetch_calendar.sh -d today -f compact
```

#### H. CSV export for analysis
```bash
./scripts/fetch_calendar.sh -s 2026-01-01 -e 2026-12-31 -f csv > events.csv
```

## Calendar Listing

### fetch_calendars.sh

```bash
./scripts/fetch_calendars.sh [FORMAT]
```

```bash
# List all calendars
./scripts/fetch_calendars.sh

# As table
./scripts/fetch_calendars.sh table
```

## Free/Busy Check

### fetch_freebusy.sh

```bash
./scripts/fetch_freebusy.sh [OPTIONS]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-d DATE` | Date (YYYY-MM-DD or `today`) | today |
| `-c CALENDAR` | Calendar ID (default: `primary`) | primary |
| `-f FORMAT` | Output format | json |
| `-v` | Verbose | false |
| `-h` | Show help | |

```bash
# Check today's free/busy
./scripts/fetch_freebusy.sh

# Check specific date
./scripts/fetch_freebusy.sh -d 2026-06-10

# Check a specific calendar
./scripts/fetch_freebusy.sh -c "work@example.com"
```

## Event Details

### fetch_event.sh

```bash
./scripts/fetch_event.sh EVENT_ID [CALENDAR_ID] [FORMAT]
```

```bash
# Get event details
./scripts/fetch_event.sh abc123

# From a specific calendar
./scripts/fetch_event.sh abc123 work@example.com

# As table
./scripts/fetch_event.sh abc123 primary table
```

## Raw curl Examples

### List events
```bash
TOKEN=$(./scripts/get_token.sh)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&orderBy=startTime&singleEvents=true"
```

### List all calendars
```bash
TOKEN=$(./scripts/get_token.sh)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://www.googleapis.com/calendar/v3/users/me/calendarList"
```

### Free/busy
```bash
TOKEN=$(./scripts/get_token.sh)
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "https://www.googleapis.com/calendar/v3/freeBusy" \
  -d "{\"timeMin\":\"$(date +%Y-%m-%d)T00:00:00Z\",\"timeMax\":\"$(date +%Y-%m-%d)T23:59:59Z\",\"items\":[{\"id\":\"primary\"}]}"
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `No events found` | Check the date range; try without `-d` or `-s/-e` |
| `Calendar not found` | Verify the calendar ID with `fetch_calendars.sh` |
| `Invalid date format` | Use `YYYY-MM-DD` or `today` |
| `Timezone issues` | Events are returned in the calendar's timezone |
