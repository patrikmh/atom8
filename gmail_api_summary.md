# Gmail API - Structured Summary of Findings

## 1. Authentication with Gmail API (OAuth 2.0 Flow, Scopes)

### OAuth 2.0 Overview
- All apps using the Gmail API must use **OAuth 2.0 for authorization**.
- Google displays a **consent screen** to the user showing the project summary, policies, and requested authorization scopes.
- You must **configure the OAuth consent screen** in the Google Cloud Console under **Google Auth platform > Branding**.
- You need to provide:
  - App name
  - User support email
  - Audience type (Internal or External)
  - Contact information
  - Required scopes

### Scopes Required
The Gmail API requires one of the following OAuth scopes depending on the level of access:

| Scope | Access Level | Notes |
|-------|-------------|-------|
| `https://mail.google.com/` | Full access | Read, compose, send, and permanently delete all email. **Restricted scope** — requires security assessment. |
| `https://www.googleapis.com/auth/gmail.modify` | Read + modify | All read/write operations except permanent delete. **Sensitive scope**. |
| `https://www.googleapis.com/auth/gmail.readonly` | Read-only | Read all email data, cannot modify. **Non-sensitive** (recommended when possible). |
| `https://www.googleapis.com/auth/gmail.metadata` | Metadata only | Read only message metadata (headers, labels, size). Cannot read body or attachments. **Non-sensitive**. |
| `https://www.googleapis.com/auth/gmail.labels` | Labels only | Create/modify labels. **Non-sensitive**. |
| `https://www.googleapis.com/auth/gmail.send` | Send only | Send email only. **Non-sensitive**. |
| `https://www.googleapis.com/auth/gmail.compose` | Drafts only | Create/send drafts. **Non-sensitive**. |

**Best Practice:** Choose the **most narrowly focused scope** possible. Avoid requesting scopes your app doesn't require. Use non-sensitive scopes whenever possible to avoid additional Google verification.

### Scope Categories
- **Non-sensitive scopes** — Grant limited data access; no additional review required.
- **Sensitive scopes** — Grant access to personal user data; require additional app verification.
- **Restricted scopes** — Grant highly-sensitive access; require basic verification + additional app verification + security assessment.

### Authentication Steps
1. **Create a Google Cloud project**.
2. **Enable the Gmail API** in the project.
3. **Configure OAuth consent screen** (Branding, Audience, Data Access).
4. **Create OAuth 2.0 credentials** (Client ID for installed/web apps, or Service Account for server-to-server).
5. **Request authorization** from the user and obtain an access token.
6. **Use the access token** in API requests via `Authorization: Bearer <token>` header.

---

## 2. How to List Messages from a User's Inbox

### API Endpoint
```
GET https://gmail.googleapis.com/gmail/v1/users/{userId}/messages
```

### Key Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | string | User's email or `me` for the authenticated user. |
| `maxResults` | uint32 | Max messages to return (default: 100, max: 500). |
| `pageToken` | string | Token for pagination to retrieve the next page. |
| `q` | string | Search query (supports Gmail advanced search syntax). |
| `labelIds[]` | string[] | Only return messages with all specified labels. |
| `includeSpamTrash` | boolean | Include messages from SPAM and TRASH. |

### Response Body
```json
{
  "messages": [
    {
      "id": "string",
      "threadId": "string"
    }
  ],
  "nextPageToken": "string",
  "resultSizeEstimate": 123
}
```

**Note:** Each `message` in the list only contains `id` and `threadId`. Use `messages.get` to fetch full details.

### Search Query Examples (`q` parameter)
```
in:sent after:2014/01/01 before:2014/02/01
from:someuser@example.com rfc822msgid:<somemsgid@example.com> is:unread
```

### Code Example (Python)
```python
from googleapiclient.discovery import build
from google.auth import default

creds, _ = default()
service = build("gmail", "v1", credentials=creds)

results = service.users().messages().list(
    userId="me",
    q="is:unread in:inbox",
    maxResults=50
).execute()

messages = results.get("messages", [])
for msg in messages:
    print(f"Message ID: {msg['id']}, Thread ID: {msg['threadId']}")
```

---

## 3. How to Read Email Content (Headers, Body, Attachments)

### API Endpoint
```
GET https://gmail.googleapis.com/gmail/v1/users/{userId}/messages/{id}
```

### Key Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | string | `me` or the user's email address. |
| `id` | string | The message ID (from `messages.list`). |
| `format` | enum | `FULL`, `METADATA`, `MINIMAL`, or `RAW`. |
| `metadataHeaders[]` | string[] | When `format=METADATA`, only include specified headers. |

### Format Options
| Format | Description |
|--------|-------------|
| `MINIMAL` | Returns only `id`, `threadId`, `labelIds`, `snippet`, `historyId`. Fastest. |
| `FULL` | Returns the parsed email structure with all headers, body, and attachments. |
| `METADATA` | Returns only specified headers (use `metadataHeaders[]`). |
| `RAW` | Returns the entire RFC 2822 formatted email as a base64url encoded string in the `raw` field. |

### Message Resource Structure
```json
{
  "id": "string",
  "threadId": "string",
  "labelIds": ["string"],
  "snippet": "string",
  "historyId": "string",
  "internalDate": "string",
  "payload": {
    "partId": "string",
    "mimeType": "string",
    "filename": "string",
    "headers": [
      {"name": "To", "value": "someuser@example.com"}
    ],
    "body": {
      "attachmentId": "string",
      "size": 123,
      "data": "base64url_string"
    },
    "parts": [
      // Nested MIME parts for multipart messages
    ]
  },
  "sizeEstimate": 123,
  "raw": "base64url_string"
}
```

### Reading Headers
Headers are in `payload.headers` array. Common headers: `To`, `From`, `Subject`, `Date`, `Cc`, `Bcc`, `In-Reply-To`, `References`.

### Reading Body Content
- For `text/plain` or `text/html` parts, the body content is in `payload.parts[].body.data` (base64url encoded).
- For multipart messages (e.g., `multipart/alternative`), iterate through `payload.parts` to find the desired MIME type.
- Container MIME types (`multipart/*`) have `parts[]` but an empty `body`.

### Reading Attachments
- Attachments have `filename` set in the `MessagePart`.
- If the body is large, `body.data` may be empty and `body.attachmentId` contains the attachment ID.
- Use `messages.attachments.get` to retrieve the attachment:

```
GET https://gmail.googleapis.com/gmail/v1/users/{userId}/messages/{messageId}/attachments/{id}
```

Response:
```json
{
  "attachmentId": "string",
  "size": 123,
  "data": "base64url_string"
}
```

### Code Example (Python - reading message body)
```python
import base64

msg = service.users().messages().get(userId="me", id=message_id, format="full").execute()

# Extract headers
headers = msg["payload"]["headers"]
for h in headers:
    if h["name"] == "Subject":
        print(f"Subject: {h['value']}")

# Extract body (simple text)
parts = msg["payload"].get("parts", [])
for part in parts:
    if part["mimeType"] == "text/plain":
        data = part["body"]["data"]
        text = base64.urlsafe_b64decode(data).decode("utf-8")
        print(text)
```

---

## 4. How to Send Emails

### Two Ways to Send
1. **Direct send** using `messages.send`
2. **Send from draft** using `drafts.send`

### API Endpoint (Direct Send)
```
POST https://gmail.googleapis.com/gmail/v1/users/{userId}/messages/send
```

### Request Body
```json
{
  "raw": "base64url_encoded_mime_message"
}
```

### Steps to Send
1. **Create the email content** as a MIME message (RFC 2822 compliant).
2. **Encode it as base64url** string.
3. **Create a message resource** with `raw` field set to the encoded string.
4. **Call `messages.send`** with the message resource.

### Code Examples

**Python (using `email.message.EmailMessage`):**
```python
import base64
from email.message import EmailMessage
from googleapiclient.discovery import build
from google.auth import default

creds, _ = default()
service = build("gmail", "v1", credentials=creds)

message = EmailMessage()
message.set_content("This is the body of the email.")
message["To"] = "recipient@example.com"
message["From"] = "sender@example.com"
message["Subject"] = "Test Email"

encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()

create_message = {"raw": encoded_message}

sent = service.users().messages().send(userId="me", body=create_message).execute()
print(f"Message Id: {sent['id']}")
```

**Java (using `MimeMessage`):**
```java
Properties props = new Properties();
Session session = Session.getDefaultInstance(props, null);
MimeMessage email = new MimeMessage(session);
email.setFrom(new InternetAddress(fromEmailAddress));
email.addRecipient(javax.mail.Message.RecipientType.TO, new InternetAddress(toEmailAddress));
email.setSubject(subject);
email.setText(bodyText);

ByteArrayOutputStream buffer = new ByteArrayOutputStream();
email.writeTo(buffer);
byte[] rawMessageBytes = buffer.toByteArray();
String encodedEmail = Base64.encodeBase64URLSafeString(rawMessageBytes);

Message message = new Message();
message.setRaw(encodedEmail);

message = service.users().messages().send("me", message).execute();
```

### Sending with Attachments
- Create a **multipart MIME message** (`multipart/mixed` or `multipart/related`).
- Add the attachment as a `MimeBodyPart` with `DataHandler` and `FileDataSource`.
- Encode the entire MIME message as base64url and send via `messages.send`.

### Sending to a Thread (Reply)
To send a reply that appears in the same thread:
- Set the `threadId` in the message resource.
- Ensure `Subject` headers match.
- Set `References` and `In-Reply-To` headers per RFC 2822.

### Drafts
- **Create draft:** `POST /users/{userId}/drafts` with a `drafts` resource containing `message.raw`.
- **Update draft:** `PUT /users/{userId}/drafts/{id}` — replaces the contained MIME message.
- **Send draft:** `POST /users/{userId}/drafts/{id}/send` or `POST /users/{userId}/drafts/send` with draft ID.

---

## 5. Rate Limits and Important Considerations

### Gmail API Quota Limits
| Limit Type | Value |
|------------|-------|
| Per minute per project | **1,200,000 quota units** |
| Per minute per user per project | **6,000 quota units** |
| Per day per project (billing threshold) | **80,000,000 quota units** |

### Per-Method Quota Costs
| Method | Quota Units |
|--------|-------------|
| `messages.list` | 5 |
| `messages.get` | 20 |
| `messages.send` | 100 |
| `messages.import` | 25 |
| `messages.insert` | 25 |
| `messages.modify` | 5 |
| `messages.delete` | 10 |
| `messages.batchDelete` | 50 |
| `messages.batchModify` | 50 |
| `messages.attachments.get` | 20 |
| `drafts.create` | 10 |
| `drafts.send` | 100 |
| `drafts.get` | 20 |
| `drafts.list` | 5 |
| `threads.list` | 10 |
| `threads.get` | 40 |
| `labels.list` | 1 |
| `history.list` | 2 |
| `watch` | 100 |
| `getProfile` | 1 |

### Sending Limits (Gmail API Specific)
- **Recipients per message (API):** 500 maximum
- **Daily sending limit per user:** 2,000 messages (1,500 for mail merge)
- **Total recipients per day:** 10,000
- **External recipients per day:** 3,000
- **Unique recipients per day:** 3,000 (2,000 external)

### Receiving Limits
- **Per minute:** 60 messages
- **Per hour:** 3,600 messages
- **Per day:** 86,400 messages
- **Attachment size limit:** 25 MB (Business/Education), up to 50 MB (Enterprise Plus web)
- **Max attachments per email:** 500

### Error Handling
- Use **truncated exponential backoff** for time-based quota errors (429).
- Retry with increasing wait times: `min((2^n) + random_ms, max_backoff)`.
- Typical `max_backoff`: 32 or 64 seconds.

### Push Notifications
- Instead of polling, use **Cloud Pub/Sub push notifications**.
- Call `users.watch` to set up a watch on a mailbox.
- The watch expires in ~7 days; call `watch` at least once daily.
- Notifications contain `emailAddress` and `historyId`.

### Batch Requests
- Group up to **100 API calls** into a single HTTP request.
- Use `multipart/mixed` content type.
- Each inner call counts separately toward quota.
- Batch sizes > 50 are not recommended (may trigger rate limiting).
- Calls may be executed in any order; use separate requests if order matters.

### Partial Resources (Performance)
- Use `fields` parameter to request only needed fields (e.g., `fields=messages(id,threadId)`).
- Use `PATCH` for updates to send only changed fields.
- Enable **gzip compression** by setting `Accept-Encoding: gzip` and including `gzip` in your user agent.

### Synchronization
- **Full sync:** Use `messages.list` then batch `messages.get` with `format=FULL` or `format=RAW`. Store the `historyId`.
- **Partial sync:** Use `history.list` with `startHistoryId` parameter.
- History records are typically available for at least one week.
- If `startHistoryId` is too old, an HTTP 404 is returned; perform a full sync.

### Important Notes
- Messages cannot be edited once created. Use `modify` to change labels.
- Drafts cannot have any label other than `DRAFT`. When sent, the draft is deleted and a new `SENT` message is created.
- Labels can be applied to threads (affects all messages) or individual messages.
- `me` is the special `userId` value for the authenticated user.
- The `labelIds[]` parameter on `messages.list` cannot be used with the `gmail.metadata` scope when using the `q` parameter.

---

## 6. API Endpoints and Key Parameters

### Base URL
```
https://gmail.googleapis.com
```

### Core Messages Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/gmail/v1/users/{userId}/messages` | List messages. |
| `GET` | `/gmail/v1/users/{userId}/messages/{id}` | Get a specific message. |
| `POST` | `/gmail/v1/users/{userId}/messages/send` | Send a message. |
| `POST` | `/upload/gmail/v1/users/{userId}/messages/send` | Send with media upload. |
| `POST` | `/gmail/v1/users/{userId}/messages` | Insert a message (IMAP APPEND style). |
| `POST` | `/gmail/v1/users/{userId}/messages/import` | Import a message with scanning. |
| `POST` | `/gmail/v1/users/{userId}/messages/{id}/modify` | Modify labels on a message. |
| `POST` | `/gmail/v1/users/{userId}/messages/batchModify` | Batch modify labels. |
| `POST` | `/gmail/v1/users/{userId}/messages/batchDelete` | Batch delete messages. |
| `POST` | `/gmail/v1/users/{userId}/messages/{id}/trash` | Move to trash. |
| `POST` | `/gmail/v1/users/{userId}/messages/{id}/untrash` | Remove from trash. |
| `DELETE` | `/gmail/v1/users/{userId}/messages/{id}` | Permanently delete. |

### Drafts Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/gmail/v1/users/{userId}/drafts` | Create a draft. |
| `GET` | `/gmail/v1/users/{userId}/drafts/{id}` | Get a draft. |
| `GET` | `/gmail/v1/users/{userId}/drafts` | List drafts. |
| `POST` | `/gmail/v1/users/{userId}/drafts/send` | Send a draft. |
| `PUT` | `/gmail/v1/users/{userId}/drafts/{id}` | Update a draft. |
| `DELETE` | `/gmail/v1/users/{userId}/drafts/{id}` | Delete a draft. |

### Threads Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/gmail/v1/users/{userId}/threads` | List threads. |
| `GET` | `/gmail/v1/users/{userId}/threads/{id}` | Get a specific thread. |
| `DELETE` | `/gmail/v1/users/{userId}/threads/{id}` | Delete a thread. |
| `POST` | `/gmail/v1/users/{userId}/threads/{id}/trash` | Trash a thread. |
| `POST` | `/gmail/v1/users/{userId}/threads/{id}/untrash` | Untrash a thread. |
| `POST` | `/gmail/v1/users/{userId}/threads/{id}/modify` | Modify labels on a thread. |

### Labels Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/gmail/v1/users/{userId}/labels` | List labels. |
| `GET` | `/gmail/v1/users/{userId}/labels/{id}` | Get a label. |
| `POST` | `/gmail/v1/users/{userId}/labels` | Create a label. |
| `PUT` | `/gmail/v1/users/{userId}/labels/{id}` | Update a label. |
| `PATCH` | `/gmail/v1/users/{userId}/labels/{id}` | Patch a label. |
| `DELETE` | `/gmail/v1/users/{userId}/labels/{id}` | Delete a label. |

### Attachments Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/gmail/v1/users/{userId}/messages/{messageId}/attachments/{id}` | Get attachment data. |

### History Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/gmail/v1/users/{userId}/history` | List history records. |

### Settings Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/gmail/v1/users/{userId}/settings` | Get settings. |
| `GET` | `/gmail/v1/users/{userId}/settings/forwardingAddresses` | List forwarding addresses. |
| `POST` | `/gmail/v1/users/{userId}/settings/forwardingAddresses` | Create forwarding address. |
| `GET` | `/gmail/v1/users/{userId}/settings/filters` | List filters. |
| `POST` | `/gmail/v1/users/{userId}/settings/filters` | Create filter. |
| `GET` | `/gmail/v1/users/{userId}/settings/sendAs` | List send-as aliases. |
| `PUT` | `/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}` | Update alias. |

### Push Notifications Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/gmail/v1/users/{userId}/watch` | Set up a mailbox watch. |
| `POST` | `/gmail/v1/users/{userId}/stop` | Stop push notifications. |
| `GET` | `/gmail/v1/users/{userId}/profile` | Get user profile (contains historyId). |

### Batch Endpoint
```
POST /batch/gmail/v1
```

### Upload Endpoints
Use `/upload` prefix for media uploads:
```
POST /upload/gmail/v1/users/{userId}/messages/send
POST /upload/gmail/v1/users/{userId}/drafts
POST /upload/gmail/v1/users/{userId}/drafts/send
POST /upload/gmail/v1/users/{userId}/messages
POST /upload/gmail/v1/users/{userId}/messages/import
```

### Upload Types
| Type | Parameter | Use Case |
|------|-----------|----------|
| Simple | `uploadType=media` | Quick transfer of small files (< 5 MB). |
| Multipart | `uploadType=multipart` | Small files + metadata in one request. |
| Resumable | `uploadType=resumable` | Reliable transfer for larger files. |

---

## Key References
- **Overview:** https://developers.google.com/workspace/gmail/api/guides
- **Sending:** https://developers.google.com/workspace/gmail/api/guides/sending
- **Drafts:** https://developers.google.com/workspace/gmail/api/guides/drafts
- **Threads:** https://developers.google.com/workspace/gmail/api/guides/threads
- **Labels:** https://developers.google.com/workspace/gmail/api/guides/labels
- **Filtering:** https://developers.google.com/workspace/gmail/api/guides/filtering
- **Sync:** https://developers.google.com/workspace/gmail/api/guides/sync
- **Push:** https://developers.google.com/workspace/gmail/api/guides/push
- **Uploads:** https://developers.google.com/workspace/gmail/api/guides/uploads
- **Batch:** https://developers.google.com/workspace/gmail/api/guides/batch
- **Performance:** https://developers.google.com/workspace/gmail/api/guides/performance
- **Quota:** https://developers.google.com/workspace/gmail/api/reference/quota
- **API Reference:** https://developers.google.com/workspace/gmail/api/reference/rest
- **Auth:** https://developers.google.com/workspace/guides/getstarted-overview
- **OAuth Consent:** https://developers.google.com/workspace/guides/configure-oauth-consent
- **Sending Limits:** https://support.google.com/a/answer/166852
- **Receiving Limits:** https://support.google.com/a/answer/1366776
