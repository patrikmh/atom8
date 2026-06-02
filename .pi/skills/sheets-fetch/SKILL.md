# sheets-fetch

Fetch data from Google Sheets using the Sheets API via curl.

The agent reads OAuth tokens from `~/.pi/agent/auth.json` and handles token refresh automatically. Returns structured spreadsheet data.

## Scripts

All scripts are in `scripts/` and use the shared `google-auth` library for token management.

### fetch_sheets.sh
List all Google Sheets spreadsheets.

```bash
# List all sheets (json)
./scripts/fetch_sheets.sh

# Table format
./scripts/fetch_sheets.sh table

# Compact format
./scripts/fetch_sheets.sh compact

# Limit to 10 sheets
./scripts/fetch_sheets.sh -n 10

# Filter by name
./scripts/fetch_sheets.sh -q "Budget"

# Show only shared sheets
./scripts/fetch_sheets.sh --shared

# Show only owned sheets
./scripts/fetch_sheets.sh --owned
```

### fetch_sheet_data.sh
Read cell values from a specific spreadsheet.

```bash
# Read a range (default Sheet1!A1:Z1000)
./scripts/fetch_sheet_data.sh SPREADSHEET_ID

# Read specific range
./scripts/fetch_sheet_data.sh SPREADSHEET_ID "Sheet1!A1:D10"

# Read entire sheet
./scripts/fetch_sheet_data.sh SPREADSHEET_ID --all

# Table format
./scripts/fetch_sheet_data.sh SPREADSHEET_ID "Sheet1!A1:D10" table

# CSV format
./scripts/fetch_sheet_data.sh SPREADSHEET_ID "Sheet1!A1:D10" csv

# TSV format
./scripts/fetch_sheet_data.sh SPREADSHEET_ID "Sheet1!A1:D10" tsv

# Include formulas instead of values
./scripts/fetch_sheet_data.sh SPREADSHEET_ID "Sheet1!A1:D10" --formulas

# Include formatting
./scripts/fetch_sheet_data.sh SPREADSHEET_ID "Sheet1!A1:D10" --formatting

# Transpose output
./scripts/fetch_sheet_data.sh SPREADSHEET_ID "Sheet1!A1:D10" --transpose
```

### fetch_sheet_info.sh
Get metadata about a spreadsheet.

```bash
# Get spreadsheet info
./scripts/fetch_sheet_info.sh SPREADSHEET_ID

# Compact format
./scripts/fetch_sheet_info.sh SPREADSHEET_ID compact

# List all sheets/tabs
./scripts/fetch_sheet_info.sh SPREADSHEET_ID --tabs

# Get sheet count
./scripts/fetch_sheet_info.sh SPREADSHEET_ID --count
```

### fetch_sheet_names.sh
List all sheet/tab names in a spreadsheet.

```bash
# List sheet names
./scripts/fetch_sheet_names.sh SPREADSHEET_ID

# With index numbers
./scripts/fetch_sheet_names.sh SPREADSHEET_ID --numbered
```

### fetch_sheet_dimensions.sh
Get row and column counts for each sheet.

```bash
# Get dimensions
./scripts/fetch_sheet_dimensions.sh SPREADSHEET_ID

# For a specific sheet
./scripts/fetch_sheet_dimensions.sh SPREADSHEET_ID "Sheet1"
```

## Common Use Cases

### Find a spreadsheet by name
```bash
./scripts/fetch_sheets.sh -q "Budget" table
```

### Read a specific range
```bash
./scripts/fetch_sheet_data.sh 1a2b3c4d5e "Sheet1!A1:D10" table
```

### Export a sheet to CSV
```bash
./scripts/fetch_sheet_data.sh SPREADSHEET_ID "Sheet1!A1:Z1000" csv > sheet.csv
```

### List all sheets in a spreadsheet
```bash
./scripts/fetch_sheet_names.sh SPREADSHEET_ID
```

### Get sheet dimensions
```bash
./scripts/fetch_sheet_dimensions.sh SPREADSHEET_ID
```

## Output Format

All scripts support: `json`, `table`, `csv`, `tsv`, `markdown`, `compact`.

## API Endpoint

- `https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}`
- `https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}`

## Required OAuth Scope

`https://www.googleapis.com/auth/spreadsheets.readonly`

## Authentication

Handled by the shared `google-auth` library. See `google-auth/SKILL.md`.

## Troubleshooting

| Error | Solution |
|-------|----------|
| "sheets.readonly" scope required | The token needs the Sheets scope. Re-authenticate with `google-auth` including `sheets.readonly`. |
| "Unable to parse range" | Check the range format. Use `SheetName!A1:D10` or `A1:D10`. |
| "Spreadsheet not found" | The spreadsheet ID may be invalid or you don't have access. |
| "Permission denied" | Ensure the spreadsheet is shared with you or you own it. |
