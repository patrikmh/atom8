# docs-fetch

Fetch documents from Google Docs using the Docs API and Drive API via curl.

The agent reads OAuth tokens from `~/.pi/agent/auth.json` and handles token refresh automatically. Returns structured document content.

## Scripts

All scripts are in `scripts/` and use the shared `google-auth` library for token management.

### fetch_docs.sh
List all Google Docs documents.

```bash
# List all docs (json)
./scripts/fetch_docs.sh

# Table format
./scripts/fetch_docs.sh table

# Compact format
./scripts/fetch_docs.sh compact

# Limit to 10 docs
./scripts/fetch_docs.sh -n 10

# Filter by name
./scripts/fetch_docs.sh -q "Report"

# Show only shared docs
./scripts/fetch_docs.sh --shared

# Show only owned docs
./scripts/fetch_docs.sh --owned
```

### fetch_doc_content.sh
Read the content of a specific Google Doc.

```bash
# Read document content
./scripts/fetch_doc_content.sh DOCUMENT_ID

# Plain text output
./scripts/fetch_doc_content.sh DOCUMENT_ID --text

# JSON format (structured)
./scripts/fetch_doc_content.sh DOCUMENT_ID json

# Compact format
./scripts/fetch_doc_content.sh DOCUMENT_ID compact

# Extract only body text
./scripts/fetch_doc_content.sh DOCUMENT_ID --body

# Extract headings
./scripts/fetch_doc_content.sh DOCUMENT_ID --headings

# Extract links
./scripts/fetch_doc_content.sh DOCUMENT_ID --links

# Show word count
./scripts/fetch_doc_content.sh DOCUMENT_ID --word-count
```

### fetch_doc_info.sh
Get metadata about a document.

```bash
# Get document info
./scripts/fetch_doc_info.sh DOCUMENT_ID

# Compact format
./scripts/fetch_doc_info.sh DOCUMENT_ID compact
```

### fetch_doc_comments.sh
Get comments on a document.

```bash
# List comments
./scripts/fetch_doc_comments.sh DOCUMENT_ID

# Table format
./scripts/fetch_doc_comments.sh DOCUMENT_ID table

# Compact format
./scripts/fetch_doc_comments.sh DOCUMENT_ID compact
```

## Common Use Cases

### Find a document by name
```bash
./scripts/fetch_docs.sh -q "Report" table
```

### Read a document's content
```bash
./scripts/fetch_doc_content.sh DOCUMENT_ID --text
```

### Extract all headings
```bash
./scripts/fetch_doc_content.sh DOCUMENT_ID --headings
```

### Count words in a document
```bash
./scripts/fetch_doc_content.sh DOCUMENT_ID --word-count
```

### Export document to plain text
```bash
./scripts/fetch_doc_content.sh DOCUMENT_ID --text > document.txt
```

## Output Format

All scripts support: `json`, `table`, `csv`, `tsv`, `markdown`, `compact`.

## API Endpoint

- `https://docs.googleapis.com/v1/documents/{documentId}`
- `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.document'`

## Required OAuth Scope

`https://www.googleapis.com/auth/documents.readonly`

## Authentication

Handled by the shared `google-auth` library. See `google-auth/SKILL.md`.

## Troubleshooting

| Error | Solution |
|-------|----------|
| "documents.readonly" scope required | The token needs the Docs scope. Re-authenticate with `google-auth` including `documents.readonly`. |
| "Document not found" | The document ID may be invalid or you don't have access. |
| "Permission denied" | Ensure the document is shared with you or you own it. |
