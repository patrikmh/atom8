---
name: gmail-fetch
description: Comprehensive Gmail data fetching via bash + curl + jq. Supports multiple output formats, pagination, thread support, label management, attachment detection, batch processing, full message extraction, and advanced Gmail query syntax.
---

# Gmail Fetch

Comprehensive Gmail data fetching using the Google Gmail API via bash + curl + jq.

## Prerequisites

- `jq` and `curl` installed
- `google-auth` skill available for token management
- OAuth tokens stored in `~/.pi/agent/auth.json`

## Files

| File | Purpose |
|------|---------|
| `scripts/fetch_gmail.sh` | Main helper — list emails with many options |
| `scripts/fetch_full_message.sh` | Fetch complete message body + headers |
| `scripts/fetch_threads.sh` | List conversation threads |
| `scripts/fetch_labels.sh` | List Gmail labels |
| `scripts/fetch_unread_count.sh` | Get unread count |
| `scripts/fetch_attachments.sh` | List messages with attachments |
| `scripts/fetch_gmail.py` | (legacy) Python helper — kept for reference |

## Quick Start

```bash
# Get a token
TOKEN=$(/Users/patrikandersson/telegram/atom8/.pi/skills/google-auth/scripts/get_token.sh)

# List 10 latest emails
./scripts/fetch_gmail.sh

# List 5 unread emails
./scripts/fetch_gmail.sh -n 5 -q "is:unread"

# List as markdown table
./scripts/fetch_gmail.sh -n 5 -f markdown

# Full message details
./scripts/fetch_full_message.sh MESSAGE_ID

# List threads
./scripts/fetch_threads.sh -n 10

# Get unread count
./scripts/fetch_unread_count.sh

# List labels
./scripts/fetch_labels.sh

# Messages with attachments
./scripts/fetch_attachments.sh -n 10
```

## Main Script: fetch_gmail.sh

```bash
./scripts/fetch_gmail.sh [OPTIONS]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-n COUNT` | Number of emails | 10 |
| `-q QUERY` | Gmail search query | (none) |
| `-f FORMAT` | Output format: json, table, csv, tsv, markdown, compact | json |
| `-p` | Paginate to fetch all results | false |
| `-v` | Verbose output | false |
| `-h` | Show help | |

### Output Formats

- **json** (default): Full JSON with all fields
- **table**: Pretty-printed table
- **csv**: Comma-separated values
- **tsv**: Tab-separated values
- **markdown**: Markdown table
- **compact**: One-line per email

### Examples

#### A. List latest emails (default JSON)
```bash
./scripts/fetch_gmail.sh -n 5
```

#### B. List unread emails as markdown table
```bash
./scripts/fetch_gmail.sh -n 10 -q "is:unread" -f markdown
```

#### C. List emails from a specific sender
```bash
./scripts/fetch_gmail.sh -n 20 -q "from:boss@example.com"
```

#### D. List emails with attachments (compact format)
```bash
./scripts/fetch_gmail.sh -n 10 -q "has:attachment" -f compact
```

#### E. Search by date range
```bash
./scripts/fetch_gmail.sh -n 50 -q "after:2026/01/01 before:2026/06/01"
```

#### F. Paginate through all results
```bash
./scripts/fetch_gmail.sh -q "is:unread" -p
```

#### G. List emails with labels
```bash
./scripts/fetch_gmail.sh -n 10 -q "label:work"
```

#### H. Verbose output for debugging
```bash
./scripts/fetch_gmail.sh -n 3 -v
```

#### I. Output as CSV for spreadsheet import
```bash
./scripts/fetch_gmail.sh -n 100 -f csv > emails.csv
```

#### J. Output as TSV for terminal
```bash
./scripts/fetch_gmail.sh -n 10 -f tsv
```

## Full Message Extraction

### fetch_full_message.sh

```bash
./scripts/fetch_full_message.sh MESSAGE_ID [FORMAT]
```

Fetch complete message body, headers, and metadata.

```bash
# Fetch full message
./scripts/fetch_full_message.sh 19e89a0885aec798

# As markdown
./scripts/fetch_full_message.sh 19e89a0885aec798 markdown
```

## Thread Support

### fetch_threads.sh

```bash
./scripts/fetch_threads.sh [OPTIONS]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-n COUNT` | Number of threads | 10 |
| `-q QUERY` | Gmail search query | (none) |
| `-f FORMAT` | Output format | json |
| `-v` | Verbose | false |

```bash
# List threads
./scripts/fetch_threads.sh -n 10

# Search threads
./scripts/fetch_threads.sh -q "from:alice@example.com"
```

## Label Management

### fetch_labels.sh

```bash
./scripts/fetch_labels.sh [FORMAT]
```

```bash
# List all labels
./scripts/fetch_labels.sh

# As table
./scripts/fetch_labels.sh table
```

## Unread Count

### fetch_unread_count.sh

```bash
./scripts/fetch_unread_count.sh
```

Returns the total number of unread emails.

## Attachment Detection

### fetch_attachments.sh

```bash
./scripts/fetch_attachments.sh [OPTIONS]
```

```bash
# List messages with attachments
./scripts/fetch_attachments.sh -n 10

# Specific sender with attachments
./scripts/fetch_attachments.sh -n 20 -q "from:boss@example.com"
```

## Raw curl Examples

### List messages with metadata
```bash
TOKEN=$(./scripts/get_token.sh)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=is:unread"
```

### Get full message
```bash
TOKEN=$(./scripts/get_token.sh)
MSG_ID="abc123"
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/${MSG_ID}?format=full"
```

### Get message headers only
```bash
TOKEN=$(./scripts/get_token.sh)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/${MSG_ID}?format=metadata"
```

### List threads
```bash
TOKEN=$(./scripts/get_token.sh)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=10"
```

### List labels
```bash
TOKEN=$(./scripts/get_token.sh)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://gmail.googleapis.com/gmail/v1/users/me/labels"
```

### Get unread count
```bash
TOKEN=$(./scripts/get_token.sh)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX"
```

## Gmail Query Syntax Reference

| Query | Meaning |
|-------|---------|
| `is:unread` | Unread emails |
| `is:read` | Read emails |
| `is:starred` | Starred emails |
| `is:important` | Important emails |
| `in:inbox` | Inbox emails |
| `in:sent` | Sent emails |
| `in:trash` | Trashed emails |
| `in:spam` | Spam emails |
| `has:attachment` | Emails with attachments |
| `has:attachment filename:pdf` | PDF attachments |
| `from:alice@example.com` | From specific sender |
| `to:bob@example.com` | To specific recipient |
| `cc:charlie@example.com` | CC specific recipient |
| `subject:meeting` | Subject contains "meeting" |
| `after:2026/01/01` | After date |
| `before:2026/06/01` | Before date |
| `older_than:7d` | Older than 7 days |
| `newer_than:1d` | Newer than 1 day |
| `larger:5M` | Larger than 5MB |
| `smaller:1K` | Smaller than 1KB |
| `label:work` | With label "work" |
| `category:promotions` | Promotions category |
| `category:social` | Social category |
| `category:updates` | Updates category |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `No messages found` | Check your query syntax; try without `-q` first |
| `Invalid format` | Use `-f json`, `-f table`, `-f csv`, `-f tsv`, `-f markdown`, or `-f compact` |
| `Token expired` | Run `get_token.sh` again — it auto-refreshes |
| `Rate limit exceeded` | Wait and retry; use `-p` for pagination |
| `Empty output` | The query may match no emails; try without `-q` |
