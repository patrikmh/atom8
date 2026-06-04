# Notion API Endpoints Reference

Full reference for the Notion REST API at version `2025-09-03`. All endpoints assume the three standard headers:

```
Authorization: Bearer $NOTION_TOKEN
Notion-Version: 2025-09-03
Content-Type: application/json
```

Base URL: `https://api.notion.com`

## Pages

| Method | Path                            | Purpose                                  |
|--------|---------------------------------|------------------------------------------|
| GET    | `/v1/pages/{id}`                | Retrieve a page's properties (not body)  |
| POST   | `/v1/pages`                     | Create a page (in a data source or under another page) |
| PATCH  | `/v1/pages/{id}`                | Update a page's properties or archive it |
| GET    | `/v1/pages/{id}/properties/{property_id}` | Retrieve a single property (use for long rollups/relations) |

### Create a page under another page (not a database)

When the parent is a page rather than a data source:

```bash
curl -sX POST "https://api.notion.com/v1/pages" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d '{
    "parent": {"type": "page_id", "page_id": "PARENT_PAGE_ID"},
    "properties": {
      "title": {"title": [{"text": {"content": "New page"}}]}
    },
    "children": [
      {"object": "block", "type": "paragraph",
       "paragraph": {"rich_text": [{"text": {"content": "Body content."}}]}}
    ]
  }'
```

Note: when the parent is a page (not a data source), the only property is `title`.

### Update page properties

```bash
curl -sX PATCH "https://api.notion.com/v1/pages/$PAGE_ID" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d '{
    "properties": {
      "Status": {"status": {"name": "Done"}}
    }
  }'
```

### Archive (soft delete) a page

```bash
curl -sX PATCH "https://api.notion.com/v1/pages/$PAGE_ID" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d '{"archived": true}'
```

Pass `"archived": false` to restore.

## Blocks

| Method | Path                                | Purpose                                |
|--------|-------------------------------------|----------------------------------------|
| GET    | `/v1/blocks/{id}`                   | Retrieve a single block                |
| GET    | `/v1/blocks/{id}/children`          | List child blocks (page body content)  |
| PATCH  | `/v1/blocks/{id}/children`          | Append child blocks                    |
| PATCH  | `/v1/blocks/{id}`                   | Update a block's content               |
| DELETE | `/v1/blocks/{id}`                   | Delete a block                         |

### List a page's blocks (with pagination)

```bash
curl -s "https://api.notion.com/v1/blocks/$PAGE_ID/children?page_size=100" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03"
```

If `has_more` is true, follow the cursor:

```bash
curl -s "https://api.notion.com/v1/blocks/$PAGE_ID/children?page_size=100&start_cursor=$NEXT" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03"
```

Blocks can themselves have children (toggle, callout, columns, nested lists). If a block's `has_children` is true, recursively fetch `/v1/blocks/{that_block_id}/children`.

### Update a block

Patch only the type-specific field. To change a paragraph's text:

```bash
curl -sX PATCH "https://api.notion.com/v1/blocks/$BLOCK_ID" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d '{
    "paragraph": {
      "rich_text": [{"type": "text", "text": {"content": "Updated text."}}]
    }
  }'
```

### Delete a block

```bash
curl -sX DELETE "https://api.notion.com/v1/blocks/$BLOCK_ID" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03"
```

This archives the block (it disappears from the page but can be restored from Notion's trash for 30 days).

## Databases and data sources

| Method | Path                                          | Purpose                                       |
|--------|-----------------------------------------------|-----------------------------------------------|
| GET    | `/v1/databases/{id}`                          | Retrieve a database (container with data source list) |
| POST   | `/v1/databases`                               | Create a database                             |
| PATCH  | `/v1/databases/{id}`                          | Update a database (title, description, archive) |
| GET    | `/v1/data_sources/{id}`                       | Retrieve a data source (schema lives here)    |
| POST   | `/v1/data_sources`                            | Create an additional data source under a database |
| PATCH  | `/v1/data_sources/{id}`                       | Update a data source's schema or title        |
| POST   | `/v1/data_sources/{id}/query`                 | Query rows (returns pages)                    |
| GET    | `/v1/data_sources/{id}/templates`             | List templates available in a data source     |

### Get the data source IDs for a database

```bash
curl -s "https://api.notion.com/v1/databases/$DATABASE_ID" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  | jq '.data_sources'
```

### Query a data source with a compound filter

```bash
curl -sX POST "https://api.notion.com/v1/data_sources/$DATA_SOURCE_ID/query" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "and": [
        {"property": "Status", "select": {"equals": "In Progress"}},
        {"property": "Due",    "date":   {"on_or_before": "2026-06-01"}}
      ]
    },
    "sorts": [{"property": "Due", "direction": "ascending"}]
  }'
```

Filter operators by type:
- `title`, `rich_text`, `url`, `email`, `phone_number`: `equals`, `does_not_equal`, `contains`, `does_not_contain`, `starts_with`, `ends_with`, `is_empty`, `is_not_empty`
- `number`: `equals`, `does_not_equal`, `greater_than`, `less_than`, `greater_than_or_equal_to`, `less_than_or_equal_to`, `is_empty`, `is_not_empty`
- `select`, `status`: `equals`, `does_not_equal`, `is_empty`, `is_not_empty`
- `multi_select`: `contains`, `does_not_contain`, `is_empty`, `is_not_empty`
- `date`: `equals`, `before`, `after`, `on_or_before`, `on_or_after`, `past_week`, `past_month`, `past_year`, `next_week`, `next_month`, `next_year`, `is_empty`, `is_not_empty`
- `checkbox`: `equals`, `does_not_equal`
- `people`: `contains`, `does_not_contain`, `is_empty`, `is_not_empty`
- `relation`: `contains`, `does_not_contain`, `is_empty`, `is_not_empty`

### Update a data source's schema (add a property)

```bash
curl -sX PATCH "https://api.notion.com/v1/data_sources/$DATA_SOURCE_ID" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d '{
    "properties": {
      "Priority": {
        "select": {
          "options": [
            {"name": "High",   "color": "red"},
            {"name": "Medium", "color": "yellow"},
            {"name": "Low",    "color": "blue"}
          ]
        }
      }
    }
  }'
```

To remove a property, set it to `null`. To rename, send `{"<old name>": {"name": "<new name>"}}`.

## Search

| Method | Path        | Purpose                                          |
|--------|-------------|--------------------------------------------------|
| POST   | `/v1/search`| Search pages and data sources by title           |

Important constraints:
- Only searches titles, not body content.
- Only returns items shared with the integration.
- The `filter.value` must be `"page"` or `"data_source"` (not `"database"`) on `2025-09-03`.
- An empty `query` returns everything the integration can see — useful for discovery.

```bash
curl -sX POST "https://api.notion.com/v1/search" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "roadmap",
    "filter": {"property": "object", "value": "data_source"},
    "sort": {"direction": "descending", "timestamp": "last_edited_time"},
    "page_size": 20
  }'
```

## Comments

| Method | Path           | Purpose                                              |
|--------|----------------|------------------------------------------------------|
| GET    | `/v1/comments` | List comments on a page or block (use `block_id` query param) |
| POST   | `/v1/comments` | Create a comment on a page or thread                 |

Notion's API exposes **page comments**, not in-line comments. This is a long-standing limitation — in-line comments only show up in the Notion UI.

```bash
curl -sX POST "https://api.notion.com/v1/comments" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d '{
    "parent": {"page_id": "'"$PAGE_ID"'"},
    "rich_text": [{"text": {"content": "Looks good — shipping."}}]
  }'
```

## Users

| Method | Path                  | Purpose                                |
|--------|-----------------------|----------------------------------------|
| GET    | `/v1/users/{id}`      | Retrieve a user                        |
| GET    | `/v1/users`           | List all users in the workspace        |
| GET    | `/v1/users/me`        | Bot user info (the integration itself) |

## File upload

| Method | Path                       | Purpose                          |
|--------|----------------------------|----------------------------------|
| POST   | `/v1/file_uploads`         | Create a file upload session     |
| POST   | `/v1/file_uploads/{id}/send` | Upload file bytes              |
| GET    | `/v1/file_uploads/{id}`    | Check status                     |

Three-step pattern: create upload session → POST the bytes → reference the returned file ID in a block or property.

## Pagination

Any endpoint that returns lists supports cursor-based pagination:

- Request: `?page_size=N&start_cursor=<cursor>` (or in body for POST endpoints)
- Response: `{"results": [...], "has_more": true, "next_cursor": "..."}`
- `page_size` max is 100. Default is 10 for `/v1/search`, 100 for most others.

Loop until `has_more` is false. See `scripts/paginate.sh` for a generic implementation.

## Rate limits

Roughly 3 requests/second averaged. Bursts allowed but sustained over-rate yields `429`:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 5
```

Respect the header. `scripts/notion_call.sh` does this automatically.
