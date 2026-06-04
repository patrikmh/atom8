# Notion Block Types — JSON Shapes

Every block has the shape:

```json
{
  "object": "block",
  "type": "<type>",
  "<type>": { ...type-specific payload... }
}
```

The "type-specific payload" is what changes. When reading, you'll see additional fields (`id`, `parent`, `created_time`, `has_children`, etc.); when writing, only the type-specific payload is required.

Most text-bearing blocks carry a `rich_text` array. The minimal rich-text element is `{"type": "text", "text": {"content": "..."}}`. For formatting (bold, italic, colored, linked), see the "Rich text" section at the end.

## Text blocks

### Paragraph

```json
{
  "object": "block", "type": "paragraph",
  "paragraph": {"rich_text": [{"text": {"content": "Body text here."}}]}
}
```

### Headings (h1, h2, h3)

```json
{"object": "block", "type": "heading_1", "heading_1": {"rich_text": [{"text": {"content": "Big heading"}}]}}
{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "Medium heading"}}]}}
{"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": "Small heading"}}]}}
```

Headings can be made toggleable by adding `"is_toggleable": true` to the heading payload.

### Bulleted and numbered lists

```json
{"object": "block", "type": "bulleted_list_item",
 "bulleted_list_item": {"rich_text": [{"text": {"content": "A bullet"}}]}}

{"object": "block", "type": "numbered_list_item",
 "numbered_list_item": {"rich_text": [{"text": {"content": "A numbered item"}}]}}
```

Each item is its own block. Notion renders consecutive items as a single list. To nest, include `"children": [...]` inside the item payload.

### To-do

```json
{"object": "block", "type": "to_do",
 "to_do": {"rich_text": [{"text": {"content": "Ship the thing"}}], "checked": false}}
```

### Toggle

A toggle is a paragraph that can be expanded. Children go inside the payload:

```json
{"object": "block", "type": "toggle",
 "toggle": {
   "rich_text": [{"text": {"content": "Click to expand"}}],
   "children": [
     {"object": "block", "type": "paragraph",
      "paragraph": {"rich_text": [{"text": {"content": "Hidden content"}}]}}
   ]
 }}
```

### Quote

```json
{"object": "block", "type": "quote",
 "quote": {"rich_text": [{"text": {"content": "The medium is the message."}}]}}
```

### Callout

```json
{"object": "block", "type": "callout",
 "callout": {
   "rich_text": [{"text": {"content": "Heads up: rate-limited."}}],
   "icon": {"type": "emoji", "emoji": "⚠️"},
   "color": "yellow_background"
 }}
```

### Code

```json
{"object": "block", "type": "code",
 "code": {
   "rich_text": [{"text": {"content": "echo hello"}}],
   "language": "bash"
 }}
```

Supported languages: `abap`, `arduino`, `bash`, `basic`, `c`, `clojure`, `coffeescript`, `c++`, `c#`, `css`, `dart`, `diff`, `docker`, `elixir`, `elm`, `erlang`, `flow`, `fortran`, `f#`, `gherkin`, `glsl`, `go`, `graphql`, `groovy`, `haskell`, `html`, `java`, `javascript`, `json`, `julia`, `kotlin`, `latex`, `less`, `lisp`, `livescript`, `lua`, `makefile`, `markdown`, `markup`, `matlab`, `mermaid`, `nix`, `objective-c`, `ocaml`, `pascal`, `perl`, `php`, `plain text`, `powershell`, `prolog`, `protobuf`, `python`, `r`, `reason`, `ruby`, `rust`, `sass`, `scala`, `scheme`, `scss`, `shell`, `sql`, `swift`, `typescript`, `vb.net`, `verilog`, `vhdl`, `visual basic`, `webassembly`, `xml`, `yaml`.

### Equation (block-level LaTeX)

```json
{"object": "block", "type": "equation", "equation": {"expression": "e^{i\\pi} + 1 = 0"}}
```

## Structural blocks

### Divider

```json
{"object": "block", "type": "divider", "divider": {}}
```

### Table of contents

```json
{"object": "block", "type": "table_of_contents", "table_of_contents": {"color": "default"}}
```

### Breadcrumb

```json
{"object": "block", "type": "breadcrumb", "breadcrumb": {}}
```

### Column list and columns

Columns must be nested inside a `column_list`. Each column needs a non-empty `children` array on creation:

```json
{"object": "block", "type": "column_list",
 "column_list": {
   "children": [
     {"object": "block", "type": "column", "column": {"children": [
       {"object": "block", "type": "paragraph",
        "paragraph": {"rich_text": [{"text": {"content": "Left"}}]}}
     ]}},
     {"object": "block", "type": "column", "column": {"children": [
       {"object": "block", "type": "paragraph",
        "paragraph": {"rich_text": [{"text": {"content": "Right"}}]}}
     ]}}
   ]
 }}
```

## Media and embeds

### Image

```json
{"object": "block", "type": "image",
 "image": {"type": "external", "external": {"url": "https://example.com/pic.png"}}}
```

For uploaded files, use `"type": "file_upload"` with `{"file_upload": {"id": "<upload-id>"}}`.

### Bookmark (URL preview card)

```json
{"object": "block", "type": "bookmark", "bookmark": {"url": "https://example.com"}}
```

### Embed

```json
{"object": "block", "type": "embed", "embed": {"url": "https://example.com"}}
```

### Video, audio, file, pdf

All follow the same shape as image — use `"type": "external"` or `"type": "file_upload"`:

```json
{"object": "block", "type": "video",
 "video": {"type": "external", "external": {"url": "https://youtube.com/watch?v=..."}}}
```

### Link preview (Notion-rendered)

```json
{"object": "block", "type": "link_preview", "link_preview": {"url": "https://github.com/..."}}
```

## Database-related blocks

### Child page (link to another page)

Read-only via API — these appear when reading blocks but you don't create them directly. To "link to a page" inline, use rich text with a link or mention.

### Child database

Same — read-only inline reference. To create a database, use `POST /v1/databases`.

### Table (in-page table, not a database)

A table block contains rows. Each row's cells are `rich_text` arrays.

```json
{"object": "block", "type": "table",
 "table": {
   "table_width": 2,
   "has_column_header": true,
   "has_row_header": false,
   "children": [
     {"object": "block", "type": "table_row",
      "table_row": {"cells": [[{"text": {"content": "Header A"}}], [{"text": {"content": "Header B"}}]]}},
     {"object": "block", "type": "table_row",
      "table_row": {"cells": [[{"text": {"content": "1"}}], [{"text": {"content": "2"}}]]}}
   ]
 }}
```

## Rich text

The `rich_text` arrays in every text-bearing block are themselves rich. Minimal:

```json
{"type": "text", "text": {"content": "Hello"}}
```

With formatting:

```json
{"type": "text",
 "text": {"content": "Hello", "link": {"url": "https://example.com"}},
 "annotations": {
   "bold": true, "italic": false, "strikethrough": false,
   "underline": false, "code": false, "color": "default"
 }}
```

Colors: `default`, `gray`, `brown`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `red`, and `<color>_background` variants.

### Mentions

Mentions appear in `rich_text` as `{"type": "mention", ...}`. They reference a user, page, database, date, or template:

```json
{"type": "mention", "mention": {"type": "user", "user": {"id": "user-uuid"}}}
{"type": "mention", "mention": {"type": "page", "page": {"id": "page-uuid"}}}
{"type": "mention", "mention": {"type": "date", "date": {"start": "2026-06-01"}}}
```

### Inline equation

```json
{"type": "equation", "equation": {"expression": "x^2 + y^2 = z^2"}}
```

## Blocks you can read but not create

Some block types are read-only via the API and only created through the Notion UI:

- `synced_block` — Notion's "synced content"
- `template` — page templates
- `unsupported` — the API's catch-all for block types it doesn't expose

Encountering an `unsupported` block when reading is normal; skip it.
