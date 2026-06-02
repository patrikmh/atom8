# Gmail Pi Extension

This pi extension provides authenticated access to Gmail via the Google Workspace API. It allows you to read, send, search, and manage emails directly from pi.

## Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Navigate to **APIs & Services > Library**
4. Search for **Gmail API** and enable it

### 2. Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**
2. Select **External** (or Internal if within a Google Workspace organization)
3. Fill in the required app information (name, user support email, etc.)
4. Add the following scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.labels`
5. Add **Authorized redirect URIs**:
   - `http://localhost`
   - `http://localhost:8000` (pi picks a random port in the 8000–8999 range)
6. Add yourself as a test user (required for external apps until verified)

### 3. Create OAuth Credentials

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Choose **Web application** as the application type (this allows redirect URIs)
4. Name it (e.g., "pi-gmail-extension")
5. Under **Authorized redirect URIs**, add:
   - `http://localhost`
   - `http://localhost:8000`
6. Save and download the client credentials JSON
7. Extract the `client_id` and `client_secret` values

### 4. Set Environment Variables

Add these to your shell profile (`.zshrc`, `.bashrc`, etc.):

```bash
export GMAIL_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export GMAIL_CLIENT_SECRET="your-client-secret"
```

Then reload: `source ~/.zshrc` (or `.bashrc`)

### 5. Authenticate

Start pi in this project directory. The extension will auto-discover. Then run:

```
/gmail-auth
```

Or ask pi to authenticate:

```
authenticate my gmail
```

This will:
1. **Start a temporary local server** inside pi (on a random port 8000–8999)
2. **Open your browser** with the Google OAuth consent screen
3. **You click "Authorize"** in the browser
4. Google **redirects back to localhost** — pi captures the code automatically
5. **Tokens are stored** in the session

No copy-pasting of codes. The whole flow stays inside pi.

## Available Tools

| Tool | Description |
|------|-------------|
| `gmail_auth` | Check auth status or trigger OAuth flow |
| `gmail_list_messages` | List messages from inbox (with search/filter) |
| `gmail_read_message` | Read a specific email by ID |
| `gmail_send_message` | Send an email |
| `gmail_search` | Search emails with Gmail query syntax |
| `gmail_list_threads` | List conversation threads |
| `gmail_read_thread` | Read all messages in a thread |
| `gmail_list_labels` | List all labels |
| `gmail_modify_labels` | Add/remove labels on a message |
| `gmail_trash_message` | Move a message to trash |
| `gmail_untrash_message` | Restore a message from trash |
| `gmail_get_profile` | Get account profile (email, message count) |

## Usage Examples

```
show my latest unread emails
```

```
search gmail for emails from alice@example.com about the budget
```

```
read email id 123abc456def789
```

```
send an email to bob@example.com with subject "Meeting notes" and body "Hi Bob, attached are the notes..."
```

```
mark email 123abc456def789 as read
```

## Gmail Search Query Syntax

Use standard Gmail search queries in the `q` parameter:

- `is:unread` — unread messages
- `from:someone@example.com` — from a specific sender
- `to:someone@example.com` — to a specific recipient
- `subject:meeting` — subject contains "meeting"
- `after:2024/01/01` — after a date
- `before:2024/12/31` — before a date
- `in:inbox` — in inbox
- `in:sent` — in sent
- `has:attachment` — has attachments
- `label:important` — with a specific label
- `is:starred` — starred messages

## Security Notes

- Your OAuth tokens are stored in the pi session file. They persist across restarts of the same session.
- The extension requests `offline` access so it can refresh tokens automatically.
- Never commit your `GMAIL_CLIENT_SECRET` to version control.
- For production/team use, consider using a service account or more restrictive scopes.

## Troubleshooting

**"Not authenticated with Gmail"**
→ Run `/gmail-auth` and follow the flow.

**"Token exchange failed"**
→ Verify `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` are correct.
→ Check that your Google account is added as a test user in the OAuth consent screen.
→ Make sure `http://localhost` is added as an authorized redirect URI in your OAuth credentials.

**"Gmail API error (403)"**
→ Your app may not be verified by Google. Test users can still use it, but external users cannot.

**"Gmail API error (429)"**
→ Rate limit exceeded. The extension handles quota automatically; wait a moment and retry.

**Browser doesn't open automatically**
→ The auth URL will be shown in pi. You can copy-paste it into your browser manually. After authorizing, the browser will redirect to `localhost` and pi will capture the code automatically.

**"Local auth server error: EADDRINUSE"**
→ The random port is already in use. Try again — pi will pick a different port.
