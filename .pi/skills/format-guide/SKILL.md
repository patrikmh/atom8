---
name: format-guide
description: Output format guide for pi agent responses. Defines 15 typed output formats with examples so other skills can produce consistent, parseable output.
---

# Format Guide

Output format guide for pi agent responses. Defines 15 typed output formats with examples so other skills can produce consistent, parseable output.

## How to use

When producing output, declare the type at the top:

```
OUTPUT_TYPE: <type_name>
```

Then follow the format rules for that type. The backend parser will extract structured data based on the type.

## Output Types

### 1. json
Pure JSON — no markdown, no commentary.

```json
{"emails": [{"id": "123", "subject": "Hello"}]}
```

### 2. json_block
JSON inside a markdown code block.

```markdown
Here are the results:

```json
{"emails": [{"id": "123", "subject": "Hello"}]}
```
```

### 3. markdown_table
Markdown table with header row and separator.

```markdown
| ID | Subject | From | Date |
|----|---------|------|------|
| 123 | Hello | Alice | 2026-06-01 |
| 124 | Meeting | Bob | 2026-06-02 |
```

### 4. bullet_list
Simple bullet list.

```markdown
- Item one
- Item two
- Item three
```

### 5. numbered_list
Numbered list.

```markdown
1. First item
2. Second item
3. Third item
```

### 6. plain_text
Plain text — no structure, just content.

```
This is a simple text response with no formatting.
```

### 7. email_list
Gmail-specific email list. Must include an `emails` array.

```json
{
  "emails": [
    {
      "id": "123",
      "subject": "Hello",
      "from_email": "alice@example.com",
      "from_name": "Alice",
      "date": "2026-06-01",
      "preview": "Hello, how are you?",
      "unread": true
    }
  ]
}
```

### 8. event_list
Calendar events. Must include an `events` array.

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

### 9. task_list
Tasks. Must include a `tasks` array.

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

### 10. file_list
Drive files. Must include a `files` array.

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

### 11. mixed_json
JSON with commentary text. Extract the JSON block, keep the rest as commentary.

```markdown
Here is your data:

```json
{"emails": [{"id": "123", "subject": "Hello"}]}
```

This is additional commentary about the emails.
```

### 12. sectioned_markdown
Markdown with sections separated by headers.

```markdown
## Emails

Two new emails arrived.

## Calendar

No events today.

## Tasks

Three tasks pending.
```

### 13. csv_inline
CSV format inline.

```csv
id,subject,from
123,Hello,Alice
124,Meeting,Bob
```

### 14. key_value
Key-value pairs, one per line.

```
Name: Alice
Email: alice@example.com
Status: Active
Count: 42
```

### 15. rich_summary
Summary with metadata and structured content.

```json
{
  "summary": {
    "title": "Weekly Report",
    "text": "This week we shipped 3 features.",
    "highlights": [
      "Feature A released",
      "Feature B in beta"
    ],
    "metrics": {
      "commits": 42,
      "prs": 5
    }
  }
}
```

## Type Detection Rules

If you do not declare a type, the parser auto-detects:

1. JSON block (` ```json`) → json_block
2. Pure JSON (starts with `{` or `[`) → json
3. CSV (first two lines have commas) → csv_inline
4. Markdown table (`| --- |`) → markdown_table
5. Key-value pairs (`Key: value`) → key_value
6. Numbered list (`1. item`) → numbered_list
7. Bullet list (`- item` or `* item`) → bullet_list
8. Markdown headers (`## Section`) → sectioned_markdown
9. Everything else → plain_text

## Recommended Type by Skill

| Skill | Recommended Type | Notes |
|-------|-------------------|-------|
| gmail-fetch | email_list | Include `emails` array |
| calendar-fetch | event_list | Include `events` array |
| tasks-fetch | task_list | Include `tasks` array |
| drive-fetch | file_list | Include `files` array |
| research | rich_summary | Include summary + sources |
| chat | plain_text | Free-form response |

## Best Practices

1. Always declare the type when possible: `OUTPUT_TYPE: email_list`
2. For structured data, wrap in a JSON block with the correct array name
3. Keep commentary minimal when using structured types
4. Use `mixed_json` when you need both structured data and natural language explanation
5. Use `plain_text` only for chat-like responses
