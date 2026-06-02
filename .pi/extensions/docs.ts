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

const DOCS_API_BASE = "https://docs.googleapis.com/v1";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive",
];

const LOCALHOST_PORT_MIN = 8000;
const LOCALHOST_PORT_MAX = 8999;
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let authState: AuthState | null = null;

function getClientId(): string | undefined { return process.env.DOCS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID; }
function getClientSecret(): string | undefined { return process.env.DOCS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET; }
function setAuthState(state: AuthState | null) { authState = state; }
function isTokenExpired(): boolean {
  if (!authState) return true;
  return Date.now() >= authState.expiresAt - 60_000;
}

// Try to restore authState from session entries (google-auth or docs-auth)
function restoreAuthState(ctx: ExtensionContext) {
  if (authState) return;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "docs-auth" && entry.data) {
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

function createLocalAuthServer(expectedState: string, port: number): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${port}`);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<html><body><h1>Auth failed</h1><p>${escapeHtml(error)}</p><p>You can close this tab.</p></body></html>`);
        server.close(); reject(new Error(`OAuth error: ${error}`)); return;
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
  const params = new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" });
  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
  if (!res.ok) { const body = await res.text(); throw new Error(`Token exchange failed (${res.status}): ${body}`); }
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 };
}
async function performAuthFlow(clientId: string, clientSecret: string, ctx: ExtensionContext, pi: ExtensionAPI): Promise<AuthState> {
  const port = getRandomPort();
  const redirectUri = `http://localhost:${port}`;
  const state = generateState();
  const serverPromise = createLocalAuthServer(state, port);
  const authUrl = `${GOOGLE_OAUTH_AUTH_URL}?` + new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(" "), access_type: "offline", prompt: "consent", state }).toString();
  ctx.ui.notify("Opening Docs authorization in browser...", "info");
  try { await pi.exec("open", [authUrl], { timeout: 5000 }); } catch { ctx.ui.notify("Could not open browser automatically.", "warning"); }
  const opened = await ctx.ui.input(`If the browser didn't open, click this link:\n${authUrl}\n\nWaiting for authorization...`, "Press Enter once authorized (or type 'cancel')");
  if (opened?.toLowerCase() === "cancel") throw new Error("Authentication cancelled.");
  const result = await Promise.race([serverPromise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Auth timed out after ${AUTH_TIMEOUT_MS / 1000}s.`)), AUTH_TIMEOUT_MS))]);
  ctx.ui.notify("Exchanging code for tokens...", "info");
  return await exchangeCode(result.code, clientId, clientSecret, redirectUri);
}
async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<{ accessToken: string; expiresAt: number }> {
  const params = new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" });
  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
  if (!res.ok) { const body = await res.text(); throw new Error(`Token refresh failed (${res.status}): ${body}`); }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
}
async function ensureValidToken(ctx: ExtensionContext, pi: ExtensionAPI): Promise<string> {
  restoreAuthState(ctx);
  const clientId = getClientId(); const clientSecret = getClientSecret();
  if (!clientId || !clientSecret) throw new Error("DOCS_CLIENT_ID (or GOOGLE_CLIENT_ID) and DOCS_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) must be set.");
  if (!authState) throw new Error("Not authenticated. Run /docs-auth or use docs_auth.");
  if (isTokenExpired()) {
    ctx.ui.notify("Docs token expired, refreshing...", "warning");
    const refreshed = await refreshAccessToken(authState.refreshToken, clientId, clientSecret);
    authState.accessToken = refreshed.accessToken; authState.expiresAt = refreshed.expiresAt;
    pi.appendEntry("docs-auth", { ...authState });
  }
  return authState.accessToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────

async function docsApi(endpoint: string, accessToken: string, options: RequestInit = {}): Promise<unknown> {
  const url = `${DOCS_API_BASE}${endpoint}`;
  const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json", ...(options.headers || {}) } });
  if (!res.ok) { const body = await res.text(); throw new Error(`Docs API error (${res.status}): ${body}`); }
  return res.json();
}
async function driveApi(endpoint: string, accessToken: string, options: RequestInit = {}): Promise<unknown> {
  const url = `${DRIVE_API_BASE}${endpoint}`;
  const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json", ...(options.headers || {}) } });
  if (!res.ok) { const body = await res.text(); throw new Error(`Drive API error (${res.status}): ${body}`); }
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
      if (entry.type === "custom" && entry.customType === "docs-auth" && entry.data) {
        const data = entry.data as AuthState;
        if (data.accessToken && data.refreshToken) authState = data;
      }
      if (entry.type === "custom" && entry.customType === "google-auth" && entry.data && !authState) {
        const data = entry.data as AuthState;
        if (data.accessToken && data.refreshToken) authState = data;
      }
    }
  });

  // ── Command ─────────────────────────────────────────────────────────────
  pi.registerCommand("docs-auth", {
    description: "Authenticate with Google Docs OAuth",
    handler: async (_args, ctx) => {
      const clientId = getClientId(); const clientSecret = getClientSecret();
      if (!clientId || !clientSecret) { ctx.ui.notify("DOCS_CLIENT_ID (or GOOGLE_CLIENT_ID) and DOCS_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) must be set.", "error"); return; }
      if (authState) {
        const ok = await ctx.ui.confirm("Docs Auth", "Already authenticated. Re-authenticate?");
        if (!ok) { ctx.ui.notify("Keeping existing Docs auth.", "info"); return; }
      }
      try {
        const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
        authState = state; pi.appendEntry("docs-auth", { ...state });
        ctx.ui.setStatus("docs", "📄 Docs: authenticated");
        ctx.ui.notify("Docs authentication successful!", "success");
      } catch (err) {
        ctx.ui.setStatus("docs", "📄 Docs: not authenticated (run /docs-auth)");
        ctx.ui.notify(`Auth failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  // ── Tool: docs_auth ───────────────────────────────────────────────────
  pi.registerTool({
    name: "docs_auth", label: "Docs Auth",
    description: "Check Google Docs auth status or initiate OAuth flow.",
    promptSnippet: "Authenticate with Google Docs to enable document access",
    promptGuidelines: ["Use docs_auth before any other docs tool if unsure about auth status."],
    parameters: Type.Object({ action: StringEnum(["status", "authenticate"] as const) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const clientId = getClientId(); const clientSecret = getClientSecret();
      if (!clientId || !clientSecret) throw new Error("DOCS_CLIENT_ID and DOCS_CLIENT_SECRET required.");
      if (params.action === "status") {
        restoreAuthState(ctx);
        if (authState) return { content: [{ type: "text", text: `Authenticated. Token expires at ${new Date(authState.expiresAt).toISOString()}.` }], details: { authenticated: true } };
        return { content: [{ type: "text", text: "Not authenticated. Run /docs-auth or use action=authenticate." }], details: { authenticated: false } };
      }
      const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
      authState = state; pi.appendEntry("docs-auth", { ...state });
      ctx.ui.setStatus("docs", "📄 Docs: authenticated");
      return { content: [{ type: "text", text: "Docs authentication successful." }], details: { authenticated: true } };
    },
  });

  // ── Tool: docs_list ───────────────────────────────────────────────────
  pi.registerTool({
    name: "docs_list", label: "Docs List",
    description: "List Google Docs documents via Drive API.",
    promptSnippet: "List Google Docs documents",
    promptGuidelines: ["Uses Drive API to find documents with mimeType='application/vnd.google-apps.document'."],
    parameters: Type.Object({
      pageSize: Type.Optional(Type.Number({ default: 20, maximum: 100, minimum: 1 })),
      pageToken: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const qp = new URLSearchParams();
      qp.set("pageSize", String(params.pageSize || 20));
      qp.set("fields", "nextPageToken,files(id,name,modifiedTime,createdTime,webViewLink)");
      qp.set("q", "mimeType='application/vnd.google-apps.document' and trashed=false");
      if (params.pageToken) qp.set("pageToken", params.pageToken);
      const data = (await driveApi(`/files?${qp.toString()}`, token)) as {
        files?: Array<{ id: string; name: string; modifiedTime?: string; createdTime?: string; webViewLink?: string }>;
        nextPageToken?: string;
      };
      if (!data.files || data.files.length === 0) return { content: [{ type: "text", text: "No documents found." }], details: {} };
      const lines = data.files.map(f => `${f.id} | ${f.name}${f.modifiedTime ? ` | modified: ${f.modifiedTime}` : ""}`);
      let text = `Documents (${data.files.length}):\n\nID | Title | Modified\n` + "─".repeat(80) + "\n" + lines.join("\n");
      if (data.nextPageToken) text += `\n\n[nextPageToken: ${data.nextPageToken}]`;
      return { content: [{ type: "text", text: truncateResult(text) }], details: { files: data.files, nextPageToken: data.nextPageToken } };
    },
  });

  // ── Tool: docs_read ───────────────────────────────────────────────────
  pi.registerTool({
    name: "docs_read", label: "Docs Read",
    description: "Read a Google Doc by ID and extract plain text content.",
    promptSnippet: "Read a Google Doc document",
    promptGuidelines: [
      "The document ID is obtained from docs_list or the URL (e.g., from docs.google.com/document/d/ID/edit).",
      "Returns plain text extracted from the document body.",
    ],
    parameters: Type.Object({
      documentId: Type.String({ description: "Document ID (from URL or docs_list)" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const doc = (await docsApi(`/documents/${params.documentId}`, token)) as {
        documentId: string; title: string; body?: { content?: Array<{ paragraph?: { elements?: Array<{ textRun?: { content?: string } }> } }> };
      };
      const lines: string[] = [];
      lines.push(`┌────────────────────────────────────────────────────────────`);
      lines.push(`│ ID:    ${doc.documentId}`);
      lines.push(`│ Title: ${doc.title}`);
      lines.push(`└────────────────────────────────────────────────────────────`);
      const paragraphs: string[] = [];
      for (const section of doc.body?.content || []) {
        if (section.paragraph) {
          const text = (section.paragraph.elements || []).map(e => e.textRun?.content || "").join("");
          if (text.trim()) paragraphs.push(text);
        }
      }
      if (paragraphs.length > 0) {
        lines.push(`\n--- Content ---\n${paragraphs.join("\n\n")}`);
      } else {
        lines.push(`\n[Document has no extractable text content]`);
      }
      return { content: [{ type: "text", text: truncateResult(lines.join("\n")) }], details: { documentId: doc.documentId, title: doc.title } };
    },
  });

  // ── Tool: docs_create ─────────────────────────────────────────────────
  pi.registerTool({
    name: "docs_create", label: "Docs Create",
    description: "Create a new Google Doc with optional title and initial content.",
    promptSnippet: "Create a new Google Doc",
    promptGuidelines: ["Confirm title and content before creating."],
    parameters: Type.Object({
      title: Type.String({ description: "Document title" }),
      content: Type.Optional(Type.String({ description: "Initial document body text" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const doc = (await docsApi(`/documents`, token, { method: "POST", body: JSON.stringify({ title: params.title }) })) as {
        documentId: string; title: string;
      };
      if (params.content && params.content.trim()) {
        const requests = [{ insertText: { location: { index: 1 }, text: params.content } }];
        await docsApi(`/documents/${doc.documentId}:batchUpdate`, token, { method: "POST", body: JSON.stringify({ requests }) });
      }
      return { content: [{ type: "text", text: `Document created.\n\nID: ${doc.documentId}\nTitle: ${doc.title}\n${params.content ? `Content: ${params.content.slice(0, 100)}...` : ""}` }], details: doc };
    },
  });

  // ── Tool: docs_append ─────────────────────────────────────────────────
  pi.registerTool({
    name: "docs_append", label: "Docs Append",
    description: "Append text to the end of a Google Doc.",
    promptSnippet: "Append text to a Google Doc",
    promptGuidelines: ["The document ID is obtained from docs_list or docs_create."],
    parameters: Type.Object({
      documentId: Type.String({ description: "Document ID" }),
      text: Type.String({ description: "Text to append" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const doc = (await docsApi(`/documents/${params.documentId}`, token)) as { documentId: string; title: string; body?: { content?: Array<unknown> } };
      const endIndex = (doc.body?.content?.length || 1);
      const requests = [{ insertText: { location: { index: endIndex }, text: params.text } }];
      await docsApi(`/documents/${params.documentId}:batchUpdate`, token, { method: "POST", body: JSON.stringify({ requests }) });
      return { content: [{ type: "text", text: `Text appended to "${doc.title}".\n\nAppended: ${params.text.slice(0, 100)}${params.text.length > 100 ? "..." : ""}` }], details: { documentId: doc.documentId, title: doc.title } };
    },
  });

  // ── Tool: docs_update ─────────────────────────────────────────────────
  pi.registerTool({
    name: "docs_update", label: "Docs Update",
    description: "Replace text in a Google Doc (find and replace).",
    promptSnippet: "Find and replace text in a Google Doc",
    parameters: Type.Object({
      documentId: Type.String({ description: "Document ID" }),
      find: Type.String({ description: "Text to find" }),
      replace: Type.String({ description: "Replacement text" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const requests = [{ replaceAllText: { containsText: { text: params.find, matchCase: true }, replaceText: params.replace } }];
      const result = (await docsApi(`/documents/${params.documentId}:batchUpdate`, token, { method: "POST", body: JSON.stringify({ requests }) })) as { replies?: Array<{ replaceAllText?: { occurrencesChanged?: number } }> };
      const changed = result.replies?.[0]?.replaceAllText?.occurrencesChanged || 0;
      return { content: [{ type: "text", text: `Replaced "${params.find}" with "${params.replace}" in document.\nOccurrences changed: ${changed}` }], details: { changed, documentId: params.documentId } };
    },
  });

  // ── Startup status ───────────────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    if (authState) ctx.ui.setStatus("docs", "📄 Docs: authenticated");
    else ctx.ui.setStatus("docs", "📄 Docs: not authenticated (run /docs-auth or /google-auth)");
  });
}
