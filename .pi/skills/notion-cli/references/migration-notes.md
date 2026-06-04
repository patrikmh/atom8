# Migration Notes: 2022-06-28 → 2025-09-03

Notion released API version `2025-09-03` introducing **multi-source databases**. This is a breaking change. If you have scripts pinned to the older `2022-06-28` header, they'll continue working for now, but new features (especially multi-data-source databases) require the new version.

## The core conceptual shift

Before: a database had exactly one implicit "data source". The database ID was the queryable thing.

After: a **database** is a container that holds one or more **data sources**. Each data source has its own schema (set of properties) and holds the rows (pages). The database ID is no longer queryable on its own — you query a data source.

For databases that have always had just one data source (the common case), the migration is mostly mechanical: replace `database_id` with `data_source_id` in URLs and request bodies.

## Endpoint changes

| Old (2022-06-28)                       | New (2025-09-03)                              |
|----------------------------------------|-----------------------------------------------|
| `POST /v1/databases/{id}/query`        | `POST /v1/data_sources/{id}/query`            |
| `GET  /v1/databases/{id}` (returned schema directly) | `GET /v1/databases/{id}` (returns `data_sources[]`); `GET /v1/data_sources/{id}` (returns schema) |
| `PATCH /v1/databases/{id}` (schema edits) | `PATCH /v1/data_sources/{id}` (schema edits) |
| `POST /v1/databases` (created a database with schema) | `POST /v1/databases` (still works but the schema is now on the data source created with it) |

The `POST /v1/pages` and `PATCH /v1/pages/{id}` endpoints didn't move, but the parent reference changed.

## Parent reference changes

When creating a page in a database, the `parent` object used to be:

```json
{"database_id": "..."}
```

Now it should be:

```json
{"type": "data_source_id", "data_source_id": "..."}
```

The old form is accepted during the transition for backward compatibility, but the API resolves it to the first data source on the database — which may not be what you want if the database has multiple. Be explicit.

## Search filter values

The `/v1/search` filter changed:

| Old                                    | New                                  |
|----------------------------------------|--------------------------------------|
| `{"property": "object", "value": "page"}` | `{"property": "object", "value": "page"}` (same) |
| `{"property": "object", "value": "database"}` | `{"property": "object", "value": "data_source"}` |

Sending `"database"` on the new version returns no results — silent failure.

## Migration recipe

If you have a working script on 2022-06-28 and want to move it to 2025-09-03:

1. **Bump the header** in one place. If it's hardcoded across many files, find-and-replace `Notion-Version: 2022-06-28` → `Notion-Version: 2025-09-03`.

2. **Add a discovery step** anywhere you have a `DATABASE_ID`:

   ```bash
   DATA_SOURCE_ID=$(curl -s "https://api.notion.com/v1/databases/$DATABASE_ID" \
     -H "Authorization: Bearer $NOTION_TOKEN" \
     -H "Notion-Version: 2025-09-03" \
     | jq -r '.data_sources[0].id')
   ```

   Cache this — it's stable for the lifetime of the database. Re-fetch only if a script error suggests the ID changed.

3. **Replace URL paths**:
   - `/v1/databases/$DATABASE_ID/query` → `/v1/data_sources/$DATA_SOURCE_ID/query`
   - `PATCH /v1/databases/$DATABASE_ID` (for schema edits) → `PATCH /v1/data_sources/$DATA_SOURCE_ID`

4. **Update page-creation parents** from `{"database_id": "..."}` to `{"type": "data_source_id", "data_source_id": "..."}`.

5. **Update search filters** from `"value": "database"` to `"value": "data_source"`.

6. **Smoke test against a database with multiple data sources** if your workspace uses any. The common-case single-data-source flow is well-covered by the old defaults, but multi-source behavior only shows up when there are actually multiple.

## Staying on 2022-06-28

You can keep using the old version for now. Notion hasn't announced a sunset date as of writing. The risks if you don't migrate:

- New features (multi-source databases, new block types) are inaccessible.
- If a user converts a database to multi-source in the Notion UI, old API calls scoped to the database will start failing or returning unexpected results.
- The deprecated open-source `notion-mcp-server` package pinned to the old version is no longer actively maintained.

For brand-new code, just start on 2025-09-03.
