---
name: drive-fetch
description: Comprehensive Google Drive data fetching via bash + curl + jq. Supports multiple output formats, pagination, file download, folder tree listing, trash, shared files, starred files, permissions, mimeType filtering, and file size formatting.
---

# Drive Fetch

## Output Format

This skill produces `file_list` type output. See `/skill:format-guide` for full format definitions.

Always wrap results in a JSON block with a `files` array:

```json
{
  "files": [
    {
      "id": "file1",
      "name": "Report.pdf",
      "mimeType": "application/pdf",
      "modifiedTime": "2026-06-01T10:00:00Z",
      "size": "123456"
    }
  ]
}
```

Comprehensive Google Drive data fetching via bash + curl + jq.

## Prerequisites

- `jq` and `curl` installed
- `google-auth` skill available for token management
- OAuth tokens stored in `~/.pi/agent/auth.json`

## Files

| File | Purpose |
|------|---------|
| `scripts/fetch_drive.sh` | Main helper — list files with many options |
| `scripts/fetch_folder.sh` | List files in a specific folder |
| `scripts/fetch_folder_tree.sh` | Recursively list folder tree |
| `scripts/fetch_file.sh` | Get file details by ID |
| `scripts/fetch_trash.sh` | List trashed files |
| `scripts/fetch_shared.sh` | List shared files |
| `scripts/fetch_starred.sh` | List starred files |
| `scripts/fetch_drive.py` | (legacy) Python helper — kept for reference |

## Quick Start

```bash
# Get a token
TOKEN=$(/Users/patrikandersson/telegram/atom8/.pi/skills/google-auth/scripts/get_token.sh)

# List 10 recent files
./scripts/fetch_drive.sh

# List as markdown table
./scripts/fetch_drive.sh -n 10 -f markdown

# Search files
./scripts/fetch_drive.sh -n 20 -q "report"

# List files in a folder
./scripts/fetch_folder.sh -i FOLDER_ID

# Get file details
./scripts/fetch_file.sh FILE_ID

# List trash
./scripts/fetch_trash.sh

# List shared files
./scripts/fetch_shared.sh
```

## Main Script: fetch_drive.sh

```bash
./scripts/fetch_drive.sh [OPTIONS]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-n COUNT` | Number of files | 10 |
| `-q QUERY` | Search query (Google Drive query syntax) | (none) |
| `-m MIMETYPE` | Filter by MIME type | (none) |
| `-f FORMAT` | Output format: json, table, csv, tsv, markdown, compact | json |
| `-p` | Paginate to fetch all results | false |
| `-v` | Verbose | false |
| `-h` | Show help | |

### Examples

#### A. List recent files (default JSON)
```bash
./scripts/fetch_drive.sh -n 10
```

#### B. Search files by name
```bash
./scripts/fetch_drive.sh -n 20 -q "name contains 'report'"
```

#### C. List only PDF files
```bash
./scripts/fetch_drive.sh -n 10 -m "application/pdf"
```

#### D. List only Google Docs
```bash
./scripts/fetch_drive.sh -n 10 -m "application/vnd.google-apps.document"
```

#### E. List folders
```bash
./scripts/fetch_drive.sh -n 20 -m "application/vnd.google-apps.folder"
```

#### F. Paginate all files
```bash
./scripts/fetch_drive.sh -p
```

#### G. Output as CSV
```bash
./scripts/fetch_drive.sh -n 100 -f csv > files.csv
```

#### H. Compact format
```bash
./scripts/fetch_drive.sh -n 10 -f compact
```

## Folder Listing

### fetch_folder.sh

```bash
./scripts/fetch_folder.sh [OPTIONS]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-i ID` | Folder ID | (required) |
| `-n COUNT` | Number of files | 10 |
| `-f FORMAT` | Output format | json |
| `-v` | Verbose | false |
| `-h` | Show help | |

```bash
# List files in a folder
./scripts/fetch_folder.sh -i abc123

# List 50 files
./scripts/fetch_folder.sh -i abc123 -n 50
```

## Folder Tree

### fetch_folder_tree.sh

```bash
./scripts/fetch_folder_tree.sh [OPTIONS]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-i ID` | Folder ID (default: root) | root |
| `-d DEPTH` | Max depth | 3 |
| `-f FORMAT` | Output format | json |
| `-v` | Verbose | false |
| `-h` | Show help | |

```bash
# List root tree
./scripts/fetch_folder_tree.sh

# List specific folder tree
./scripts/fetch_folder_tree.sh -i abc123

# Limit depth
./scripts/fetch_folder_tree.sh -i abc123 -d 2
```

## File Details

### fetch_file.sh

```bash
./scripts/fetch_file.sh FILE_ID [FORMAT]
```

```bash
# Get file details
./scripts/fetch_file.sh abc123

# As table
./scripts/fetch_file.sh abc123 table
```

## Trash

### fetch_trash.sh

```bash
./scripts/fetch_trash.sh [FORMAT]
```

```bash
# List trashed files
./scripts/fetch_trash.sh

# As table
./scripts/fetch_trash.sh table
```

## Shared Files

### fetch_shared.sh

```bash
./scripts/fetch_shared.sh [FORMAT]
```

```bash
# List files shared with me
./scripts/fetch_shared.sh

# As table
./scripts/fetch_shared.sh table
```

## Starred Files

### fetch_starred.sh

```bash
./scripts/fetch_starred.sh [FORMAT]
```

```bash
# List starred files
./scripts/fetch_starred.sh

# As table
./scripts/fetch_starred.sh table
```

## Raw curl Examples

### List files
```bash
TOKEN=$(./scripts/get_token.sh)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://www.googleapis.com/drive/v3/files?maxResults=10&orderBy=modifiedTime%20desc"
```

### Search files
```bash
TOKEN=$(./scripts/get_token.sh)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://www.googleapis.com/drive/v3/files?q=name%20contains%20%27report%27"
```

### Get file
```bash
TOKEN=$(./scripts/get_token.sh)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://www.googleapis.com/drive/v3/files/FILE_ID?fields=*"
```

### List files in folder
```bash
TOKEN=$(./scripts/get_token.sh)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://www.googleapis.com/drive/v3/files?q=%27FOLDER_ID%27%20in%20parents"
```

## MIME Type Reference

| Type | Description |
|------|-------------|
| `application/vnd.google-apps.document` | Google Doc |
| `application/vnd.google-apps.spreadsheet` | Google Sheet |
| `application/vnd.google-apps.presentation` | Google Slides |
| `application/vnd.google-apps.folder` | Folder |
| `application/vnd.google-apps.form` | Google Form |
| `application/vnd.google-apps.drawing` | Google Drawing |
| `application/pdf` | PDF |
| `text/plain` | Plain text |
| `image/jpeg` | JPEG image |
| `image/png` | PNG image |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `No files found` | Check your query syntax; try without `-q` first |
| `File not found` | Verify the file ID |
| `Access denied` | Check file permissions; try `fetch_shared.sh` |
| `Rate limit exceeded` | Wait and retry; use `-p` for pagination |
