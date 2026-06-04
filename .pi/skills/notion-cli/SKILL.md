---
name: notion-cli
description: Communicate with a Notion workspace from the command line using curl and the Notion REST API. Use this skill whenever the user wants to read, search, create, update, or append to Notion pages and databases from a terminal, shell script, agent loop, CI job, or any environment without an SDK — including phrasings like "fetch this Notion page", "append to my Notion doc", "query my Notion database", "create a Notion page from this", "sync Notion with X", or "search my Notion workspace". Prefer this over MCP for headless or unattended use, for token-efficient agent workflows (Pi-style "bash + README" agents), and for any case where a thin scripted wrapper is cleaner than a full integration.
---

# Notion via CLI

This skill teaches an agent to talk to Notion using `curl` and `jq` against the REST API. No SDK, no MCP server, no OAuth dance — just a bearer token and HTTP.

When to reach for this skill instead of Notion MCP:

- The environment is headless or unattended (CI, cron, server-side agent).
- The agent is token-budget-conscious and doesn't want MCP tool schemas loaded into context on every session.
- The task is narrow (one or two endpoints) and a 5-line `curl` is cleaner than wiring up MCP.
- The agent has `bash` but no MCP client (e.g. Pi).

## Setup (one-time)

The user needs an **internal integration token** and must **share the relevant pages/databases with the integration**. These two steps are the most common cause of "I get 404 on a page that obviously exists" — bring them up before debugging anything else.

1. Create an integration at `https://www.notion.so/profile/integrations` → "New integration" → internal → copy the secret (starts with `ntn_` or `secret_`).
2. In Notion, open each page or database the integration needs to touch → `•••` menu → "Connections" → add the integration. Page access is inherited by children, so sharing a top-level page is usually enough.
3. Export the token:

   ```bash
   export NOTION_TOKEN="ntn_..."
   ```

   For persistent use, put it in `~/.notionrc` or a `.env` file the agent sources. Never commit it.

## The three headers, always

Every request sends these. Memorize them:

```bash
-H "Authorization: Bearer $NOTION_TOKEN"
-H "Notion-Version: 2025-09-03"
-H "Content-Type: application/json"
```

The `Notion-Version` header is **required** — omitting it makes requests fail or behave unexpectedly. `2025-09-03` is the current stable version and is what this skill targets. If the user explicitly asks for an older version (e.g. they have legacy scripts on `2022-06-28`), match what they ask for, but flag that the database/data-source endpoints differ — see `references/migration-notes.md`.

## The data model (in 60 seconds)

As of API version 2025-09-03, the model has three levels:

- **Database** — a container. Has an ID. Holds one or more data sources.
- **Data source** — a table with a schema. Has an ID. Holds pages. This is what you query.
- **Page** — a row in a data source, or a standalone document. Has properties + blocks.

In older versions a database had exactly one implicit data source, so people used "database" and "data source" interchangeably. As of 2025-09-03 you query a data source, not a database. To get a database's data source IDs, `GET /v1/databases/{id}` and read `data_sources[].id`.

A page has two parts:

- **Properties** — structured fields (title, status, date, relations, etc.). Schema lives on the parent data source.
- **Blocks** — the body content (paragraphs, headings, bullets, code, etc.). Fetched separately via `/v1/blocks/{page_id}/children`.

## Workflow: start with discovery

When the user asks the agent to do something with Notion, the agent rarely knows IDs upfront. The standard flow is:

1. **Find what you're working with.** Use `POST /v1/search` to locate the page or data source by name. The response gives you the ID.
2. **Inspect schema before every Notion task — do not trust cached schema.** Fetch `GET /v1/data_sources/{id}` fresh at the start of any new Notion task in a session, and fetch it again if a query fails with a `property not found` / `validation_error` referring to a property. Property names, types, and even existence change between turns; assume the schema you saw last turn is stale.
3. **Do the actual work.** Read, append, create, update.

Always start narrow. Don't list a whole workspace if a search will do.

### Hard rules for interacting with the user

These three rules apply to every Notion task. They exist because each one was learned the hard way:

1. **Never trust a cached schema.** Refetch `GET /v1/data_sources/{id}` at the start of each session, and again on any `property not found` or `validation_error` mentioning a property. Do not rely on schema you remember from earlier turns.
2. **Quote property names verbatim.** When the user names a property, treat their spelling and capitalization as authoritative. Wrap any name containing spaces or special characters in double quotes in JSON bodies (e.g. `"Name Length"`, `"Linkedin Mail"`, `"Inferred email"`). Do not silently rename, normalize, or "correct" the user's spelling — if it doesn't match the schema, refetch and tell the user, don't guess.
3. **Translate natural-language filters into explicit boolean filters.** When the user describes a filter in everyday language ("emailed", "not linkedin'd", "done", "open"), and the underlying property is a checkbox, build the filter as explicit `{"checkbox": {"equals": true}}` or `{"checkbox": {"equals": false}}`. Do not substitute `is_not_empty` / `is_empty` or other "creative" interpretations — a checkbox is never empty, only true or false. For non-checkbox properties, ask the user which concrete predicate they mean before guessing.

## The five things people actually want

These five recipes cover ~90% of CLI Notion work. Read these inline; for anything else go to `references/endpoints.md`.

### 1. Search the workspace

Find pages or data sources by title. Filter narrows the result type.

```bash
curl -sX POST "https://api.notion.com/v1/search" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "onboarding",
    "filter": {"property": "object", "value": "page"},
    "page_size": 10
  }' | jq '.results[] | {id, title: (.properties.title.title[0].plain_text // .properties.Name.title[0].plain_text // "untitled"), url}'
```

For data sources, use `"value": "data_source"`. Note: in 2025-09-03 the filter takes `"page"` or `"data_source"` — `"database"` is no longer valid here.

### 2. Read a page's content as Markdown-ish text

A page is properties + blocks. To get the body, fetch the block children:

```bash
PAGE_ID="..."
curl -s "https://api.notion.com/v1/blocks/$PAGE_ID/children?page_size=100" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  | jq -r '.results[] | (.[.type].rich_text // [])[].plain_text // empty'
```

That `jq` filter extracts plain text from every block that has rich text (paragraphs, headings, bullets, quotes, etc.). For a more faithful rendering (preserving headings/bullets/code), use `scripts/page_to_markdown.sh`.

If `has_more` is `true` in the response, paginate with `start_cursor`. See pagination notes in `references/endpoints.md`.

### 3. Append content to a page

Add blocks to the end of a page. Blocks are typed JSON objects; the most common ones:

```bash
PAGE_ID="..."
curl -sX PATCH "https://api.notion.com/v1/blocks/$PAGE_ID/children" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d '{
    "children": [
      {"object": "block", "type": "heading_2",
       "heading_2": {"rich_text": [{"type": "text", "text": {"content": "Notes from today"}}]}},
      {"object": "block", "type": "paragraph",
       "paragraph": {"rich_text": [{"type": "text", "text": {"content": "Meeting ran long. Decided to ship Friday."}}]}},
      {"object": "block", "type": "bulleted_list_item",
       "bulleted_list_item": {"rich_text": [{"type": "text", "text": {"content": "Owner: Patrik"}}]}}
    ]
  }'
```

For richer markdown-to-blocks conversion (handles headings, lists, code fences, links), use `scripts/append_markdown.sh`.

### 4. Query a database

Filter and sort rows. Note this hits `/v1/data_sources/{id}/query`, **not** `/v1/databases/{id}/query` — that's the 2025-09-03 change that catches people.

```bash
DATA_SOURCE_ID="..."
curl -sX POST "https://api.notion.com/v1/data_sources/$DATA_SOURCE_ID/query" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {"property": "Status", "select": {"equals": "In Progress"}},
    "sorts": [{"property": "Due", "direction": "ascending"}],
    "page_size": 25
  }' | jq '.results[] | {id, name: .properties.Name.title[0].plain_text, status: .properties.Status.select.name}'
```

If the user gives you a database ID instead of a data source ID, resolve it first:

```bash
DATABASE_ID="..."
DATA_SOURCE_ID=$(curl -s "https://api.notion.com/v1/databases/$DATABASE_ID" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  | jq -r '.data_sources[0].id')
```

Most databases have exactly one data source. If `data_sources` has more than one, ask the user which one.

### 5. Create a new page in a database

Parent must be `data_source_id` (not `database_id`) in 2025-09-03. Properties must match the schema of the parent data source.

```bash
DATA_SOURCE_ID="..."
curl -sX POST "https://api.notion.com/v1/pages" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d '{
    "parent": {"type": "data_source_id", "data_source_id": "'"$DATA_SOURCE_ID"'"},
    "properties": {
      "Name":   {"title":  [{"text": {"content": "Q3 retro notes"}}]},
      "Status": {"select": {"name": "Draft"}},
      "Due":    {"date":   {"start": "2026-06-01"}}
    }
  }'
```

The property names ("Name", "Status", "Due") and their types must match the data source's schema exactly. If unsure, fetch the data source first: `GET /v1/data_sources/{id}` and inspect `.properties`.

To put body content in the new page, include a `"children": [...]` array of blocks alongside `properties`.

## Property shapes — the part that bites

Notion's property JSON shapes are not obvious. The top-level key is the property's display name; the inner key is the property's *type*. A title property looks like `{"title": [...]}`, a select looks like `{"select": {"name": "..."}}`, a date looks like `{"date": {"start": "YYYY-MM-DD"}}`. Get these wrong and you'll see `400 validation_error`.

When writing properties, fetch the data source schema first to see exactly what types are in play. The cheat sheet:

| Type        | Write shape                                                                 |
|-------------|-----------------------------------------------------------------------------|
| title       | `{"title": [{"text": {"content": "..."}}]}`                                 |
| rich_text   | `{"rich_text": [{"text": {"content": "..."}}]}`                             |
| number      | `{"number": 42}`                                                            |
| select      | `{"select": {"name": "Option name"}}`                                       |
| multi_select| `{"multi_select": [{"name": "A"}, {"name": "B"}]}`                          |
| status      | `{"status": {"name": "In Progress"}}`                                       |
| date        | `{"date": {"start": "2026-05-12", "end": null}}`                            |
| checkbox    | `{"checkbox": true}`                                                        |
| url         | `{"url": "https://..."}`                                                    |
| email       | `{"email": "..."}`                                                          |
| people      | `{"people": [{"id": "user-uuid"}]}`                                         |
| relation    | `{"relation": [{"id": "page-uuid"}]}`                                       |

For block shapes (paragraph, heading, bulleted_list_item, code, etc.), see `references/block-types.md`.

## Pagination

Any list-returning endpoint (`/search`, data source query, block children) returns at most `page_size` items (default 100, max 100). If `has_more: true`, pass `start_cursor: <next_cursor>` on the next call. There's a helper at `scripts/paginate.sh` that follows cursors and concatenates results.

## Rate limits and retries

Notion rate-limits at roughly **3 requests/second** averaged. Bursts above that get HTTP 429 with a `Retry-After` header. For agent loops doing many operations, respect `Retry-After` and back off. The `scripts/notion_call.sh` wrapper handles this automatically and is a good default to use for any non-trivial workflow.

## Errors worth recognizing

| Status | Meaning                                                                 |
|--------|-------------------------------------------------------------------------|
| 400    | Validation — usually wrong property shape or wrong parent type          |
| 401    | Token is bad, expired, or missing                                       |
| 403    | Integration lacks the capability (e.g. read-only token doing a write)   |
| 404    | The integration is not connected to that page/database — share it first |
| 409    | Conflict — usually a concurrent edit                                    |
| 429    | Rate limit — back off using `Retry-After`                               |

The most common confusion is **404 on a page that obviously exists**. That is almost always because the integration isn't connected to the page. Tell the user to share it via the page's "Connections" menu.

## When to graduate beyond this skill

This is a thin skill. It deliberately doesn't try to wrap every endpoint. If the user's task involves:

- **Many endpoints across one workflow** — write a small CLI tool (Python or Node) that wraps the API and call that from bash. The pattern works the same; you just hide the curl boilerplate.
- **OAuth-based multi-user access** — switch to the hosted Notion MCP server (`https://mcp.notion.com/mcp`) or the official SDK. Bearer-token CLI is for single-workspace, internal-integration cases.
- **Real-time sync** — set up Notion webhooks. The CLI is for poll/pull/push, not for receiving events.

## Reference files

When you need more depth than this SKILL.md covers, read these:

- `references/endpoints.md` — Full endpoint table with example requests, including page update, block update/delete, user lookup, comments, and file upload. Read this for any endpoint not listed in the five recipes above.
- `references/block-types.md` — JSON shapes for every block type (paragraph, headings, lists, todo, toggle, code, quote, callout, divider, image, bookmark, equation, table). Read this when constructing block payloads beyond the basic three shown inline.
- `references/migration-notes.md` — Differences between API versions 2022-06-28 and 2025-09-03. Read this only if the user is on an older version or migrating.

## Helper scripts

These live in `scripts/` and are intended to be sourced or run directly. Read the script's own comments for usage:

- `scripts/notion_call.sh` — Wraps `curl` with the three headers, retries on 429, exits non-zero on 4xx/5xx with a readable error. Use this anywhere you would otherwise write a raw `curl`.
- `scripts/page_to_markdown.sh` — Fetches a page's blocks and prints reasonable Markdown.
- `scripts/append_markdown.sh` — Converts a Markdown file or stdin into Notion blocks and appends them to a page.
- `scripts/paginate.sh` — Generic cursor-following pagination for any list endpoint.

## Empty State

When searching or querying returns no results, the Notion API returns `{"results": []}` or `{"pages": []}`. When outputting structured data for a widget, emit only the clean JSON with the empty array — no extra commentary or metadata.

```json
{"pages": []}
```
