# contacts-fetch

Fetch contacts from Google Contacts using the People API via curl.

The agent reads OAuth tokens from `~/.pi/agent/auth.json` and handles token refresh automatically. Returns structured contact data.

## Scripts

All scripts are in `scripts/` and use the shared `google-auth` library for token management.

### fetch_contacts.sh
List all contacts with names, emails, and phones.

```bash
# List all contacts (json)
./scripts/fetch_contacts.sh

# Table format
./scripts/fetch_contacts.sh table

# Compact format
./scripts/fetch_contacts.sh compact

# Limit to 10 contacts
./scripts/fetch_contacts.sh -n 10

# Filter by search query
./scripts/fetch_contacts.sh -q "John"

# Show only contacts with email addresses
./scripts/fetch_contacts.sh --has-email

# Show only contacts with phone numbers
./scripts/fetch_contacts.sh --has-phone

# Show full details (all fields)
./scripts/fetch_contacts.sh --full

# Show only specific fields
./scripts/fetch_contacts.sh --fields "names,emailAddresses,phoneNumbers,organizations"

# Sort by last name
./scripts/fetch_contacts.sh --sort lastname

# Sort by first name
./scripts/fetch_contacts.sh --sort firstname
```

### search_contacts.sh
Search contacts by name, email, or phone number.

```bash
# Search by name
./scripts/search_contacts.sh "John"

# Search by email
./scripts/search_contacts.sh "john@example.com"

# Search with format
./scripts/search_contacts.sh "Smith" table

# Exact match mode
./scripts/search_contacts.sh --exact "John Smith"
```

### fetch_contact.sh
Get detailed information for a single contact.

```bash
# Fetch contact by resource name
./scripts/fetch_contact.sh "people/c123456789"

# Fetch with specific fields
./scripts/fetch_contact.sh "people/c123456789" "names,emailAddresses,phoneNumbers,addresses,organizations"
```

### fetch_groups.sh
List contact groups/labels.

```bash
# List all groups
./scripts/fetch_groups.sh

# Table format
./scripts/fetch_groups.sh table

# Compact format
./scripts/fetch_groups.sh compact
```

### fetch_by_group.sh
Get contacts in a specific group.

```bash
# Fetch contacts in a group
./scripts/fetch_by_group.sh "contactGroups/myContacts"

# With format
./scripts/fetch_by_group.sh "contactGroups/myContacts" table

# Limit results
./scripts/fetch_by_group.sh "contactGroups/myContacts" -n 20
```

### fetch_contact_photos.sh
Get photo URLs for contacts.

```bash
# Get photo URLs for all contacts
./scripts/fetch_contact_photos.sh

# For a specific contact
./scripts/fetch_contact_photos.sh "people/c123456789"
```

## Common Use Cases

### Find a contact's email
```bash
./scripts/search_contacts.sh "Alice" table
```

### List all contacts with phone numbers
```bash
./scripts/fetch_contacts.sh --has-phone table
```

### Get contacts in a specific group
```bash
./scripts/fetch_groups.sh compact
./scripts/fetch_by_group.sh "contactGroups/myContacts" table
```

### Export contacts to CSV
```bash
./scripts/fetch_contacts.sh csv > contacts.csv
```

### Find contacts by company
```bash
./scripts/fetch_contacts.sh --full | jq '.[] | select(.organizations[0].name | contains("Google"))'
```

## Output Format

All scripts support the same output formats as other Google skills: `json`, `table`, `csv`, `tsv`, `markdown`, `compact`.

## Contact Fields

Available fields for the People API:
- `names` - Full name, first name, last name
- `emailAddresses` - Email addresses with labels
- `phoneNumbers` - Phone numbers with labels
- `addresses` - Physical addresses
- `organizations` - Company, job title
- `urls` - Websites
- `birthdays` - Birth dates
- `biographies` - Notes
- `photos` - Photo URLs
- `memberships` - Group memberships

## API Endpoint

- `https://people.googleapis.com/v1/people/me/connections`
- `https://people.googleapis.com/v1/people/{resourceName}`
- `https://people.googleapis.com/v1/contactGroups`

## Required OAuth Scope

`https://www.googleapis.com/auth/contacts.readonly`

## Authentication

Handled by the shared `google-auth` library. See `google-auth/SKILL.md`.

## Troubleshooting

| Error | Solution |
|-------|----------|
| "contacts.readonly" scope required | The token needs the Contacts scope. Re-authenticate with `google-auth` including `contacts.readonly`. |
| "Resource not found" | The contact resource name may be invalid. Check with `fetch_contacts.sh`. |
| "Permission denied" | Ensure the token has contacts.readonly scope. Use `inspect_token.sh` to verify. |
| "Field mask is empty" | Provide `personFields` or `fields` parameter. Default is `names,emailAddresses,phoneNumbers`. |
