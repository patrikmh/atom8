# Google Contacts (People API) Pi Extension

This pi extension provides authenticated access to Google Contacts via the Google People API. It allows you to list, search, create, update, and delete contacts directly from pi.

## Setup

### 1. Enable the People API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to your project (e.g., `atom8-498213`)
3. Go to **APIs & Services > Library**
4. Search for **People API** and enable it

### 2. Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**
2. Add the following scopes:
   - `https://www.googleapis.com/auth/contacts`
   - `https://www.googleapis.com/auth/contacts.readonly`
3. Add `http://localhost` and `http://localhost:8000` as authorized redirect URIs

### 3. Create OAuth Credentials

Create a **Web application** OAuth client ID and download the credentials.

### 4. Set Environment Variables

```bash
export CONTACTS_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export CONTACTS_CLIENT_SECRET="your-client-secret"
```

### 5. Authenticate

```
/contacts-auth
```

## Available Tools

| Tool | Description |
|------|-------------|
| `contacts_auth` | Check auth status or trigger OAuth flow |
| `contacts_list` | List contacts with pagination |
| `contacts_search` | Search contacts by name, email, or phone |
| `contacts_get` | Read a specific contact by resource name |
| `contacts_create` | Create a new contact |
| `contacts_update` | Update an existing contact |
| `contacts_delete` | Delete a contact permanently |

## Usage Examples

```
list my contacts
```

```
find Alice's phone number
```

```
search contacts for "john"
```

```
add contact John Doe with email john@example.com
```

```
update contact people/c123456789 with phone +46123456789
```

## Security Notes

- Tokens stored in pi session. Set `CONTACTS_CLIENT_SECRET` in your shell profile, never commit it.
- The extension auto-refreshes expired tokens.
