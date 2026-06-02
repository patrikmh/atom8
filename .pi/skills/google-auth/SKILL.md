---
name: google-auth
description: Shared Google OAuth token management for all data-fetching skills. Provides token retrieval, validation, refresh, inspection, and configuration management. Supports multiple auth providers, scopes, and configuration via environment variables or config file.
---

# Google Auth

Comprehensive shared token management for Google OAuth. All data-fetch skills (gmail-fetch, calendar-fetch, drive-fetch, tasks-fetch) use this to get valid access tokens.

## Prerequisites

- `jq` (JSON parser) — required for token extraction
- `curl` — required for token refresh
- `bc` (optional) — for size calculations in other skills
- Initial OAuth tokens stored in `~/.pi/agent/auth.json` by the auth extension

## Files

| File | Purpose |
|------|---------|
| `scripts/get_token.sh` | Get a valid access token (auto-refreshes) |
| `scripts/inspect_token.sh` | Inspect token details, scopes, expiry |
| `scripts/validate_token.sh` | Validate a token against Google's API |
| `scripts/get_token.py` | (legacy) Python token helper — kept for reference |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GSKILL_AUTH_FILE` | Path to auth.json | `~/.pi/agent/auth.json` |
| `GSKILL_CONFIG_FILE` | Path to config file | `~/.pi/agent/google-skills.conf` |
| `GSKILL_VERBOSE` | Verbose output (0-2) | `0` |
| `GSKILL_MAX_RETRIES` | Max retries for API calls | `3` |
| `GSKILL_RETRY_DELAY` | Delay between retries (seconds) | `1` |
| `GSKILL_FORMAT` | Default output format | `json` |
| `GOOGLE_CLIENT_ID` | OAuth client ID | (none) |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | (none) |
| `GMAIL_CLIENT_ID` | Fallback client ID | (none) |
| `GMAIL_CLIENT_SECRET` | Fallback client secret | (none) |

### Config File

Create `~/.pi/agent/google-skills.conf` for persistent settings:

```bash
# Default output format: json, table, csv, tsv, markdown, compact
GSKILL_FORMAT=json

# Verbose mode: 0=quiet, 1=verbose, 2=debug
GSKILL_VERBOSE=0

# OAuth credentials
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

## Quick Start

### Get a token
```bash
TOKEN=$(/Users/patrikandersson/telegram/atom8/.pi/skills/google-auth/scripts/get_token.sh)
echo "$TOKEN"
```

### Inspect token
```bash
./scripts/inspect_token.sh
```

### Validate token
```bash
./scripts/validate_token.sh
```

## Usage Examples

### A. Token with credentials as arguments
```bash
TOKEN=$(./scripts/get_token.sh "YOUR_CLIENT_ID" "YOUR_CLIENT_SECRET")
```

### B. Token with environment variables
```bash
export GOOGLE_CLIENT_ID="your-client-id"
export GOOGLE_CLIENT_SECRET="your-client-secret"
TOKEN=$(./scripts/get_token.sh)
```

### C. Inspect token scopes and expiry
```bash
./scripts/inspect_token.sh
# Output: token details, expiry time, remaining seconds, scopes
```

### D. Validate token against Google
```bash
./scripts/validate_token.sh
# Output: {"valid": true, "scopes": [...], "email": "..."}
```

### E. Check if token is expired
```bash
TOKEN=$(./scripts/get_token.sh)
if ./scripts/validate_token.sh "$TOKEN" >/dev/null 2>&1; then
  echo "Token is valid"
else
  echo "Token is invalid"
fi
```

### F. Using the shared library
```bash
source /Users/patrikandersson/telegram/atom8/.pi/skills/common/lib.sh
TOKEN=$(get_token)
# Library provides: load_config, get_token, validate_token, check_error, urlencode,
# date helpers, pagination, formatting, logging, http_get, http_post, etc.
```

### G. Direct curl usage after getting token
```bash
TOKEN=$(./scripts/get_token.sh)

# Gmail API
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10"

# Calendar API
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10"

# Drive API
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://www.googleapis.com/drive/v3/files?maxResults=10"

# Tasks API
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://tasks.googleapis.com/tasks/v1/users/@me/lists"
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `No auth.json found` | Run the Google OAuth login flow via the auth extension |
| `No Google access token found` | Check that auth.json contains `google-antigravity` tokens |
| `No refresh token available` | The OAuth flow was done without `access_type=offline`; re-authenticate |
| `Cannot refresh token — CLIENT_ID not set` | Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars |
| `Token refresh failed` | Check network connection; verify client ID/secret are correct |
| `jq: command not found` | Install jq: `brew install jq` (macOS) or `apt-get install jq` (Linux) |
| `curl: command not found` | Install curl: usually pre-installed; `brew install curl` if needed |

## Shared Library

All skills can source the shared library for common utilities:

```bash
source "$(dirname "$0")/../../common/lib.sh"
```

The library provides:
- **Token management**: `get_token`, `validate_token`
- **Error handling**: `check_error`, `check_http_status`
- **URL encoding**: `urlencode`
- **Date helpers**: `date_iso`, `date_iso_full`, `date_add_days`, `date_add_hours`, `date_start_of_day`, `date_end_of_day`
- **Pagination**: `paginate`
- **Output formatting**: `format_output`, `format_table`, `format_csv`, `format_tsv`, `format_markdown`, `format_compact`
- **Logging**: `log`, `log_err`, `log_warn`, `log_debug`, `log_verbose`
- **HTTP with retry**: `http_get`, `http_post`
- **Helpers**: `mime_to_name`, `format_size`, `parse_email_from`, `extract_email`, `extract_name`
- **Config**: `load_config`, `enable_verbose`, `enable_debug`, `show_info`
