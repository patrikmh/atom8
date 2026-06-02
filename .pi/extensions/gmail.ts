import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import {
  truncateHead,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
} from "@earendil-works/pi-coding-agent";
import * as http from "http";
import * as crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AuthState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // timestamp ms
  email?: string;
}

interface StoredMessage {
  id: string;
  threadId: string;
  snippet: string;
  headers: Record<string, string>;
  bodyText?: string;
  bodyHtml?: string;
  labels: string[];
  internalDate: string;
  sizeEstimate: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
];

// Localhost port range for OAuth loopback redirect
const LOCALHOST_PORT_MIN = 8000;
const LOCALHOST_PORT_MAX = 8999;
const AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ─────────────────────────────────────────────────────────────────────────────
// State (reconstructed from session entries)
// ─────────────────────────────────────────────────────────────────────────────

let authState: AuthState | null = null;

function getClientId(): string | undefined {
  return process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
}

function getClientSecret(): string | undefined {
  return process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
}

function setAuthState(state: AuthState | null) {
  authState = state;
}

function isTokenExpired(): boolean {
  if (!authState) return true;
  return Date.now() >= authState.expiresAt - 60_000; // 1 min buffer
}

// Try to restore authState from session entries (google-auth or gmail-auth)
function restoreAuthState(ctx: ExtensionContext) {
  if (authState) return;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "gmail-auth" && entry.data) {
      const data = entry.data as AuthState;
      if (data.accessToken && data.refreshToken) { authState = data; return; }
    }
    if (entry.type === "custom" && entry.customType === "google-auth" && entry.data) {
      const data = entry.data as AuthState;
      if (data.accessToken && data.refreshToken) { authState = data; return; }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start a temporary localhost HTTP server to capture the OAuth callback.
 * Returns a promise that resolves with the auth code, or rejects on timeout/error.
 */
function createLocalAuthServer(
  expectedState: string,
  port: number
): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${port}`);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          `<html><body><h1>Authentication failed</h1><p>Error: ${escapeHtml(error)}</p><p>You can close this tab.</p></body></html>`
        );
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          `<html><body><h1>Missing authorization code</h1><p>No code was received. You can close this tab.</p></body></html>`
        );
        server.close();
        reject(new Error("No authorization code received from Google."));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          `<html><body><h1>Invalid state</h1><p>CSRF state mismatch. You can close this tab.</p></body></html>`
        );
        server.close();
        reject(new Error("OAuth state mismatch — possible CSRF attack."));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<html><body><h1>Authentication successful</h1><p>You can close this tab and return to pi.</p></body></html>`
      );
      server.close();
      resolve({ code });
    });

    server.listen(port, () => {
      // Server started — waiting for callback
    });

    server.on("error", (err) => {
      reject(new Error(`Local auth server error: ${err.message}`));
    });
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getRandomPort(): number {
  return (
    Math.floor(Math.random() * (LOCALHOST_PORT_MAX - LOCALHOST_PORT_MIN + 1)) +
    LOCALHOST_PORT_MIN
  );
}

function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<AuthState> {
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Complete OAuth loopback flow: start local server, open browser, capture code, exchange tokens.
 */
async function performAuthFlow(
  clientId: string,
  clientSecret: string,
  ctx: ExtensionContext,
  pi: ExtensionAPI
): Promise<AuthState> {
  const port = getRandomPort();
  const redirectUri = `http://localhost:${port}`;
  const state = generateState();

  // Start the local server to capture the callback
  const serverPromise = createLocalAuthServer(state, port);

  const authUrl =
    `${GOOGLE_OAUTH_AUTH_URL}?` +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();

  ctx.ui.notify("Opening Gmail authorization in browser...", "info");

  // Try to open browser automatically
  try {
    await pi.exec("open", [authUrl], { timeout: 5000 });
  } catch {
    // Fallback: show URL in input prompt
    ctx.ui.notify("Could not open browser automatically.", "warning");
  }

  // Show the URL in a copyable input so the user can open it manually
  const opened = await ctx.ui.input(
    `If the browser didn't open, click this link to authorize Gmail:\n${authUrl}\n\nWaiting for authorization...`,
    "Press Enter once you've authorized (or type 'cancel')"
  );

  if (opened?.toLowerCase() === "cancel") {
    throw new Error("Authentication cancelled by user.");
  }

  // Wait for the callback with a timeout
  let result: { code: string };
  try {
    result = await Promise.race([
      serverPromise,
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                `Authentication timed out after ${AUTH_TIMEOUT_MS / 1000}s. Please try again.`
              )
            ),
          AUTH_TIMEOUT_MS
        );
      }),
    ]);
  } catch (err) {
    throw err;
  }

  ctx.ui.notify("Authorization code received, exchanging for tokens...", "info");

  const tokens = await exchangeCode(result.code, clientId, clientSecret, redirectUri);
  return tokens;
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; expiresAt: number }> {
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function ensureValidToken(
  ctx: ExtensionContext,
  pi: ExtensionAPI
): Promise<string> {
  restoreAuthState(ctx);
  const clientId = getClientId();
  const clientSecret = getClientSecret();

  if (!clientId || !clientSecret) {
    throw new Error(
      "GMAIL_CLIENT_ID (or GOOGLE_CLIENT_ID) and GMAIL_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) must be set."
    );
  }

  if (!authState) {
    throw new Error(
      "Not authenticated. Run /gmail-auth or use the gmail_auth tool first."
    );
  }

  if (isTokenExpired()) {
    ctx.ui.notify("Gmail token expired, refreshing...", "warning");
    const refreshed = await refreshAccessToken(
      authState.refreshToken,
      clientId,
      clientSecret
    );
    authState.accessToken = refreshed.accessToken;
    authState.expiresAt = refreshed.expiresAt;
    // Persist updated token
    pi.appendEntry("gmail-auth", { ...authState });
  }

  return authState.accessToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gmail API helpers
// ─────────────────────────────────────────────────────────────────────────────

async function gmailApi(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<unknown> {
  const url = `${GMAIL_API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API error (${res.status}): ${body}`);
  }

  return res.json();
}

function decodeBase64Url(data: string): string {
  // Replace URL-safe chars and add padding
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4;
  const padded = padding ? base64 + "=".repeat(4 - padding) : base64;
  return Buffer.from(padded, "base64").toString("utf-8");
}

function extractBody(
  payload: GmailMessagePart
): { text?: string; html?: string; attachments: AttachmentInfo[] } {
  const textParts: string[] = [];
  const htmlParts: string[] = [];
  const attachments: AttachmentInfo[] = [];

  function walk(part: GmailMessagePart) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      textParts.push(decodeBase64Url(part.body.data));
    } else if (part.mimeType === "text/html" && part.body?.data) {
      htmlParts.push(decodeBase64Url(part.body.data));
    } else if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        size: part.body.size ?? 0,
        attachmentId: part.body.attachmentId,
      });
    }

    if (part.parts) {
      for (const child of part.parts) {
        walk(child);
      }
    }
  }

  walk(payload);

  return {
    text: textParts.join("\n") || undefined,
    html: htmlParts.join("\n") || undefined,
    attachments,
  };
}

function extractHeaders(
  headers: Array<{ name: string; value: string }>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const h of headers) {
    result[h.name.toLowerCase()] = h.value;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gmail message types
// ─────────────────────────────────────────────────────────────────────────────

interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: {
    attachmentId?: string;
    size?: number;
    data?: string;
  };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
  sizeEstimate?: number;
}

interface AttachmentInfo {
  filename: string;
  mimeType?: string;
  size: number;
  attachmentId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Format helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatMessageSummary(
  msg: GmailMessage,
  includeBody: boolean,
  maxBodyLines = 100
): string {
  const headers = msg.payload?.headers
    ? extractHeaders(msg.payload.headers)
    : {};
  const body = msg.payload ? extractBody(msg.payload) : undefined;

  let lines: string[] = [];
  lines.push(`┌────────────────────────────────────────────────────────────`);
  lines.push(`│ Message: ${msg.id}`);
  lines.push(`│ Thread:  ${msg.threadId}`);
  lines.push(`│ Date:    ${headers["date"] || "unknown"}`);
  lines.push(`│ From:    ${headers["from"] || "unknown"}`);
  lines.push(`│ To:      ${headers["to"] || "unknown"}`);
  lines.push(`│ Subject: ${headers["subject"] || "(no subject)"}`);
  if (headers["cc"]) lines.push(`│ Cc:      ${headers["cc"]}`);
  lines.push(`│ Labels:  ${msg.labelIds?.join(", ") || "none"}`);
  lines.push(`│ Size:    ${msg.sizeEstimate ?? 0} bytes`);
  lines.push(`└────────────────────────────────────────────────────────────`);

  if (includeBody) {
    if (body?.text) {
      let text = body.text;
      const textLines = text.split("\n");
      if (textLines.length > maxBodyLines) {
        text = textLines.slice(0, maxBodyLines).join("\n");
        text += `\n\n... [truncated: ${textLines.length} total lines]`;
      }
      lines.push(`\n--- Body (text/plain) ---\n${text}`);
    } else if (body?.html) {
      lines.push(`\n--- Body (text/html) ---\n[HTML body present, ${body.html.length} chars]`);
    }

    if (body?.attachments && body.attachments.length > 0) {
      lines.push(`\n--- Attachments ---`);
      for (const att of body.attachments) {
        lines.push(`  • ${att.filename} (${att.mimeType || "unknown"}, ${att.size} bytes)`);
      }
    }
  }

  return lines.join("\n");
}

function truncateResult(text: string): string {
  const t = truncateHead(text, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });
  if (t.truncated) {
    return (
      t.content +
      `\n\n[Output truncated: ${t.outputLines} of ${t.totalLines} lines ` +
      `(${t.outputBytes} of ${t.totalBytes} bytes).]`
    );
  }
  return t.content;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension
// ─────────────────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── Session restore ───────────────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (
        entry.type === "custom" &&
        entry.customType === "gmail-auth" &&
        entry.data
      ) {
        const data = entry.data as AuthState;
        if (data.accessToken && data.refreshToken) {
          authState = data;
        }
      }
      if (
        entry.type === "custom" &&
        entry.customType === "google-auth" &&
        entry.data &&
        !authState
      ) {
        const data = entry.data as AuthState;
        if (data.accessToken && data.refreshToken) {
          authState = data;
        }
      }
    }
  });

  // ── Command: /gmail-auth ──────────────────────────────────────────────────
  pi.registerCommand("gmail-auth", {
    description: "Authenticate with Gmail OAuth",
    handler: async (_args, ctx) => {
      const clientId = getClientId();
      const clientSecret = getClientSecret();

      if (!clientId || !clientSecret) {
        ctx.ui.notify(
          "GMAIL_CLIENT_ID (or GOOGLE_CLIENT_ID) and GMAIL_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) must be set.",
          "error"
        );
        return;
      }

      if (authState) {
        const ok = await ctx.ui.confirm(
          "Gmail Auth",
          "Already authenticated. Re-authenticate?"
        );
        if (!ok) {
          ctx.ui.notify("Keeping existing Gmail authentication.", "info");
          return;
        }
      }

      try {
        const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
        authState = state;
        pi.appendEntry("gmail-auth", { ...state });
        ctx.ui.setStatus("gmail", "✉ Gmail: authenticated");
        ctx.ui.notify("Gmail authentication successful!", "success");
      } catch (err) {
        ctx.ui.setStatus(
          "gmail",
          "✉ Gmail: not authenticated (run /gmail-auth)"
        );
        ctx.ui.notify(
          `Auth failed: ${err instanceof Error ? err.message : String(err)}`,
          "error"
        );
      }
    },
  });

  // ── Tool: gmail_auth ──────────────────────────────────────────────────────
  pi.registerTool({
    name: "gmail_auth",
    label: "Gmail Auth",
    description:
      "Check Gmail authentication status or initiate OAuth flow. " +
      "Returns status: authenticated or not. If not authenticated, " +
      "pi will start a local server and open the Google authorization page in your browser. " +
      "Click authorize in the browser — pi captures the callback automatically. No code copying needed.",
    promptSnippet: "Authenticate with Gmail to enable email access",
    promptGuidelines: [
      "Use gmail_auth before any other gmail tool if you are unsure whether the user is authenticated.",
    ],
    parameters: Type.Object({
      action: StringEnum(["status", "authenticate"] as const),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const clientId = getClientId();
      const clientSecret = getClientSecret();

      if (!clientId || !clientSecret) {
        throw new Error(
          "GMAIL_CLIENT_ID (or GOOGLE_CLIENT_ID) and GMAIL_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) environment variables are required."
        );
      }

      if (params.action === "status") {
        restoreAuthState(ctx);
        if (authState) {
          return {
            content: [
              {
                type: "text",
                text: `Authenticated with Gmail. Token expires at ${new Date(authState.expiresAt).toISOString()}.`,
              },
            ],
            details: { authenticated: true },
          };
        }
        return {
          content: [
            {
              type: "text",
              text: "Not authenticated with Gmail. Run /gmail-auth or use action=authenticate.",
            },
          ],
          details: { authenticated: false },
        };
      }

      // action === "authenticate"
      const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
      authState = state;
      pi.appendEntry("gmail-auth", { ...state });
      ctx.ui.setStatus("gmail", "✉ Gmail: authenticated");

      return {
        content: [
          {
            type: "text",
            text: "Gmail authentication successful. You can now use Gmail tools.",
          },
        ],
        details: { authenticated: true },
      };
    },
  });

  // ── Tool: gmail_list_messages ─────────────────────────────────────────────
  pi.registerTool({
    name: "gmail_list_messages",
    label: "Gmail List",
    description:
      "List messages from the user's Gmail inbox. Supports pagination, search queries, and label filtering.",
    promptSnippet: "List emails from Gmail inbox with optional search query",
    promptGuidelines: [
      "Use gmail_list_messages when the user asks to see their emails, inbox, or recent messages.",
      "Use the q parameter for Gmail search queries (e.g., 'is:unread from:alice@example.com').",
      "Use maxResults to limit the number of returned messages.",
    ],
    parameters: Type.Object({
      maxResults: Type.Optional(Type.Number({ default: 25, maximum: 500, minimum: 1 })),
      q: Type.Optional(
        Type.String({
          description: "Gmail search query (e.g., 'is:unread in:inbox')",
        })
      ),
      labelIds: Type.Optional(
        Type.Array(
          Type.String({
            description: "Filter by label IDs (e.g., 'INBOX', 'SENT', 'UNREAD')",
          })
        )
      ),
      pageToken: Type.Optional(
        Type.String({ description: "Page token for pagination" })
      ),
      includeSpamTrash: Type.Optional(Type.Boolean({ default: false })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);

      const queryParams = new URLSearchParams();
      queryParams.set("userId", "me");
      if (params.maxResults) queryParams.set("maxResults", String(params.maxResults));
      if (params.q) queryParams.set("q", params.q);
      if (params.pageToken) queryParams.set("pageToken", params.pageToken);
      if (params.includeSpamTrash) queryParams.set("includeSpamTrash", "true");
      if (params.labelIds) {
        for (const label of params.labelIds) {
          queryParams.append("labelIds", label);
        }
      }

      const data = (await gmailApi(
        `/users/me/messages?${queryParams.toString()}`,
        token
      )) as {
        messages?: Array<{ id: string; threadId: string }>;
        nextPageToken?: string;
        resultSizeEstimate?: number;
      };

      if (!data.messages || data.messages.length === 0) {
        return {
          content: [{ type: "text", text: "No messages found." }],
          details: { resultSizeEstimate: data.resultSizeEstimate ?? 0 },
        };
      }

      // Fetch minimal metadata for each message to show subject/from
      const summaries: string[] = [];
      for (const m of data.messages) {
        try {
          const msg = (await gmailApi(
            `/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            token
          )) as GmailMessage;
          const headers = msg.payload?.headers
            ? extractHeaders(msg.payload.headers)
            : {};
          const date = headers["date"] || "unknown";
          const from = headers["from"] || "unknown";
          const subject = headers["subject"] || "(no subject)";
          summaries.push(
            `${m.id} | ${date} | ${from} | ${subject} | Labels: ${msg.labelIds?.join(", ") || "none"}`
          );
        } catch {
          summaries.push(`${m.id} | [failed to load metadata]`);
        }
      }

      let text = `Found ${data.messages.length} messages (estimate: ${data.resultSizeEstimate}):\n\n`;
      text += "ID | Date | From | Subject | Labels\n";
      text += "─".repeat(80) + "\n";
      text += summaries.join("\n");

      if (data.nextPageToken) {
        text += `\n\n[nextPageToken: ${data.nextPageToken}]`;
      }

      return {
        content: [{ type: "text", text: truncateResult(text) }],
        details: {
          messages: data.messages,
          nextPageToken: data.nextPageToken,
          resultSizeEstimate: data.resultSizeEstimate,
        },
      };
    },
  });

  // ── Tool: gmail_read_message ──────────────────────────────────────────────
  pi.registerTool({
    name: "gmail_read_message",
    label: "Gmail Read",
    description:
      "Read a specific Gmail message by ID. Returns full headers, body text, and attachment info.",
    promptSnippet: "Read a specific Gmail email by its message ID",
    promptGuidelines: [
      "Use gmail_read_message when the user asks to read, open, or view a specific email.",
      "The message ID is obtained from gmail_list_messages or gmail_search.",
    ],
    parameters: Type.Object({
      messageId: Type.String({
        description: "The Gmail message ID to read",
      }),
      format: Type.Optional(
        StringEnum(["full", "metadata", "minimal", "raw"] as const)
      ),
      maxBodyLines: Type.Optional(
        Type.Number({
          default: 200,
          description: "Maximum body lines to include (truncates beyond this)",
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const fmt = params.format || "full";

      const msg = (await gmailApi(
        `/users/me/messages/${params.messageId}?format=${fmt}`,
        token
      )) as GmailMessage;

      if (fmt === "raw" && (msg as unknown as { raw: string }).raw) {
        const raw = (msg as unknown as { raw: string }).raw;
        const decoded = decodeBase64Url(raw);
        return {
          content: [
            {
              type: "text",
              text: truncateResult(decoded),
            },
          ],
          details: { id: msg.id, threadId: msg.threadId, format: "raw" },
        };
      }

      const text = formatMessageSummary(
        msg,
        true,
        params.maxBodyLines ?? 200
      );

      return {
        content: [{ type: "text", text: truncateResult(text) }],
        details: {
          id: msg.id,
          threadId: msg.threadId,
          labelIds: msg.labelIds,
          snippet: msg.snippet,
          internalDate: msg.internalDate,
          sizeEstimate: msg.sizeEstimate,
        },
      };
    },
  });

  // ── Tool: gmail_send_message ──────────────────────────────────────────────
  pi.registerTool({
    name: "gmail_send_message",
    label: "Gmail Send",
    description:
      "Send an email via Gmail. Provide recipient, subject, and body. Supports HTML body.",
    promptSnippet: "Send an email through the user's Gmail account",
    promptGuidelines: [
      "Use gmail_send_message when the user asks to send, compose, or draft an email.",
      "Confirm the recipient address and subject before sending.",
    ],
    parameters: Type.Object({
      to: Type.String({ description: "Recipient email address" }),
      subject: Type.String({ description: "Email subject" }),
      body: Type.String({ description: "Email body (plain text)" }),
      htmlBody: Type.Optional(
        Type.String({ description: "Optional HTML body" })
      ),
      cc: Type.Optional(
        Type.String({ description: "CC recipients (comma-separated)" })
      ),
      bcc: Type.Optional(
        Type.String({ description: "BCC recipients (comma-separated)" })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);

      // Build a simple MIME message
      const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com>`;

      let mime = `MIME-Version: 1.0\r\n`;
      mime += `Message-Id: ${messageId}\r\n`;
      mime += `Date: ${new Date().toUTCString()}\r\n`;
      mime += `To: ${params.to}\r\n`;
      mime += `Subject: ${params.subject}\r\n`;
      if (params.cc) mime += `Cc: ${params.cc}\r\n`;
      if (params.bcc) mime += `Bcc: ${params.bcc}\r\n`;

      if (params.htmlBody) {
        mime += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
        mime += `--${boundary}\r\n`;
        mime += `Content-Type: text/plain; charset=UTF-8\r\n`;
        mime += `Content-Transfer-Encoding: base64\r\n\r\n`;
        mime += `${Buffer.from(params.body, "utf-8").toString("base64")}\r\n\r\n`;
        mime += `--${boundary}\r\n`;
        mime += `Content-Type: text/html; charset=UTF-8\r\n`;
        mime += `Content-Transfer-Encoding: base64\r\n\r\n`;
        mime += `${Buffer.from(params.htmlBody, "utf-8").toString("base64")}\r\n\r\n`;
        mime += `--${boundary}--\r\n`;
      } else {
        mime += `Content-Type: text/plain; charset=UTF-8\r\n`;
        mime += `Content-Transfer-Encoding: base64\r\n\r\n`;
        mime += `${Buffer.from(params.body, "utf-8").toString("base64")}\r\n`;
      }

      const encoded = Buffer.from(mime)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const result = (await gmailApi(`/users/me/messages/send`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: encoded }),
      })) as { id: string; threadId: string; labelIds: string[] };

      return {
        content: [
          {
            type: "text",
            text: `Email sent successfully. Message ID: ${result.id}`,
          },
        ],
        details: result,
      };
    },
  });

  // ── Tool: gmail_search ────────────────────────────────────────────────────
  pi.registerTool({
    name: "gmail_search",
    label: "Gmail Search",
    description:
      "Search Gmail using Gmail's advanced search query syntax. Returns matching messages.",
    promptSnippet: "Search Gmail with advanced query syntax",
    promptGuidelines: [
      "Use gmail_search when the user wants to find emails matching specific criteria.",
      "Common queries: 'is:unread', 'from:someone@example.com', 'subject:meeting', 'after:2024/01/01'.",
    ],
    parameters: Type.Object({
      q: Type.String({
        description: "Gmail search query (e.g., 'is:unread from:boss@company.com')",
      }),
      maxResults: Type.Optional(Type.Number({ default: 25, maximum: 500, minimum: 1 })),
      pageToken: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // Reuse list_messages with a query
      const token = await ensureValidToken(ctx, pi);

      const queryParams = new URLSearchParams();
      queryParams.set("q", params.q);
      if (params.maxResults) queryParams.set("maxResults", String(params.maxResults));
      if (params.pageToken) queryParams.set("pageToken", params.pageToken);

      const data = (await gmailApi(
        `/users/me/messages?${queryParams.toString()}`,
        token
      )) as {
        messages?: Array<{ id: string; threadId: string }>;
        nextPageToken?: string;
        resultSizeEstimate?: number;
      };

      if (!data.messages || data.messages.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No messages found for query: "${params.q}"`,
            },
          ],
          details: { resultSizeEstimate: data.resultSizeEstimate ?? 0 },
        };
      }

      const summaries: string[] = [];
      for (const m of data.messages) {
        try {
          const msg = (await gmailApi(
            `/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            token
          )) as GmailMessage;
          const headers = msg.payload?.headers
            ? extractHeaders(msg.payload.headers)
            : {};
          const date = headers["date"] || "unknown";
          const from = headers["from"] || "unknown";
          const subject = headers["subject"] || "(no subject)";
          summaries.push(
            `${m.id} | ${date} | ${from} | ${subject}`
          );
        } catch {
          summaries.push(`${m.id} | [metadata unavailable]`);
        }
      }

      let text = `Search results for "${params.q}" (${data.messages.length} messages):\n\n`;
      text += "ID | Date | From | Subject\n";
      text += "─".repeat(80) + "\n";
      text += summaries.join("\n");

      if (data.nextPageToken) {
        text += `\n\n[nextPageToken: ${data.nextPageToken}]`;
      }

      return {
        content: [{ type: "text", text: truncateResult(text) }],
        details: {
          messages: data.messages,
          nextPageToken: data.nextPageToken,
          resultSizeEstimate: data.resultSizeEstimate,
        },
      };
    },
  });

  // ── Tool: gmail_list_threads ──────────────────────────────────────────────
  pi.registerTool({
    name: "gmail_list_threads",
    label: "Gmail Threads",
    description: "List conversation threads from Gmail.",
    promptSnippet: "List Gmail conversation threads",
    promptGuidelines: [
      "Use gmail_list_threads when the user wants to see conversation threads rather than individual messages.",
    ],
    parameters: Type.Object({
      maxResults: Type.Optional(Type.Number({ default: 25, maximum: 500, minimum: 1 })),
      q: Type.Optional(Type.String({ description: "Search query to filter threads" })),
      pageToken: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);

      const queryParams = new URLSearchParams();
      if (params.maxResults) queryParams.set("maxResults", String(params.maxResults));
      if (params.q) queryParams.set("q", params.q);
      if (params.pageToken) queryParams.set("pageToken", params.pageToken);

      const data = (await gmailApi(
        `/users/me/threads?${queryParams.toString()}`,
        token
      )) as {
        threads?: Array<{ id: string; snippet?: string; historyId?: string }>;
        nextPageToken?: string;
        resultSizeEstimate?: number;
      };

      if (!data.threads || data.threads.length === 0) {
        return {
          content: [{ type: "text", text: "No threads found." }],
          details: { resultSizeEstimate: data.resultSizeEstimate ?? 0 },
        };
      }

      const lines = data.threads.map(
        (t) => `${t.id} | ${t.snippet?.slice(0, 80) || "(no snippet)"}`
      );

      let text = `Found ${data.threads.length} threads:\n\n`;
      text += "Thread ID | Snippet\n";
      text += "─".repeat(80) + "\n";
      text += lines.join("\n");

      if (data.nextPageToken) {
        text += `\n\n[nextPageToken: ${data.nextPageToken}]`;
      }

      return {
        content: [{ type: "text", text: truncateResult(text) }],
        details: {
          threads: data.threads,
          nextPageToken: data.nextPageToken,
          resultSizeEstimate: data.resultSizeEstimate,
        },
      };
    },
  });

  // ── Tool: gmail_read_thread ───────────────────────────────────────────────
  pi.registerTool({
    name: "gmail_read_thread",
    label: "Gmail Read Thread",
    description:
      "Read all messages in a Gmail conversation thread by thread ID.",
    promptSnippet: "Read a full Gmail conversation thread",
    promptGuidelines: [
      "Use gmail_read_thread when the user wants to see an entire email conversation.",
    ],
    parameters: Type.Object({
      threadId: Type.String({
        description: "The Gmail thread ID to read",
      }),
      maxBodyLines: Type.Optional(
        Type.Number({ default: 100, description: "Max body lines per message" })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);

      const data = (await gmailApi(
        `/users/me/threads/${params.threadId}?format=full`,
        token
      )) as {
        id: string;
        messages?: GmailMessage[];
      };

      if (!data.messages || data.messages.length === 0) {
        return {
          content: [
            { type: "text", text: `Thread ${params.threadId} has no messages.` },
          ],
          details: { threadId: data.id },
        };
      }

      const parts: string[] = [];
      parts.push(
        `═══════════════════════════════════════════════════════════════`
      );
      parts.push(`Thread: ${data.id} (${data.messages.length} messages)`);
      parts.push(
        `═══════════════════════════════════════════════════════════════\n`
      );

      for (let i = 0; i < data.messages.length; i++) {
        const msg = data.messages[i];
        parts.push(`\n─── Message ${i + 1} / ${data.messages.length} ───`);
        parts.push(
          formatMessageSummary(msg, true, params.maxBodyLines ?? 100)
        );
      }

      return {
        content: [
          {
            type: "text",
            text: truncateResult(parts.join("\n")),
          },
        ],
        details: {
          threadId: data.id,
          messageCount: data.messages.length,
          messageIds: data.messages.map((m) => m.id),
        },
      };
    },
  });

  // ── Tool: gmail_list_labels ───────────────────────────────────────────────
  pi.registerTool({
    name: "gmail_list_labels",
    label: "Gmail Labels",
    description: "List all Gmail labels for the authenticated user.",
    promptSnippet: "List Gmail labels",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);

      const data = (await gmailApi(`/users/me/labels`, token)) as {
        labels?: Array<{
          id: string;
          name: string;
          type: string;
          messageListVisibility?: string;
          labelListVisibility?: string;
        }>;
      };

      if (!data.labels || data.labels.length === 0) {
        return {
          content: [{ type: "text", text: "No labels found." }],
          details: {},
        };
      }

      const lines = data.labels.map(
        (l) => `${l.id} | ${l.name} | type=${l.type}`
      );

      const text =
        `Labels (${data.labels.length}):\n\n` +
        "ID | Name | Type\n" +
        "─".repeat(60) +
        "\n" +
        lines.join("\n");

      return {
        content: [{ type: "text", text: truncateResult(text) }],
        details: { labels: data.labels },
      };
    },
  });

  // ── Tool: gmail_modify_labels ─────────────────────────────────────────────
  pi.registerTool({
    name: "gmail_modify_labels",
    label: "Gmail Modify Labels",
    description:
      "Add or remove labels on a Gmail message. Common labels: INBOX, UNREAD, IMPORTANT, SPAM, TRASH, SENT.",
    promptSnippet: "Add or remove labels on a Gmail message",
    promptGuidelines: [
      "Use gmail_modify_labels to mark emails as read/unread, archive, or apply custom labels.",
    ],
    parameters: Type.Object({
      messageId: Type.String({ description: "Message ID to modify" }),
      addLabelIds: Type.Optional(
        Type.Array(Type.String({ description: "Label IDs to add" }))
      ),
      removeLabelIds: Type.Optional(
        Type.Array(Type.String({ description: "Label IDs to remove" }))
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);

      const body: Record<string, unknown> = {};
      if (params.addLabelIds?.length) body.addLabelIds = params.addLabelIds;
      if (params.removeLabelIds?.length)
        body.removeLabelIds = params.removeLabelIds;

      const result = (await gmailApi(
        `/users/me/messages/${params.messageId}/modify`,
        token,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )) as { id: string; labelIds: string[]; threadId: string };

      return {
        content: [
          {
            type: "text",
            text: `Labels updated on message ${result.id}. Current labels: ${result.labelIds.join(", ")}`,
          },
        ],
        details: result,
      };
    },
  });

  // ── Tool: gmail_trash_message ───────────────────────────────────────────
  pi.registerTool({
    name: "gmail_trash_message",
    label: "Gmail Trash",
    description: "Move a Gmail message to the Trash folder.",
    promptSnippet: "Move a Gmail message to trash",
    parameters: Type.Object({
      messageId: Type.String({ description: "Message ID to trash" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);

      const result = (await gmailApi(
        `/users/me/messages/${params.messageId}/trash`,
        token,
        { method: "POST" }
      )) as { id: string; labelIds: string[] };

      return {
        content: [
          {
            type: "text",
            text: `Message ${result.id} moved to trash.`,
          },
        ],
        details: result,
      };
    },
  });

  // ── Tool: gmail_untrash_message ───────────────────────────────────────────
  pi.registerTool({
    name: "gmail_untrash_message",
    label: "Gmail Untrash",
    description: "Restore a Gmail message from the Trash folder.",
    promptSnippet: "Restore a Gmail message from trash",
    parameters: Type.Object({
      messageId: Type.String({ description: "Message ID to restore" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);

      const result = (await gmailApi(
        `/users/me/messages/${params.messageId}/untrash`,
        token,
        { method: "POST" }
      )) as { id: string; labelIds: string[] };

      return {
        content: [
          {
            type: "text",
            text: `Message ${result.id} restored from trash.`,
          },
        ],
        details: result,
      };
    },
  });

  // ── Tool: gmail_get_profile ───────────────────────────────────────────────
  pi.registerTool({
    name: "gmail_get_profile",
    label: "Gmail Profile",
    description: "Get the authenticated user's Gmail profile (email address, message count, etc.).",
    promptSnippet: "Get Gmail account profile info",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);

      const profile = (await gmailApi(`/users/me/profile`, token)) as {
        emailAddress: string;
        messagesTotal: number;
        threadsTotal: number;
        historyId: string;
      };

      return {
        content: [
          {
            type: "text",
            text:
              `Email: ${profile.emailAddress}\n` +
              `Total messages: ${profile.messagesTotal}\n` +
              `Total threads: ${profile.threadsTotal}\n` +
              `History ID: ${profile.historyId}`,
          },
        ],
        details: profile,
      };
    },
  });

  // ── Notification on startup ───────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    if (authState) {
      ctx.ui.setStatus("gmail", "✉ Gmail: authenticated");
    } else {
      ctx.ui.setStatus("gmail", "✉ Gmail: not authenticated (run /gmail-auth or /google-auth)");
    }
  });
}
