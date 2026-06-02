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

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
];

const LOCALHOST_PORT_MIN = 8000;
const LOCALHOST_PORT_MAX = 8999;
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let authState: AuthState | null = null;

function getClientId(): string | undefined { return process.env.DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID; }
function getClientSecret(): string | undefined { return process.env.DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET; }
function setAuthState(state: AuthState | null) { authState = state; }
function isTokenExpired(): boolean {
  if (!authState) return true;
  return Date.now() >= authState.expiresAt - 60_000;
}

// Try to restore authState from session entries (google-auth or drive-auth)
function restoreAuthState(ctx: ExtensionContext) {
  if (authState) return;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "drive-auth" && entry.data) {
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
  ctx.ui.notify("Opening Drive authorization in browser...", "info");
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
  if (!clientId || !clientSecret) throw new Error("DRIVE_CLIENT_ID (or GOOGLE_CLIENT_ID) and DRIVE_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) must be set.");
  if (!authState) throw new Error("Not authenticated. Run /drive-auth or use drive_auth.");
  if (isTokenExpired()) {
    ctx.ui.notify("Drive token expired, refreshing...", "warning");
    const refreshed = await refreshAccessToken(authState.refreshToken, clientId, clientSecret);
    authState.accessToken = refreshed.accessToken; authState.expiresAt = refreshed.expiresAt;
    pi.appendEntry("drive-auth", { ...authState });
  }
  return authState.accessToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// Drive API helpers
// ─────────────────────────────────────────────────────────────────────────────

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
      if (entry.type === "custom" && entry.customType === "drive-auth" && entry.data) {
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
  pi.registerCommand("drive-auth", {
    description: "Authenticate with Google Drive OAuth",
    handler: async (_args, ctx) => {
      const clientId = getClientId(); const clientSecret = getClientSecret();
      if (!clientId || !clientSecret) { ctx.ui.notify("DRIVE_CLIENT_ID (or GOOGLE_CLIENT_ID) and DRIVE_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) must be set.", "error"); return; }
      if (authState) {
        const ok = await ctx.ui.confirm("Drive Auth", "Already authenticated. Re-authenticate?");
        if (!ok) { ctx.ui.notify("Keeping existing Drive auth.", "info"); return; }
      }
      try {
        const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
        authState = state; pi.appendEntry("drive-auth", { ...state });
        ctx.ui.setStatus("drive", "💾 Drive: authenticated");
        ctx.ui.notify("Drive authentication successful!", "success");
      } catch (err) {
        ctx.ui.setStatus("drive", "💾 Drive: not authenticated (run /drive-auth)");
        ctx.ui.notify(`Auth failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  // ── Tool: drive_auth ──────────────────────────────────────────────────
  pi.registerTool({
    name: "drive_auth", label: "Drive Auth",
    description: "Check Google Drive auth status or initiate OAuth flow.",
    promptSnippet: "Authenticate with Google Drive to enable file access",
    promptGuidelines: ["Use drive_auth before any other drive tool if unsure about auth status."],
    parameters: Type.Object({ action: StringEnum(["status", "authenticate"] as const) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const clientId = getClientId(); const clientSecret = getClientSecret();
      if (!clientId || !clientSecret) throw new Error("DRIVE_CLIENT_ID and DRIVE_CLIENT_SECRET required.");
      if (params.action === "status") {
        restoreAuthState(ctx);
        if (authState) return { content: [{ type: "text", text: `Authenticated. Token expires at ${new Date(authState.expiresAt).toISOString()}.` }], details: { authenticated: true } };
        return { content: [{ type: "text", text: "Not authenticated. Run /drive-auth or use action=authenticate." }], details: { authenticated: false } };
      }
      const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
      authState = state; pi.appendEntry("drive-auth", { ...state });
      ctx.ui.setStatus("drive", "💾 Drive: authenticated");
      return { content: [{ type: "text", text: "Drive authentication successful." }], details: { authenticated: true } };
    },
  });

  // ── Tool: drive_list_files ──────────────────────────────────────────────
  pi.registerTool({
    name: "drive_list_files", label: "Drive List",
    description: "List files in Google Drive with optional filtering by folder, mimeType, or search query.",
    promptSnippet: "List files in Google Drive",
    promptGuidelines: [
      "Use drive_list_files when the user wants to see their files or find a specific file.",
      "Common mimeTypes: 'application/vnd.google-apps.folder', 'application/vnd.google-apps.document', 'application/vnd.google-apps.spreadsheet'",
    ],
    parameters: Type.Object({
      folderId: Type.Optional(Type.String({ default: "root", description: "Folder ID (default: root)" })),
      query: Type.Optional(Type.String({ description: "Drive search query (e.g., \"mimeType='application/pdf'\")" })),
      pageSize: Type.Optional(Type.Number({ default: 20, maximum: 100, minimum: 1 })),
      pageToken: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const qp = new URLSearchParams();
      qp.set("pageSize", String(params.pageSize || 20));
      qp.set("fields", "nextPageToken,files(id,name,mimeType,modifiedTime,size,parents,webViewLink,trashed)");
      if (params.pageToken) qp.set("pageToken", params.pageToken);
      if (params.query) {
        qp.set("q", params.query);
      } else if (params.folderId) {
        qp.set("q", `'${params.folderId}' in parents and trashed=false`);
      }
      const data = (await driveApi(`/files?${qp.toString()}`, token)) as {
        files?: Array<{ id: string; name: string; mimeType: string; modifiedTime?: string; size?: string; parents?: string[]; webViewLink?: string; trashed?: boolean }>;
        nextPageToken?: string;
      };
      if (!data.files || data.files.length === 0) return { content: [{ type: "text", text: "No files found." }], details: {} };
      const lines = data.files.map(f => {
        const icon = f.mimeType === "application/vnd.google-apps.folder" ? "📁" : "📄";
        const size = f.size ? ` | ${formatBytes(Number(f.size))}` : "";
        return `${icon} ${f.id} | ${f.name}${size}`;
      });
      let text = `Files (${data.files.length}):\n\nType | ID | Name | Size\n` + "─".repeat(80) + "\n" + lines.join("\n");
      if (data.nextPageToken) text += `\n\n[nextPageToken: ${data.nextPageToken}]`;
      return { content: [{ type: "text", text: truncateResult(text) }], details: { files: data.files, nextPageToken: data.nextPageToken } };
    },
  });

  // ── Tool: drive_get_file ────────────────────────────────────────────────
  pi.registerTool({
    name: "drive_get_file", label: "Drive Get File",
    description: "Get metadata for a specific file by ID.",
    promptSnippet: "Get file metadata from Google Drive",
    promptGuidelines: ["The file ID is obtained from drive_list_files."],
    parameters: Type.Object({
      fileId: Type.String({ description: "File ID" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const file = (await driveApi(`/files/${params.fileId}?fields=id,name,mimeType,modifiedTime,createdTime,size,parents,webViewLink,webContentLink,trashed,description,owners`, token)) as {
        id: string; name: string; mimeType: string; modifiedTime?: string; createdTime?: string; size?: string;
        parents?: string[]; webViewLink?: string; webContentLink?: string; trashed?: boolean; description?: string;
        owners?: Array<{ displayName?: string; emailAddress?: string }>;
      };
      const lines: string[] = [];
      lines.push(`┌────────────────────────────────────────────────────────────`);
      lines.push(`│ ID:       ${file.id}`);
      lines.push(`│ Name:     ${file.name}`);
      lines.push(`│ Type:     ${file.mimeType}`);
      if (file.size) lines.push(`│ Size:     ${formatBytes(Number(file.size))}`);
      if (file.createdTime) lines.push(`│ Created:  ${file.createdTime}`);
      if (file.modifiedTime) lines.push(`│ Modified: ${file.modifiedTime}`);
      if (file.description) lines.push(`│ Description: ${file.description}`);
      if (file.trashed) lines.push(`│ Status:   TRASHED`);
      if (file.owners && file.owners.length > 0) lines.push(`│ Owner:    ${file.owners[0].displayName || file.owners[0].emailAddress || ""}`);
      lines.push(`└────────────────────────────────────────────────────────────`);
      if (file.webViewLink) lines.push(`\nView: ${file.webViewLink}`);
      if (file.webContentLink) lines.push(`Download: ${file.webContentLink}`);
      return { content: [{ type: "text", text: truncateResult(lines.join("\n")) }], details: file };
    },
  });

  // ── Tool: drive_create_folder ─────────────────────────────────────────
  pi.registerTool({
    name: "drive_create_folder", label: "Drive Create Folder",
    description: "Create a new folder in Google Drive.",
    promptSnippet: "Create a new folder in Google Drive",
    parameters: Type.Object({
      name: Type.String({ description: "Folder name" }),
      parentId: Type.Optional(Type.String({ default: "root", description: "Parent folder ID (default: root)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const body = {
        name: params.name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [params.parentId || "root"],
      };
      const folder = (await driveApi(`/files`, token, { method: "POST", body: JSON.stringify(body) })) as {
        id: string; name: string; mimeType: string;
      };
      return { content: [{ type: "text", text: `Folder created.\n\nID: ${folder.id}\nName: ${folder.name}` }], details: folder };
    },
  });

  // ── Tool: drive_trash_file ──────────────────────────────────────────────
  pi.registerTool({
    name: "drive_trash_file", label: "Drive Trash File",
    description: "Move a file to trash (or permanently delete).",
    promptSnippet: "Move a file to trash in Google Drive",
    parameters: Type.Object({
      fileId: Type.String({ description: "File ID" }),
      permanent: Type.Optional(Type.Boolean({ default: false, description: "Permanently delete (skip trash)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      if (params.permanent) {
        await driveApi(`/files/${params.fileId}`, token, { method: "DELETE" });
        return { content: [{ type: "text", text: `File ${params.fileId} permanently deleted.` }], details: { deleted: true, fileId: params.fileId } };
      } else {
        await driveApi(`/files/${params.fileId}`, token, { method: "PATCH", body: JSON.stringify({ trashed: true }) });
        return { content: [{ type: "text", text: `File ${params.fileId} moved to trash.` }], details: { trashed: true, fileId: params.fileId } };
      }
    },
  });

  // ── Tool: drive_search_files ────────────────────────────────────────────
  pi.registerTool({
    name: "drive_search_files", label: "Drive Search",
    description: "Search Google Drive files by name or query.",
    promptSnippet: "Search Google Drive files",
    promptGuidelines: [
      "Use drive_search_files when the user wants to find a file by name.",
      "The query uses Google Drive query syntax. Example: name contains 'report'",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Drive search query (e.g., \"name contains 'budget'\")" }),
      pageSize: Type.Optional(Type.Number({ default: 20, maximum: 100, minimum: 1 })),
      pageToken: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const qp = new URLSearchParams();
      qp.set("pageSize", String(params.pageSize || 20));
      qp.set("fields", "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)");
      qp.set("q", params.query);
      if (params.pageToken) qp.set("pageToken", params.pageToken);
      const data = (await driveApi(`/files?${qp.toString()}`, token)) as {
        files?: Array<{ id: string; name: string; mimeType: string; modifiedTime?: string; size?: string; webViewLink?: string }>;
        nextPageToken?: string;
      };
      if (!data.files || data.files.length === 0) return { content: [{ type: "text", text: `No files found for query: ${params.query}` }], details: {} };
      const lines = data.files.map(f => {
        const icon = f.mimeType === "application/vnd.google-apps.folder" ? "📁" : "📄";
        const size = f.size ? ` | ${formatBytes(Number(f.size))}` : "";
        return `${icon} ${f.id} | ${f.name}${size}`;
      });
      let text = `Search results (${data.files.length}):\n\n${lines.join("\n")}`;
      if (data.nextPageToken) text += `\n\n[nextPageToken: ${data.nextPageToken}]`;
      return { content: [{ type: "text", text: truncateResult(text) }], details: { files: data.files, nextPageToken: data.nextPageToken } };
    },
  });

  // ── Startup status ───────────────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    if (authState) ctx.ui.setStatus("drive", "💾 Drive: authenticated");
    else ctx.ui.setStatus("drive", "💾 Drive: not authenticated (run /drive-auth or /google-auth)");
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
