# Microsoft Graph Pi Extension

This pi extension provides authenticated access to Microsoft Graph, covering Outlook email, calendar, Microsoft To Do tasks, contacts, and OneDrive — all via a single OAuth flow.

## Setup

### 1. Register an App in Azure AD

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Microsoft Entra ID > App registrations**
3. Click **New registration**
4. Name: `pi-microsoft-graph`
5. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
6. Redirect URI: **Web** → `http://localhost`
7. Click **Register**

### 2. Add API Permissions

1. Go to **API permissions** in your app
2. Add the following **Delegated** permissions:
   - `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`
   - `Calendars.Read`, `Calendars.ReadWrite`
   - `Tasks.ReadWrite`
   - `Contacts.Read`, `Contacts.ReadWrite`
   - `Files.ReadWrite`
   - `Notes.ReadWrite`
   - `User.Read`
   - `offline_access`
3. Click **Grant admin consent** (if you have admin rights)

### 3. Create a Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Copy the **Value** (not the Secret ID)

### 4. Set Environment Variables

```bash
export MS_GRAPH_CLIENT_ID="your-application-id"
export MS_GRAPH_CLIENT_SECRET="your-client-secret"
```

### 5. Authenticate

```
/ms-auth
```

## Available Tools

### Mail

| Tool | Description |
|------|-------------|
| `ms_mail_list` | List Outlook emails with filtering |
| `ms_mail_read` | Read a specific email by ID |
| `ms_mail_send` | Send an email via Outlook |
| `ms_mail_delete` | Move to deleted items or permanently delete |

### Calendar

| Tool | Description |
|------|-------------|
| `ms_calendar_list` | List Outlook calendars |
| `ms_calendar_events` | List events in a calendar with date range |
| `ms_calendar_create` | Create a new event |
| `ms_calendar_update` | Update an existing event |
| `ms_calendar_delete` | Delete an event |

### Tasks (Microsoft To Do)

| Tool | Description |
|------|-------------|
| `ms_tasks_lists` | List To Do lists |
| `ms_tasks_list` | List tasks in a list |
| `ms_tasks_create` | Create a new task |
| `ms_tasks_update` | Update a task (status, due, importance) |
| `ms_tasks_delete` | Delete a task |

### Contacts

| Tool | Description |
|------|-------------|
| `ms_contacts_list` | List Outlook contacts |
| `ms_contacts_get` | Read a specific contact |
| `ms_contacts_create` | Create a new contact |
| `ms_contacts_update` | Update a contact |
| `ms_contacts_delete` | Delete a contact |

## Usage Examples

```
show my emails
```

```
list calendar events for next week
```

```
create event: Team Meeting on June 5 at 10:00 AM to 11:00 AM
```

```
list my to-do lists
```

```
add task: Call dentist to list abc123
```

```
find Alice's contact
```

## Security Notes

- Tokens stored in pi session. Set `MS_GRAPH_CLIENT_SECRET` in your shell profile, never commit it.
- The extension auto-refreshes expired tokens.
- Uses Azure AD's `common` tenant for personal Microsoft accounts.
