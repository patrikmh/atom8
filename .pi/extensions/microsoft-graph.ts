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
  expiresAt: number;
  email?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

const SCOPES = [
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/Calendars.Read",
  "https://graph.microsoft.com/Calendars.ReadWrite",
  "https://graph.microsoft.com/Tasks.ReadWrite",
  "https://graph.microsoft.com/Contacts.Read",
  "https://graph.microsoft.com/Contacts.ReadWrite",
  "https://graph.microsoft.com/Files.ReadWrite",
  "https://graph.microsoft.com/Notes.ReadWrite",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
];

const LOCALHOST_PORT_MIN = 8000;
const LOCALHOST_PORT_MAX = 8999;
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let authState: AuthState | null = null;

function getClientId(): string | undefined { return process.env.MS_GRAPH_CLIENT_ID; }
function getClientSecret(): string | undefined { return process.env.MS_GRAPH_CLIENT_SECRET; }
function setAuthState(state: AuthState | null) { authState = state; }
function isTokenExpired(): boolean {
  if (!authState) return true;
  return Date.now() >= authState.expiresAt - 60_000;
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth helpers
// ─────────────────────────────────────────────────────────────────────────────

function createLocalAuthServer(expectedState: string, port: number): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${port}`);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const errorDesc = url.searchParams.get("error_description");
      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<html><body><h1>Auth failed</h1><p>${escapeHtml(error)}${errorDesc ? `: ${escapeHtml(errorDesc)}` : ""}</p><p>You can close this tab.</p></body></html>`);
        server.close(); reject(new Error(`OAuth error: ${error}${errorDesc ? ` — ${errorDesc}` : ""}`)); return;
      }
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<html><body><h1>Missing code</h1><p>You can close this tab.</p></body></html>`);
        server.close(); reject(new Error("No code received.")); return;
      }
      if (state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<html><body><h1>Invalid state</h1><p>CSRF mismatch. You can close this tab.</p></body></html>`);
        server.close(); reject(new Error("OAuth state mismatch.")); return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><body><h1>Authentication successful</h1><p>You can close this tab.</p></body></html>`);
      server.close(); resolve({ code });
    });
    server.listen(port, () => {});
    server.on("error", (err) => reject(new Error(`Local server error: ${err.message}`)));
  });
}
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function getRandomPort(): number {
  return Math.floor(Math.random() * (LOCALHOST_PORT_MAX - LOCALHOST_PORT_MIN + 1)) + LOCALHOST_PORT_MIN;
}
function generateState(): string { return crypto.randomBytes(16).toString("hex"); }
async function exchangeCode(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<AuthState> {
  const params = new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", scope: SCOPES.join(" ") });
  const res = await fetch(MS_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
  if (!res.ok) { const body = await res.text(); throw new Error(`Token exchange failed (${res.status}): ${body}`); }
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 };
}
async function performAuthFlow(clientId: string, clientSecret: string, ctx: ExtensionContext, pi: ExtensionAPI): Promise<AuthState> {
  const port = getRandomPort();
  const redirectUri = `http://localhost:${port}`;
  const state = generateState();
  const serverPromise = createLocalAuthServer(state, port);
  const authUrl = `${MS_AUTH_URL}?` + new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(" "), response_mode: "query", state }).toString();
  ctx.ui.notify("Opening Microsoft authorization in browser...", "info");
  try { await pi.exec("open", [authUrl], { timeout: 5000 }); } catch { ctx.ui.notify("Could not open browser automatically.", "warning"); }
  const opened = await ctx.ui.input(`If the browser didn't open, click this link:\n${authUrl}\n\nWaiting for authorization...`, "Press Enter once authorized (or type 'cancel')");
  if (opened?.toLowerCase() === "cancel") throw new Error("Authentication cancelled.");
  const result = await Promise.race([serverPromise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Auth timed out after ${AUTH_TIMEOUT_MS / 1000}s.`)), AUTH_TIMEOUT_MS))]);
  ctx.ui.notify("Exchanging code for tokens...", "info");
  return await exchangeCode(result.code, clientId, clientSecret, redirectUri);
}
async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<{ accessToken: string; expiresAt: number }> {
  const params = new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", scope: SCOPES.join(" ") });
  const res = await fetch(MS_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
  if (!res.ok) { const body = await res.text(); throw new Error(`Token refresh failed (${res.status}): ${body}`); }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
}
async function ensureValidToken(ctx: ExtensionContext, pi: ExtensionAPI): Promise<string> {
  const clientId = getClientId(); const clientSecret = getClientSecret();
  if (!clientId || !clientSecret) throw new Error("MS_GRAPH_CLIENT_ID and MS_GRAPH_CLIENT_SECRET must be set.");
  if (!authState) throw new Error("Not authenticated. Run /ms-auth or use ms_auth.");
  if (isTokenExpired()) {
    ctx.ui.notify("Microsoft token expired, refreshing...", "warning");
    const refreshed = await refreshAccessToken(authState.refreshToken, clientId, clientSecret);
    authState.accessToken = refreshed.accessToken; authState.expiresAt = refreshed.expiresAt;
    pi.appendEntry("ms-graph-auth", { ...authState });
  }
  return authState.accessToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// Graph API helpers
// ─────────────────────────────────────────────────────────────────────────────

async function graphApi(endpoint: string, accessToken: string, options: RequestInit = {}): Promise<unknown> {
  const url = `${GRAPH_BASE}${endpoint}`;
  const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json", ...(options.headers || {}) } });
  if (!res.ok) { const body = await res.text(); throw new Error(`Microsoft Graph error (${res.status}): ${body}`); }
  return res.json();
}

function truncateResult(text: string): string {
  const t = truncateHead(text, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
  if (t.truncated) return t.content + `\n\n[Output truncated: ${t.outputLines} of ${t.totalLines} lines (${t.outputBytes} of ${t.totalBytes} bytes).]`;
  return t.content;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension
// ─────────────────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "ms-graph-auth" && entry.data) {
        const data = entry.data as AuthState;
        if (data.accessToken && data.refreshToken) authState = data;
      }
    }
  });

  // ── Command ─────────────────────────────────────────────────────────────
  pi.registerCommand("ms-auth", {
    description: "Authenticate with Microsoft Graph OAuth (Azure AD)",
    handler: async (_args, ctx) => {
      const clientId = getClientId(); const clientSecret = getClientSecret();
      if (!clientId || !clientSecret) { ctx.ui.notify("MS_GRAPH_CLIENT_ID and MS_GRAPH_CLIENT_SECRET must be set.", "error"); return; }
      if (authState) {
        const ok = await ctx.ui.confirm("Microsoft Graph Auth", "Already authenticated. Re-authenticate?");
        if (!ok) { ctx.ui.notify("Keeping existing Microsoft Graph auth.", "info"); return; }
      }
      try {
        const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
        authState = state; pi.appendEntry("ms-graph-auth", { ...state });
        ctx.ui.setStatus("ms-graph", "📘 Microsoft Graph: authenticated");
        ctx.ui.notify("Microsoft Graph authentication successful!", "success");
      } catch (err) {
        ctx.ui.setStatus("ms-graph", "📘 Microsoft Graph: not authenticated (run /ms-auth)");
        ctx.ui.notify(`Auth failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  // ── Tool: ms_auth ───────────────────────────────────────────────────────
  pi.registerTool({
    name: "ms_auth", label: "MS Graph Auth",
    description: "Check Microsoft Graph auth status or initiate Azure AD OAuth flow.",
    promptSnippet: "Authenticate with Microsoft Graph to access Outlook, Calendar, Tasks, Contacts, and OneDrive",
    promptGuidelines: ["Use ms_auth before any other ms_graph tool if unsure about auth status."],
    parameters: Type.Object({ action: StringEnum(["status", "authenticate"] as const) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const clientId = getClientId(); const clientSecret = getClientSecret();
      if (!clientId || !clientSecret) throw new Error("MS_GRAPH_CLIENT_ID and MS_GRAPH_CLIENT_SECRET required.");
      if (params.action === "status") {
        if (authState) return { content: [{ type: "text", text: `Authenticated. Token expires at ${new Date(authState.expiresAt).toISOString()}.` }], details: { authenticated: true } };
        return { content: [{ type: "text", text: "Not authenticated. Run /ms-auth or use action=authenticate." }], details: { authenticated: false } };
      }
      const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
      authState = state; pi.appendEntry("ms-graph-auth", { ...state });
      ctx.ui.setStatus("ms-graph", "📘 Microsoft Graph: authenticated");
      return { content: [{ type: "text", text: "Microsoft Graph authentication successful." }], details: { authenticated: true } };
    },
  });

  // ── Tool: ms_mail_list ──────────────────────────────────────────────────
  pi.registerTool({
    name: "ms_mail_list", label: "MS Mail List",
    description: "List Outlook emails with optional filtering (unread, from, subject).",
    promptSnippet: "List Outlook emails",
    promptGuidelines: [
      "Use ms_mail_list when the user wants to see their Outlook emails.",
      "Supports $filter, $top, $select, and $orderby OData query parameters.",
    ],
    parameters: Type.Object({
      filter: Type.Optional(Type.String({ description: "OData filter (e.g., \"isRead eq false\")" })),
      top: Type.Optional(Type.Number({ default: 10, maximum: 50, minimum: 1 })),
      select: Type.Optional(Type.String({ description: "Comma-separated fields (e.g., \"subject,from,receivedDateTime\")" })),
      orderby: Type.Optional(Type.String({ default: "receivedDateTime desc", description: "OData orderby" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const qp = new URLSearchParams();
      if (params.top) qp.set("$top", String(params.top));
      if (params.filter) qp.set("$filter", params.filter);
      if (params.select) qp.set("$select", params.select);
      if (params.orderby) qp.set("$orderby", params.orderby);
      const data = (await graphApi(`/me/messages?${qp.toString()}`, token)) as {
        value?: Array<{ id: string; subject?: string; from?: { emailAddress?: { name?: string; address?: string } }; receivedDateTime?: string; isRead?: boolean; importance?: string }>;
        "@odata.nextLink"?: string;
      };
      if (!data.value || data.value.length === 0) return { content: [{ type: "text", text: "No emails found." }], details: {} };
      const lines = data.value.map(m => {
        const from = m.from?.emailAddress?.name || m.from?.emailAddress?.address || "(unknown)";
        const flag = m.isRead ? "   " : "● ";
        const imp = m.importance === "high" ? " [HIGH]" : "";
        return `${flag}${m.id} | ${m.subject || "(no subject)"}${imp}\n  From: ${from} | ${m.receivedDateTime || ""}`;
      });
      let text = `Emails (${data.value.length}):\n\n${lines.join("\n")}`;
      if (data["@odata.nextLink"]) text += "\n\n[More results available via nextLink]";
      return { content: [{ type: "text", text: truncateResult(text) }], details: { messages: data.value, nextLink: data["@odata.nextLink"] } };
    },
  });

  // ── Tool: ms_mail_read ──────────────────────────────────────────────────
  pi.registerTool({
    name: "ms_mail_read", label: "MS Mail Read",
    description: "Read a specific Outlook email by ID.",
    promptSnippet: "Read an Outlook email by ID",
    promptGuidelines: ["The ID is obtained from ms_mail_list."],
    parameters: Type.Object({
      messageId: Type.String({ description: "Email message ID" }),
      format: Type.Optional(StringEnum(["text", "html"] as const)),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const qp = new URLSearchParams();
      if (params.format === "text") qp.set("$format", "text");
      const msg = (await graphApi(`/me/messages/${params.messageId}?${qp.toString()}`, token)) as {
        id: string; subject?: string; from?: { emailAddress?: { name?: string; address?: string } }; toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
        receivedDateTime?: string; sentDateTime?: string; body?: { contentType?: string; content?: string }; isRead?: boolean; importance?: string; hasAttachments?: boolean;
      };
      const lines: string[] = [];
      lines.push(`┌────────────────────────────────────────────────────────────`);
      lines.push(`│ ID:       ${msg.id}`);
      lines.push(`│ Subject:  ${msg.subject || "(no subject)"}`);
      lines.push(`│ From:     ${msg.from?.emailAddress?.name || ""} <${msg.from?.emailAddress?.address || ""}>`);
      const toList = msg.toRecipients?.map(r => `${r.emailAddress?.name || ""} <${r.emailAddress?.address || ""}>`).join(", ");
      if (toList) lines.push(`│ To:       ${toList}`);
      if (msg.receivedDateTime) lines.push(`│ Received: ${msg.receivedDateTime}`);
      if (msg.sentDateTime) lines.push(`│ Sent:     ${msg.sentDateTime}`);
      if (msg.importance) lines.push(`│ Priority: ${msg.importance}`);
      if (msg.hasAttachments) lines.push(`│ Attachments: yes`);
      lines.push(`└────────────────────────────────────────────────────────────`);
      if (msg.body?.content) lines.push(`\n${msg.body.content.slice(0, 5000)}${msg.body.content.length > 5000 ? "\n\n[Body truncated...]" : ""}`);
      return { content: [{ type: "text", text: truncateResult(lines.join("\n")) }], details: msg };
    },
  });

  // ── Tool: ms_mail_send ──────────────────────────────────────────────────
  pi.registerTool({
    name: "ms_mail_send", label: "MS Mail Send",
    description: "Send an email via Outlook.",
    promptSnippet: "Send an email via Outlook",
    promptGuidelines: ["Confirm recipient and subject before sending."],
    parameters: Type.Object({
      to: Type.String({ description: "Recipient email address" }),
      subject: Type.String({ description: "Email subject" }),
      body: Type.String({ description: "Email body (plain text)" }),
      cc: Type.Optional(Type.String({ description: "CC addresses, comma-separated" })),
      bcc: Type.Optional(Type.String({ description: "BCC addresses, comma-separated" })),
      importance: Type.Optional(StringEnum(["low", "normal", "high"] as const)),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const toRecipients = [{ emailAddress: { address: params.to } }];
      const ccRecipients = params.cc ? params.cc.split(",").map(a => ({ emailAddress: { address: a.trim() } })) : undefined;
      const bccRecipients = params.bcc ? params.bcc.split(",").map(a => ({ emailAddress: { address: a.trim() } })) : undefined;
      const body: Record<string, unknown> = {
        message: { subject: params.subject, body: { contentType: "Text", content: params.body }, toRecipients },
      };
      if (ccRecipients) (body.message as Record<string, unknown>).ccRecipients = ccRecipients;
      if (bccRecipients) (body.message as Record<string, unknown>).bccRecipients = bccRecipients;
      if (params.importance) (body.message as Record<string, unknown>).importance = params.importance;
      await graphApi(`/me/sendMail`, token, { method: "POST", body: JSON.stringify(body) });
      return { content: [{ type: "text", text: `Email sent to ${params.to}.\nSubject: ${params.subject}` }], details: { sent: true, to: params.to, subject: params.subject } };
    },
  });

  // ── Tool: ms_mail_delete ────────────────────────────────────────────────
  pi.registerTool({
    name: "ms_mail_delete", label: "MS Mail Delete",
    description: "Move an email to deleted items or permanently delete.",
    promptSnippet: "Delete an Outlook email",
    parameters: Type.Object({
      messageId: Type.String({ description: "Email message ID" }),
      permanent: Type.Optional(Type.Boolean({ default: false, description: "Permanently delete (skip deleted items)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      if (params.permanent) {
        await graphApi(`/me/messages/${params.messageId}`, token, { method: "DELETE" });
      } else {
        await graphApi(`/me/messages/${params.messageId}/move`, token, { method: "POST", body: JSON.stringify({ destinationId: "deleteditems" }) });
      }
      return { content: [{ type: "text", text: `Email ${params.messageId} ${params.permanent ? "permanently deleted" : "moved to deleted items"}.` }], details: { deleted: true, messageId: params.messageId } };
    },
  });

  // ── Tool: ms_calendar_list ──────────────────────────────────────────────
  pi.registerTool({
    name: "ms_calendar_list", label: "MS Calendar List",
    description: "List Outlook calendars.",
    promptSnippet: "List Outlook calendars",
    parameters: Type.Object({
      top: Type.Optional(Type.Number({ default: 10, maximum: 50, minimum: 1 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const qp = new URLSearchParams();
      if (params.top) qp.set("$top", String(params.top));
      const data = (await graphApi(`/me/calendars?${qp.toString()}`, token)) as {
        value?: Array<{ id: string; name: string; color?: string; canEdit?: boolean }>; "@odata.nextLink"?: string;
      };
      if (!data.value || data.value.length === 0) return { content: [{ type: "text", text: "No calendars found." }], details: {} };
      const lines = data.value.map(c => `${c.id} | ${c.name}${c.canEdit ? "" : " [read-only]"}`);
      let text = `Calendars (${data.value.length}):\n\nID | Name\n` + "─".repeat(80) + "\n" + lines.join("\n");
      if (data["@odata.nextLink"]) text += "\n\n[More results available]";
      return { content: [{ type: "text", text: truncateResult(text) }], details: { calendars: data.value, nextLink: data["@odata.nextLink"] } };
    },
  });

  // ── Tool: ms_calendar_events ────────────────────────────────────────────
  pi.registerTool({
    name: "ms_calendar_events", label: "MS Calendar Events",
    description: "List events in a calendar (default: primary). Supports date range filtering.",
    promptSnippet: "List Outlook calendar events",
    promptGuidelines: [
      "Use ms_calendar_events when the user wants to see their Outlook calendar.",
      "The calendar ID is obtained from ms_calendar_list. Use 'primary' or omit for the default calendar.",
    ],
    parameters: Type.Object({
      calendarId: Type.String({ default: "primary", description: "Calendar ID (default: primary)" }),
      startDate: Type.Optional(Type.String({ description: "Start date (ISO 8601, e.g., '2026-06-01T00:00:00Z')" })),
      endDate: Type.Optional(Type.String({ description: "End date (ISO 8601)" })),
      top: Type.Optional(Type.Number({ default: 25, maximum: 50, minimum: 1 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const qp = new URLSearchParams();
      if (params.top) qp.set("$top", String(params.top));
      if (params.startDate && params.endDate) {
        qp.set("$filter", `start/dateTime ge '${params.startDate}' and end/dateTime le '${params.endDate}'`);
      }
      qp.set("$orderby", "start/dateTime asc");
      const endpoint = params.calendarId === "primary" ? `/me/events?${qp.toString()}` : `/me/calendars/${params.calendarId}/events?${qp.toString()}`;
      const data = (await graphApi(endpoint, token)) as {
        value?: Array<{ id: string; subject: string; start?: { dateTime?: string; timeZone?: string }; end?: { dateTime?: string; timeZone?: string }; location?: { displayName?: string }; isAllDay?: boolean; showAs?: string; responseStatus?: { response?: string } }>;
        "@odata.nextLink"?: string;
      };
      if (!data.value || data.value.length === 0) return { content: [{ type: "text", text: `No events found in calendar "${params.calendarId}".` }], details: {} };
      const lines = data.value.map(e => {
        const start = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleString() : "(no start)";
        const end = e.end?.dateTime ? new Date(e.end.dateTime).toLocaleString() : "";
        const allDay = e.isAllDay ? " [All day]" : "";
        const loc = e.location?.displayName ? ` @ ${e.location.displayName}` : "";
        return `${e.id} | ${e.subject || "(no subject)"}\n  ${start}${end ? ` → ${end}` : ""}${allDay}${loc}`;
      });
      let text = `Events in calendar "${params.calendarId}" (${data.value.length}):\n\n${lines.join("\n")}`;
      if (data["@odata.nextLink"]) text += "\n\n[More results available]";
      return { content: [{ type: "text", text: truncateResult(text) }], details: { events: data.value, nextLink: data["@odata.nextLink"] } };
    },
  });

  // ── Tool: ms_calendar_create ────────────────────────────────────────────
  pi.registerTool({
    name: "ms_calendar_create", label: "MS Calendar Create Event",
    description: "Create a new event in an Outlook calendar.",
    promptSnippet: "Create a new Outlook calendar event",
    promptGuidelines: ["Confirm subject, start, and end times before creating."],
    parameters: Type.Object({
      subject: Type.String({ description: "Event subject" }),
      startDateTime: Type.String({ description: "Start time (ISO 8601, e.g., '2026-06-02T10:00:00')" }),
      endDateTime: Type.String({ description: "End time (ISO 8601)" }),
      timeZone: Type.Optional(Type.String({ default: "UTC", description: "Time zone (e.g., 'UTC', 'Europe/Stockholm')" })),
      location: Type.Optional(Type.String({ description: "Location name" })),
      body: Type.Optional(Type.String({ description: "Event description" })),
      attendees: Type.Optional(Type.Array(Type.String({ description: "Attendee email addresses" }))),
      isAllDay: Type.Optional(Type.Boolean({ default: false })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const body: Record<string, unknown> = {
        subject: params.subject,
        start: { dateTime: params.startDateTime, timeZone: params.timeZone || "UTC" },
        end: { dateTime: params.endDateTime, timeZone: params.timeZone || "UTC" },
        isAllDay: params.isAllDay || false,
      };
      if (params.body) body.body = { contentType: "text", content: params.body };
      if (params.location) body.location = { displayName: params.location };
      if (params.attendees && params.attendees.length > 0) {
        body.attendees = params.attendees.map(email => ({ emailAddress: { address: email }, type: "required" }));
      }
      const event = (await graphApi(`/me/events`, token, { method: "POST", body: JSON.stringify(body) })) as {
        id: string; subject: string; start?: { dateTime?: string }; end?: { dateTime?: string };
      };
      return { content: [{ type: "text", text: `Event created.\n\nID: ${event.id}\nSubject: ${event.subject}\nStart: ${event.start?.dateTime || ""}\nEnd: ${event.end?.dateTime || ""}` }], details: event };
    },
  });

  // ── Tool: ms_calendar_update ────────────────────────────────────────────
  pi.registerTool({
    name: "ms_calendar_update", label: "MS Calendar Update Event",
    description: "Update an existing Outlook event.",
    promptSnippet: "Update an Outlook calendar event",
    parameters: Type.Object({
      eventId: Type.String({ description: "Event ID" }),
      subject: Type.Optional(Type.String()),
      startDateTime: Type.Optional(Type.String()),
      endDateTime: Type.Optional(Type.String()),
      timeZone: Type.Optional(Type.String()),
      location: Type.Optional(Type.String()),
      body: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const body: Record<string, unknown> = {};
      if (params.subject !== undefined) body.subject = params.subject;
      if (params.startDateTime || params.timeZone) {
        body.start = { dateTime: params.startDateTime || "", timeZone: params.timeZone || "UTC" };
      }
      if (params.endDateTime || params.timeZone) {
        body.end = { dateTime: params.endDateTime || "", timeZone: params.timeZone || "UTC" };
      }
      if (params.location !== undefined) body.location = { displayName: params.location };
      if (params.body !== undefined) body.body = { contentType: "text", content: params.body };
      const event = (await graphApi(`/me/events/${params.eventId}`, token, { method: "PATCH", body: JSON.stringify(body) })) as {
        id: string; subject: string; start?: { dateTime?: string }; end?: { dateTime?: string };
      };
      return { content: [{ type: "text", text: `Event updated.\n\nID: ${event.id}\nSubject: ${event.subject}\nStart: ${event.start?.dateTime || ""}\nEnd: ${event.end?.dateTime || ""}` }], details: event };
    },
  });

  // ── Tool: ms_calendar_delete ────────────────────────────────────────────
  pi.registerTool({
    name: "ms_calendar_delete", label: "MS Calendar Delete Event",
    description: "Delete an Outlook event.",
    promptSnippet: "Delete an Outlook calendar event",
    parameters: Type.Object({ eventId: Type.String({ description: "Event ID" }) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      await graphApi(`/me/events/${params.eventId}`, token, { method: "DELETE" });
      return { content: [{ type: "text", text: `Event ${params.eventId} deleted.` }], details: { deleted: true, eventId: params.eventId } };
    },
  });

  // ── Tool: ms_tasks_lists ────────────────────────────────────────────────
  pi.registerTool({
    name: "ms_tasks_lists", label: "MS Tasks Lists",
    description: "List Microsoft To Do task lists.",
    promptSnippet: "List Microsoft To Do lists",
    parameters: Type.Object({
      top: Type.Optional(Type.Number({ default: 10, maximum: 50, minimum: 1 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const qp = new URLSearchParams();
      if (params.top) qp.set("$top", String(params.top));
      const data = (await graphApi(`/me/todo/lists?${qp.toString()}`, token)) as {
        value?: Array<{ id: string; displayName: string; isOwner?: boolean; isShared?: boolean }>; "@odata.nextLink"?: string;
      };
      if (!data.value || data.value.length === 0) return { content: [{ type: "text", text: "No task lists found." }], details: {} };
      const lines = data.value.map(l => `${l.id} | ${l.displayName}${l.isShared ? " [shared]" : ""}`);
      let text = `Task lists (${data.value.length}):\n\nID | Name\n` + "─".repeat(80) + "\n" + lines.join("\n");
      if (data["@odata.nextLink"]) text += "\n\n[More results available]";
      return { content: [{ type: "text", text: truncateResult(text) }], details: { lists: data.value, nextLink: data["@odata.nextLink"] } };
    },
  });

  // ── Tool: ms_tasks_list ─────────────────────────────────────────────────
  pi.registerTool({
    name: "ms_tasks_list", label: "MS Tasks List",
    description: "List tasks in a Microsoft To Do list.",
    promptSnippet: "List Microsoft To Do tasks",
    promptGuidelines: [
      "Use ms_tasks_list when the user wants to see their to-do items in Outlook/To Do.",
      "The list ID is obtained from ms_tasks_lists.",
    ],
    parameters: Type.Object({
      listId: Type.String({ description: "Task list ID" }),
      top: Type.Optional(Type.Number({ default: 25, maximum: 50, minimum: 1 })),
      filter: Type.Optional(Type.String({ description: "OData filter (e.g., \"status eq 'notStarted'\")" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const qp = new URLSearchParams();
      if (params.top) qp.set("$top", String(params.top));
      if (params.filter) qp.set("$filter", params.filter);
      const data = (await graphApi(`/me/todo/lists/${params.listId}/tasks?${qp.toString()}`, token)) as {
        value?: Array<{ id: string; title: string; status: string; importance?: string; dueDateTime?: { dateTime?: string; timeZone?: string }; body?: { content?: string } }>; "@odata.nextLink"?: string;
      };
      if (!data.value || data.value.length === 0) return { content: [{ type: "text", text: `No tasks found in list "${params.listId}".` }], details: {} };
      const lines = data.value.map(t => {
        const status = t.status === "completed" ? "✓" : "☐";
        const due = t.dueDateTime?.dateTime ? ` | due: ${t.dueDateTime.dateTime}` : "";
        const note = t.body?.content ? ` | notes: ${t.body.content.slice(0, 60)}${t.body.content.length > 60 ? "…" : ""}` : "";
        return `${status} ${t.id} | ${t.title}${due}${note}`;
      });
      let text = `Tasks in list "${params.listId}" (${data.value.length}):\n\n${lines.join("\n")}`;
      if (data["@odata.nextLink"]) text += "\n\n[More results available]";
      return { content: [{ type: "text", text: truncateResult(text) }], details: { tasks: data.value, nextLink: data["@odata.nextLink"] } };
    },
  });

  // ── Tool: ms_tasks_create ───────────────────────────────────────────────
  pi.registerTool({
    name: "ms_tasks_create", label: "MS Tasks Create",
    description: "Create a new task in a Microsoft To Do list.",
    promptSnippet: "Create a Microsoft To Do task",
    promptGuidelines: ["Confirm title and due date before creating."],
    parameters: Type.Object({
      listId: Type.String({ description: "Task list ID" }),
      title: Type.String({ description: "Task title" }),
      body: Type.Optional(Type.String({ description: "Task notes/description" })),
      dueDateTime: Type.Optional(Type.String({ description: "Due date (ISO 8601, e.g., '2026-06-02T12:00:00')" })),
      importance: Type.Optional(StringEnum(["low", "normal", "high"] as const)),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const body: Record<string, unknown> = { title: params.title };
      if (params.body) body.body = { contentType: "text", content: params.body };
      if (params.dueDateTime) body.dueDateTime = { dateTime: params.dueDateTime, timeZone: "UTC" };
      if (params.importance) body.importance = params.importance;
      const task = (await graphApi(`/me/todo/lists/${params.listId}/tasks`, token, { method: "POST", body: JSON.stringify(body) })) as {
        id: string; title: string; status: string; dueDateTime?: { dateTime?: string };
      };
      return { content: [{ type: "text", text: `Task created.\n\nID: ${task.id}\nTitle: ${task.title}\nStatus: ${task.status}${task.dueDateTime?.dateTime ? `\nDue: ${task.dueDateTime.dateTime}` : ""}` }], details: task };
    },
  });

  // ── Tool: ms_tasks_update ────────────────────────────────────────────────
  pi.registerTool({
    name: "ms_tasks_update", label: "MS Tasks Update",
    description: "Update a Microsoft To Do task (title, body, due, status, importance).",
    promptSnippet: "Update a Microsoft To Do task",
    parameters: Type.Object({
      listId: Type.String({ description: "Task list ID" }),
      taskId: Type.String({ description: "Task ID" }),
      title: Type.Optional(Type.String()),
      body: Type.Optional(Type.String()),
      dueDateTime: Type.Optional(Type.String()),
      status: Type.Optional(StringEnum(["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"] as const)),
      importance: Type.Optional(StringEnum(["low", "normal", "high"] as const)),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const body: Record<string, unknown> = {};
      if (params.title !== undefined) body.title = params.title;
      if (params.body !== undefined) body.body = { contentType: "text", content: params.body };
      if (params.dueDateTime !== undefined) body.dueDateTime = { dateTime: params.dueDateTime, timeZone: "UTC" };
      if (params.status !== undefined) body.status = params.status;
      if (params.importance !== undefined) body.importance = params.importance;
      const task = (await graphApi(`/me/todo/lists/${params.listId}/tasks/${params.taskId}`, token, { method: "PATCH", body: JSON.stringify(body) })) as {
        id: string; title: string; status: string; dueDateTime?: { dateTime?: string };
      };
      return { content: [{ type: "text", text: `Task updated.\n\nID: ${task.id}\nTitle: ${task.title}\nStatus: ${task.status}${task.dueDateTime?.dateTime ? `\nDue: ${task.dueDateTime.dateTime}` : ""}` }], details: task };
    },
  });

  // ── Tool: ms_tasks_delete ───────────────────────────────────────────────
  pi.registerTool({
    name: "ms_tasks_delete", label: "MS Tasks Delete",
    description: "Delete a Microsoft To Do task.",
    promptSnippet: "Delete a Microsoft To Do task",
    parameters: Type.Object({
      listId: Type.String({ description: "Task list ID" }),
      taskId: Type.String({ description: "Task ID" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      await graphApi(`/me/todo/lists/${params.listId}/tasks/${params.taskId}`, token, { method: "DELETE" });
      return { content: [{ type: "text", text: `Task ${params.taskId} deleted.` }], details: { deleted: true, taskId: params.taskId } };
    },
  });

  // ── Tool: ms_contacts_list ───────────────────────────────────────────────
  pi.registerTool({
    name: "ms_contacts_list", label: "MS Contacts List",
    description: "List Outlook contacts with pagination.",
    promptSnippet: "List Outlook contacts",
    promptGuidelines: [
      "Use ms_contacts_list when the user wants to see their contacts or find a phone/email.",
    ],
    parameters: Type.Object({
      top: Type.Optional(Type.Number({ default: 25, maximum: 100, minimum: 1 })),
      select: Type.Optional(Type.String({ default: "displayName,emailAddresses,homePhones,businessPhones,mobilePhone", description: "Comma-separated fields" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const qp = new URLSearchParams();
      if (params.top) qp.set("$top", String(params.top));
      if (params.select) qp.set("$select", params.select);
      qp.set("$orderby", "displayName asc");
      const data = (await graphApi(`/me/contacts?${qp.toString()}`, token)) as {
        value?: Array<{ id: string; displayName?: string; emailAddresses?: Array<{ address?: string; name?: string }>; homePhones?: string[]; businessPhones?: string[]; mobilePhone?: string }>; "@odata.nextLink"?: string;
      };
      if (!data.value || data.value.length === 0) return { content: [{ type: "text", text: "No contacts found." }], details: {} };
      const lines = data.value.map(c => {
        const email = c.emailAddresses?.[0]?.address || "";
        const phone = c.mobilePhone || c.homePhones?.[0] || c.businessPhones?.[0] || "";
        return `${c.id} | ${c.displayName || "(unnamed)"}${email ? ` | ${email}` : ""}${phone ? ` | ${phone}` : ""}`;
      });
      let text = `Contacts (${data.value.length}):\n\nID | Name | Email | Phone\n` + "─".repeat(80) + "\n" + lines.join("\n");
      if (data["@odata.nextLink"]) text += "\n\n[More results available]";
      return { content: [{ type: "text", text: truncateResult(text) }], details: { contacts: data.value, nextLink: data["@odata.nextLink"] } };
    },
  });

  // ── Tool: ms_contacts_get ─────────────────────────────────────────────────
  pi.registerTool({
    name: "ms_contacts_get", label: "MS Contacts Get",
    description: "Read a specific Outlook contact by ID.",
    promptSnippet: "Read a specific Outlook contact",
    promptGuidelines: ["The ID is obtained from ms_contacts_list."],
    parameters: Type.Object({
      contactId: Type.String({ description: "Contact ID" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const contact = (await graphApi(`/me/contacts/${params.contactId}`, token)) as {
        id: string; displayName?: string; givenName?: string; surname?: string; emailAddresses?: Array<{ address?: string; name?: string }>;
        homePhones?: string[]; businessPhones?: string[]; mobilePhone?: string; homeAddress?: { street?: string; city?: string; state?: string; countryOrRegion?: string; postalCode?: string };
        businessAddress?: { street?: string; city?: string; state?: string; countryOrRegion?: string; postalCode?: string };
        personalNotes?: string; birthday?: string; jobTitle?: string; companyName?: string;
      };
      const lines: string[] = [];
      lines.push(`┌────────────────────────────────────────────────────────────`);
      lines.push(`│ ID:       ${contact.id}`);
      lines.push(`│ Name:     ${contact.displayName || "(unnamed)"}`);
      if (contact.givenName || contact.surname) lines.push(`│ Name:     ${contact.givenName || ""} ${contact.surname || ""}`);
      if (contact.jobTitle) lines.push(`│ Title:    ${contact.jobTitle}`);
      if (contact.companyName) lines.push(`│ Company:  ${contact.companyName}`);
      if (contact.birthday) lines.push(`│ Birthday: ${contact.birthday}`);
      lines.push(`└────────────────────────────────────────────────────────────`);
      if (contact.emailAddresses && contact.emailAddresses.length > 0) {
        lines.push(`\nEmails:`);
        for (const e of contact.emailAddresses) lines.push(`  • ${e.address || ""}${e.name ? ` (${e.name})` : ""}`);
      }
      if (contact.mobilePhone || (contact.homePhones && contact.homePhones.length > 0) || (contact.businessPhones && contact.businessPhones.length > 0)) {
        lines.push(`\nPhones:`);
        if (contact.mobilePhone) lines.push(`  • Mobile: ${contact.mobilePhone}`);
        for (const p of contact.homePhones || []) lines.push(`  • Home: ${p}`);
        for (const p of contact.businessPhones || []) lines.push(`  • Work: ${p}`);
      }
      if (contact.homeAddress) {
        lines.push(`\nHome Address: ${contact.homeAddress.street || ""}, ${contact.homeAddress.city || ""}, ${contact.homeAddress.countryOrRegion || ""}`);
      }
      if (contact.businessAddress) {
        lines.push(`\nWork Address: ${contact.businessAddress.street || ""}, ${contact.businessAddress.city || ""}, ${contact.businessAddress.countryOrRegion || ""}`);
      }
      if (contact.personalNotes) lines.push(`\nNotes: ${contact.personalNotes}`);
      return { content: [{ type: "text", text: truncateResult(lines.join("\n")) }], details: contact };
    },
  });

  // ── Tool: ms_contacts_create ──────────────────────────────────────────────
  pi.registerTool({
    name: "ms_contacts_create", label: "MS Contacts Create",
    description: "Create a new Outlook contact.",
    promptSnippet: "Create a new Outlook contact",
    promptGuidelines: ["Confirm name and email before creating."],
    parameters: Type.Object({
      givenName: Type.String({ description: "First name" }),
      surname: Type.Optional(Type.String({ description: "Last name" })),
      email: Type.Optional(Type.String({ description: "Email address" })),
      mobilePhone: Type.Optional(Type.String({ description: "Mobile phone" })),
      companyName: Type.Optional(Type.String({ description: "Company" })),
      jobTitle: Type.Optional(Type.String({ description: "Job title" })),
      personalNotes: Type.Optional(Type.String({ description: "Notes" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const body: Record<string, unknown> = { givenName: params.givenName };
      if (params.surname) body.surname = params.surname;
      if (params.email) body.emailAddresses = [{ address: params.email }];
      if (params.mobilePhone) body.mobilePhone = params.mobilePhone;
      if (params.companyName) body.companyName = params.companyName;
      if (params.jobTitle) body.jobTitle = params.jobTitle;
      if (params.personalNotes) body.personalNotes = params.personalNotes;
      const contact = (await graphApi(`/me/contacts`, token, { method: "POST", body: JSON.stringify(body) })) as {
        id: string; displayName?: string;
      };
      return { content: [{ type: "text", text: `Contact created.\n\nID: ${contact.id}\nName: ${contact.displayName || params.givenName}` }], details: contact };
    },
  });

  // ── Tool: ms_contacts_update ──────────────────────────────────────────────
  pi.registerTool({
    name: "ms_contacts_update", label: "MS Contacts Update",
    description: "Update an existing Outlook contact.",
    promptSnippet: "Update an Outlook contact",
    parameters: Type.Object({
      contactId: Type.String({ description: "Contact ID" }),
      givenName: Type.Optional(Type.String()),
      surname: Type.Optional(Type.String()),
      email: Type.Optional(Type.String()),
      mobilePhone: Type.Optional(Type.String()),
      companyName: Type.Optional(Type.String()),
      jobTitle: Type.Optional(Type.String()),
      personalNotes: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const body: Record<string, unknown> = {};
      if (params.givenName !== undefined) body.givenName = params.givenName;
      if (params.surname !== undefined) body.surname = params.surname;
      if (params.email !== undefined) body.emailAddresses = [{ address: params.email }];
      if (params.mobilePhone !== undefined) body.mobilePhone = params.mobilePhone;
      if (params.companyName !== undefined) body.companyName = params.companyName;
      if (params.jobTitle !== undefined) body.jobTitle = params.jobTitle;
      if (params.personalNotes !== undefined) body.personalNotes = params.personalNotes;
      const contact = (await graphApi(`/me/contacts/${params.contactId}`, token, { method: "PATCH", body: JSON.stringify(body) })) as {
        id: string; displayName?: string;
      };
      return { content: [{ type: "text", text: `Contact updated.\n\nID: ${contact.id}\nName: ${contact.displayName || "(unnamed)"}` }], details: contact };
    },
  });

  // ── Tool: ms_contacts_delete ──────────────────────────────────────────────
  pi.registerTool({
    name: "ms_contacts_delete", label: "MS Contacts Delete",
    description: "Delete an Outlook contact.",
    promptSnippet: "Delete an Outlook contact",
    parameters: Type.Object({ contactId: Type.String({ description: "Contact ID" }) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      await graphApi(`/me/contacts/${params.contactId}`, token, { method: "DELETE" });
      return { content: [{ type: "text", text: `Contact ${params.contactId} deleted.` }], details: { deleted: true, contactId: params.contactId } };
    },
  });

  // ── Startup status ───────────────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    if (authState) ctx.ui.setStatus("ms-graph", "📘 Microsoft Graph: authenticated");
    else ctx.ui.setStatus("ms-graph", "📘 Microsoft Graph: not authenticated (run /ms-auth)");
  });
}
