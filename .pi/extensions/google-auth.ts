import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import * as http from "http";
import * as crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Unified Google OAuth for all Google APIs (Gmail, Calendar, Tasks,
// Contacts, Drive, Docs, Sheets). Authenticate once, use everywhere.
// ─────────────────────────────────────────────────────────────────────────────

interface AuthState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
}

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

// All scopes from every Google extension combined
const ALL_GOOGLE_SCOPES = [
  // Gmail
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  // Calendar
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.readonly",
  // Tasks
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/tasks.readonly",
  // Contacts
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/contacts.readonly",
  // Drive
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
  // Docs
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/documents.readonly",
  // Sheets
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  // User info
  "https://www.googleapis.com/auth/userinfo.email",
];

const LOCALHOST_PORT_MIN = 8000;
const LOCALHOST_PORT_MAX = 8999;
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

let authState: AuthState | null = null;

function getClientId(): string | undefined { return process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID; }
function getClientSecret(): string | undefined { return process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET; }

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
async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<{ accessToken: string; expiresAt: number }> {
  const params = new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" });
  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
  if (!res.ok) { const body = await res.text(); throw new Error(`Token refresh failed (${res.status}): ${body}`); }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
}
async function performAuthFlow(clientId: string, clientSecret: string, ctx: ExtensionContext, pi: ExtensionAPI): Promise<AuthState> {
  const port = getRandomPort();
  const redirectUri = `http://localhost:${port}`;
  const state = generateState();
  const serverPromise = createLocalAuthServer(state, port);
  const scopeString = ALL_GOOGLE_SCOPES.join(" ");
  const authUrl = `${GOOGLE_OAUTH_AUTH_URL}?` + new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: scopeString, access_type: "offline", prompt: "consent", state }).toString();
  ctx.ui.notify("Opening Google authorization (all APIs) in browser...", "info");
  try { await pi.exec("open", [authUrl], { timeout: 5000 }); } catch { ctx.ui.notify("Could not open browser automatically.", "warning"); }
  const opened = await ctx.ui.input(`If the browser didn't open, click this link:\n${authUrl}\n\nWaiting for authorization...`, "Press Enter once authorized (or type 'cancel')");
  if (opened?.toLowerCase() === "cancel") throw new Error("Authentication cancelled.");
  const result = await Promise.race([serverPromise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Auth timed out after ${AUTH_TIMEOUT_MS / 1000}s.`)), AUTH_TIMEOUT_MS))]);
  ctx.ui.notify("Exchanging code for tokens...", "info");
  return await exchangeCode(result.code, clientId, clientSecret, redirectUri);
}

export default function (pi: ExtensionAPI) {
  // Restore shared auth state on startup
  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "google-auth" && entry.data) {
        const data = entry.data as AuthState;
        if (data.accessToken && data.refreshToken) authState = data;
      }
    }
    if (authState) {
      ctx.ui.setStatus("google", "🔐 Google: all APIs authenticated");
    } else {
      ctx.ui.setStatus("google", "🔐 Google: not authenticated (run /google-auth)");
    }
  });

  // ── Command ─────────────────────────────────────────────────────────────
  pi.registerCommand("google-auth", {
    description: "Authenticate with all Google APIs at once (Gmail, Calendar, Tasks, Contacts, Drive, Docs, Sheets)",
    handler: async (_args, ctx) => {
      const clientId = getClientId(); const clientSecret = getClientSecret();
      if (!clientId || !clientSecret) {
        ctx.ui.notify("GOOGLE_CLIENT_ID (or GMAIL_CLIENT_ID) and GOOGLE_CLIENT_SECRET (or GMAIL_CLIENT_SECRET) must be set.", "error");
        return;
      }
      if (authState) {
        const ok = await ctx.ui.confirm("Google Auth", "Already authenticated with all Google APIs. Re-authenticate?");
        if (!ok) { ctx.ui.notify("Keeping existing Google auth.", "info"); return; }
      }
      try {
        const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
        authState = state;
        pi.appendEntry("google-auth", { ...state });
        ctx.ui.setStatus("google", "🔐 Google: all APIs authenticated");
        ctx.ui.notify("Google authentication successful for all APIs!", "success");
        ctx.ui.notify("You can now use Gmail, Calendar, Tasks, Contacts, Drive, Docs, and Sheets without re-authenticating.", "info");
      } catch (err) {
        ctx.ui.setStatus("google", "🔐 Google: not authenticated (run /google-auth)");
        ctx.ui.notify(`Auth failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  // ── Tool: google_auth ─────────────────────────────────────────────────
  pi.registerTool({
    name: "google_auth", label: "Google Auth",
    description: "Check Google auth status or trigger a unified OAuth flow for all Google APIs (Gmail, Calendar, Tasks, Contacts, Drive, Docs, Sheets).",
    promptSnippet: "Authenticate with all Google APIs at once",
    promptGuidelines: [
      "Use google_auth to authenticate once for all Google services instead of running each auth separately.",
      "Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (or falls back to GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET).",
    ],
    parameters: Type.Object({ action: StringEnum(["status", "authenticate"] as const) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const clientId = getClientId(); const clientSecret = getClientSecret();
      if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID (or GMAIL_CLIENT_ID) and GOOGLE_CLIENT_SECRET (or GMAIL_CLIENT_SECRET) required.");
      if (params.action === "status") {
        if (authState) return { content: [{ type: "text", text: `Authenticated with all Google APIs. Token expires at ${new Date(authState.expiresAt).toISOString()}.` }], details: { authenticated: true } };
        return { content: [{ type: "text", text: "Not authenticated. Run /google-auth or use action=authenticate." }], details: { authenticated: false } };
      }
      const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
      authState = state;
      pi.appendEntry("google-auth", { ...state });
      ctx.ui.setStatus("google", "🔐 Google: all APIs authenticated");
      return { content: [{ type: "text", text: "Google authentication successful for all APIs (Gmail, Calendar, Tasks, Contacts, Drive, Docs, Sheets)." }], details: { authenticated: true } };
    },
  });
}
