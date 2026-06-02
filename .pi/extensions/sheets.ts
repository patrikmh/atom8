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

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.readonly",
];

const LOCALHOST_PORT_MIN = 8000;
const LOCALHOST_PORT_MAX = 8999;
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let authState: AuthState | null = null;

function getClientId(): string | undefined { return process.env.SHEETS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID; }
function getClientSecret(): string | undefined { return process.env.SHEETS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET; }
function setAuthState(state: AuthState | null) { authState = state; }
function isTokenExpired(): boolean {
  if (!authState) return true;
  return Date.now() >= authState.expiresAt - 60_000;
}

// Try to restore authState from session entries (google-auth or sheets-auth)
function restoreAuthState(ctx: ExtensionContext) {
  if (authState) return;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "sheets-auth" && entry.data) {
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
  ctx.ui.notify("Opening Sheets authorization in browser...", "info");
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
  if (!clientId || !clientSecret) throw new Error("SHEETS_CLIENT_ID (or GOOGLE_CLIENT_ID) and SHEETS_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) must be set.");
  if (!authState) throw new Error("Not authenticated. Run /sheets-auth or use sheets_auth.");
  if (isTokenExpired()) {
    ctx.ui.notify("Sheets token expired, refreshing...", "warning");
    const refreshed = await refreshAccessToken(authState.refreshToken, clientId, clientSecret);
    authState.accessToken = refreshed.accessToken; authState.expiresAt = refreshed.expiresAt;
    pi.appendEntry("sheets-auth", { ...authState });
  }
  return authState.accessToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────

async function sheetsApi(endpoint: string, accessToken: string, options: RequestInit = {}): Promise<unknown> {
  const url = `${SHEETS_API_BASE}${endpoint}`;
  const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json", ...(options.headers || {}) } });
  if (!res.ok) { const body = await res.text(); throw new Error(`Sheets API error (${res.status}): ${body}`); }
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

function formatGrid(values: unknown[][]): string {
  if (!values || values.length === 0) return "(empty)";
  const maxCol = Math.max(...values.map(r => r.length));
  const colWidths: number[] = [];
  for (let c = 0; c < maxCol; c++) {
    let max = 0;
    for (const row of values) {
      const cell = String(row[c] || "");
      max = Math.max(max, cell.length);
    }
    colWidths.push(Math.min(max, 30) + 2);
  }
  const lines: string[] = [];
  const sep = colWidths.map(w => "─".repeat(w)).join("┼");
  for (const row of values) {
    const cells = [];
    for (let c = 0; c < maxCol; c++) {
      const cell = String(row[c] || "");
      const padded = cell.length > 28 ? cell.slice(0, 28) + "…" : cell;
      cells.push(padded.padEnd(colWidths[c]));
    }
    lines.push(cells.join("│"));
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension
// ─────────────────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "sheets-auth" && entry.data) {
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
  pi.registerCommand("sheets-auth", {
    description: "Authenticate with Google Sheets OAuth",
    handler: async (_args, ctx) => {
      const clientId = getClientId(); const clientSecret = getClientSecret();
      if (!clientId || !clientSecret) { ctx.ui.notify("SHEETS_CLIENT_ID (or GOOGLE_CLIENT_ID) and SHEETS_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) must be set.", "error"); return; }
      if (authState) {
        const ok = await ctx.ui.confirm("Sheets Auth", "Already authenticated. Re-authenticate?");
        if (!ok) { ctx.ui.notify("Keeping existing Sheets auth.", "info"); return; }
      }
      try {
        const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
        authState = state; pi.appendEntry("sheets-auth", { ...state });
        ctx.ui.setStatus("sheets", "📊 Sheets: authenticated");
        ctx.ui.notify("Sheets authentication successful!", "success");
      } catch (err) {
        ctx.ui.setStatus("sheets", "📊 Sheets: not authenticated (run /sheets-auth)");
        ctx.ui.notify(`Auth failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  // ── Tool: sheets_auth ─────────────────────────────────────────────────
  pi.registerTool({
    name: "sheets_auth", label: "Sheets Auth",
    description: "Check Google Sheets auth status or initiate OAuth flow.",
    promptSnippet: "Authenticate with Google Sheets to enable spreadsheet access",
    promptGuidelines: ["Use sheets_auth before any other sheets tool if unsure about auth status."],
    parameters: Type.Object({ action: StringEnum(["status", "authenticate"] as const) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const clientId = getClientId(); const clientSecret = getClientSecret();
      if (!clientId || !clientSecret) throw new Error("SHEETS_CLIENT_ID and SHEETS_CLIENT_SECRET required.");
      if (params.action === "status") {
        restoreAuthState(ctx);
        if (authState) return { content: [{ type: "text", text: `Authenticated. Token expires at ${new Date(authState.expiresAt).toISOString()}.` }], details: { authenticated: true } };
        return { content: [{ type: "text", text: "Not authenticated. Run /sheets-auth or use action=authenticate." }], details: { authenticated: false } };
      }
      const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
      authState = state; pi.appendEntry("sheets-auth", { ...state });
      ctx.ui.setStatus("sheets", "📊 Sheets: authenticated");
      return { content: [{ type: "text", text: "Sheets authentication successful." }], details: { authenticated: true } };
    },
  });

  // ── Tool: sheets_list ─────────────────────────────────────────────────
  pi.registerTool({
    name: "sheets_list", label: "Sheets List",
    description: "List Google Sheets spreadsheets via Drive API.",
    promptSnippet: "List Google Sheets spreadsheets",
    parameters: Type.Object({
      pageSize: Type.Optional(Type.Number({ default: 20, maximum: 100, minimum: 1 })),
      pageToken: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const qp = new URLSearchParams();
      qp.set("pageSize", String(params.pageSize || 20));
      qp.set("fields", "nextPageToken,files(id,name,modifiedTime,createdTime,webViewLink)");
      qp.set("q", "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
      if (params.pageToken) qp.set("pageToken", params.pageToken);
      const data = (await driveApi(`/files?${qp.toString()}`, token)) as {
        files?: Array<{ id: string; name: string; modifiedTime?: string; createdTime?: string; webViewLink?: string }>;
        nextPageToken?: string;
      };
      if (!data.files || data.files.length === 0) return { content: [{ type: "text", text: "No spreadsheets found." }], details: {} };
      const lines = data.files.map(f => `${f.id} | ${f.name}${f.modifiedTime ? ` | modified: ${f.modifiedTime}` : ""}`);
      let text = `Spreadsheets (${data.files.length}):\n\nID | Title | Modified\n` + "─".repeat(80) + "\n" + lines.join("\n");
      if (data.nextPageToken) text += `\n\n[nextPageToken: ${data.nextPageToken}]`;
      return { content: [{ type: "text", text: truncateResult(text) }], details: { files: data.files, nextPageToken: data.nextPageToken } };
    },
  });

  // ── Tool: sheets_read ─────────────────────────────────────────────────
  pi.registerTool({
    name: "sheets_read", label: "Sheets Read",
    description: "Read cell values from a Google Sheet range.",
    promptSnippet: "Read values from a Google Sheet",
    promptGuidelines: [
      "The spreadsheet ID is obtained from sheets_list or the URL (e.g., from docs.google.com/spreadsheets/d/ID/edit).",
      "Range is A1 notation (e.g., 'Sheet1!A1:D10' or just 'A1:D10').",
    ],
    parameters: Type.Object({
      spreadsheetId: Type.String({ description: "Spreadsheet ID" }),
      range: Type.String({ default: "Sheet1", description: "Cell range in A1 notation (e.g., 'Sheet1!A1:D10')" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const data = (await sheetsApi(`/spreadsheets/${params.spreadsheetId}/values/${encodeURIComponent(params.range)}`, token)) as {
        range?: string; majorDimension?: string; values?: unknown[][];
      };
      if (!data.values || data.values.length === 0) {
        return { content: [{ type: "text", text: `Range "${data.range || params.range}" is empty.` }], details: { range: data.range, values: [] } };
      }
      const text = `Range: ${data.range || params.range}\n\n${formatGrid(data.values)}\n\n(${data.values.length} rows, ${data.values[0]?.length || 0} columns)`;
      return { content: [{ type: "text", text: truncateResult(text) }], details: { range: data.range, values: data.values } };
    },
  });

  // ── Tool: sheets_write ────────────────────────────────────────────────
  pi.registerTool({
    name: "sheets_write", label: "Sheets Write",
    description: "Write values to a Google Sheet range (overwrites existing).",
    promptSnippet: "Write values to a Google Sheet",
    promptGuidelines: [
      "Confirm range and values before writing — this overwrites existing data.",
      "Values is a 2D array: [['A1', 'B1'], ['A2', 'B2']].",
    ],
    parameters: Type.Object({
      spreadsheetId: Type.String({ description: "Spreadsheet ID" }),
      range: Type.String({ description: "Cell range in A1 notation (e.g., 'Sheet1!A1:B2')" }),
      values: Type.Array(Type.Array(Type.String()), { description: "2D array of strings to write" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const body = { range: params.range, majorDimension: "ROWS", values: params.values };
      const result = (await sheetsApi(`/spreadsheets/${params.spreadsheetId}/values/${encodeURIComponent(params.range)}?valueInputOption=RAW`, token, { method: "PUT", body: JSON.stringify(body) })) as {
        updatedRange?: string; updatedRows?: number; updatedColumns?: number;
      };
      return { content: [{ type: "text", text: `Written to ${result.updatedRange || params.range}.\nRows: ${result.updatedRows || params.values.length}, Columns: ${result.updatedColumns || params.values[0]?.length || 0}` }], details: result };
    },
  });

  // ── Tool: sheets_append ───────────────────────────────────────────────
  pi.registerTool({
    name: "sheets_append", label: "Sheets Append",
    description: "Append rows to the end of a Google Sheet.",
    promptSnippet: "Append rows to a Google Sheet",
    promptGuidelines: [
      "Appends after the last row with data in the range.",
      "Values is a 2D array of rows.",
    ],
    parameters: Type.Object({
      spreadsheetId: Type.String({ description: "Spreadsheet ID" }),
      range: Type.String({ description: "Sheet name or range (e.g., 'Sheet1')" }),
      values: Type.Array(Type.Array(Type.String()), { description: "2D array of rows to append" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const body = { range: params.range, majorDimension: "ROWS", values: params.values };
      const result = (await sheetsApi(`/spreadsheets/${params.spreadsheetId}/values/${encodeURIComponent(params.range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, token, { method: "POST", body: JSON.stringify(body) })) as {
        updates?: { updatedRange?: string; updatedRows?: number; updatedColumns?: number };
      };
      return { content: [{ type: "text", text: `Appended to ${result.updates?.updatedRange || params.range}.\nRows: ${result.updates?.updatedRows || params.values.length}, Columns: ${result.updates?.updatedColumns || params.values[0]?.length || 0}` }], details: result };
    },
  });

  // ── Tool: sheets_clear ─────────────────────────────────────────────────
  pi.registerTool({
    name: "sheets_clear", label: "Sheets Clear",
    description: "Clear values from a Google Sheet range.",
    promptSnippet: "Clear a range in a Google Sheet",
    parameters: Type.Object({
      spreadsheetId: Type.String({ description: "Spreadsheet ID" }),
      range: Type.String({ description: "Cell range in A1 notation" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const result = (await sheetsApi(`/spreadsheets/${params.spreadsheetId}/values/${encodeURIComponent(params.range)}:clear`, token, { method: "POST" })) as {
        clearedRange?: string;
      };
      return { content: [{ type: "text", text: `Cleared ${result.clearedRange || params.range}.` }], details: result };
    },
  });

  // ── Tool: sheets_create ────────────────────────────────────────────────
  pi.registerTool({
    name: "sheets_create", label: "Sheets Create",
    description: "Create a new Google Sheet.",
    promptSnippet: "Create a new Google Sheet",
    promptGuidelines: ["Confirm title before creating."],
    parameters: Type.Object({
      title: Type.String({ description: "Spreadsheet title" }),
      sheetNames: Type.Optional(Type.Array(Type.String(), { description: "Sheet/tab names (default: Sheet1)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const body: Record<string, unknown> = { properties: { title: params.title } };
      if (params.sheetNames && params.sheetNames.length > 0) {
        body.sheets = params.sheetNames.map(name => ({ properties: { title: name } }));
      }
      const sheet = (await sheetsApi(`/spreadsheets`, token, { method: "POST", body: JSON.stringify(body) })) as {
        spreadsheetId: string; properties?: { title?: string }; sheets?: Array<{ properties?: { title?: string } }>;
      };
      const sheets = sheet.sheets?.map(s => s.properties?.title).filter(Boolean).join(", ") || "Sheet1";
      return { content: [{ type: "text", text: `Spreadsheet created.\n\nID: ${sheet.spreadsheetId}\nTitle: ${sheet.properties?.title || params.title}\nSheets: ${sheets}` }], details: sheet };
    },
  });

  // ── Tool: sheets_get_info ──────────────────────────────────────────────
  pi.registerTool({
    name: "sheets_get_info", label: "Sheets Get Info",
    description: "Get metadata about a spreadsheet (title, sheets, ranges).",
    promptSnippet: "Get spreadsheet metadata",
    parameters: Type.Object({
      spreadsheetId: Type.String({ description: "Spreadsheet ID" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const sheet = (await sheetsApi(`/spreadsheets/${params.spreadsheetId}`, token)) as {
        spreadsheetId: string; properties?: { title?: string; locale?: string; timeZone?: string };
        sheets?: Array<{ properties?: { sheetId?: number; title?: string; gridProperties?: { rowCount?: number; columnCount?: number } } }>;
      };
      const lines: string[] = [];
      lines.push(`┌────────────────────────────────────────────────────────────`);
      lines.push(`│ ID:        ${sheet.spreadsheetId}`);
      lines.push(`│ Title:     ${sheet.properties?.title || "(untitled)"}`);
      if (sheet.properties?.locale) lines.push(`│ Locale:    ${sheet.properties.locale}`);
      if (sheet.properties?.timeZone) lines.push(`│ Timezone:  ${sheet.properties.timeZone}`);
      lines.push(`└────────────────────────────────────────────────────────────`);
      if (sheet.sheets && sheet.sheets.length > 0) {
        lines.push(`\nSheets:`);
        for (const s of sheet.sheets) {
          const p = s.properties;
          lines.push(`  • ${p?.title || "(unnamed)"} — ${p?.gridProperties?.rowCount || 0} rows × ${p?.gridProperties?.columnCount || 0} cols`);
        }
      }
      return { content: [{ type: "text", text: truncateResult(lines.join("\n")) }], details: sheet };
    },
  });

  // ── Startup status ───────────────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    if (authState) ctx.ui.setStatus("sheets", "📊 Sheets: authenticated");
    else ctx.ui.setStatus("sheets", "📊 Sheets: not authenticated (run /sheets-auth or /google-auth)");
  });
}
