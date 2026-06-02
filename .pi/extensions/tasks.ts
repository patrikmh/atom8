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

const TASKS_API_BASE = "https://tasks.googleapis.com/tasks/v1";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/tasks.readonly",
];

const LOCALHOST_PORT_MIN = 8000;
const LOCALHOST_PORT_MAX = 8999;
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let authState: AuthState | null = null;

function getClientId(): string | undefined {
  return process.env.TASKS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
}
function getClientSecret(): string | undefined {
  return process.env.TASKS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
}
function setAuthState(state: AuthState | null) {
  authState = state;
}
function isTokenExpired(): boolean {
  if (!authState) return true;
  return Date.now() >= authState.expiresAt - 60_000;
}

// Try to restore authState from session entries (tasks-auth or google-auth)
function restoreAuthState(ctx: ExtensionContext) {
  if (authState) return;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "tasks-auth" && entry.data) {
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
function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}
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
  ctx.ui.notify("Opening Tasks authorization in browser...", "info");
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
  if (!clientId || !clientSecret) throw new Error("TASKS_CLIENT_ID (or GOOGLE_CLIENT_ID) and TASKS_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) must be set.");
  if (!authState) throw new Error("Not authenticated. Run /tasks-auth or use tasks_auth.");
  if (isTokenExpired()) {
    ctx.ui.notify("Tasks token expired, refreshing...", "warning");
    const refreshed = await refreshAccessToken(authState.refreshToken, clientId, clientSecret);
    authState.accessToken = refreshed.accessToken; authState.expiresAt = refreshed.expiresAt;
    pi.appendEntry("tasks-auth", { ...authState });
  }
  return authState.accessToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tasks API helpers
// ─────────────────────────────────────────────────────────────────────────────

async function tasksApi(endpoint: string, accessToken: string, options: RequestInit = {}): Promise<unknown> {
  const url = `${TASKS_API_BASE}${endpoint}`;
  const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json", ...(options.headers || {}) } });
  if (!res.ok) { const body = await res.text(); throw new Error(`Tasks API error (${res.status}): ${body}`); }
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
      if (entry.type === "custom" && entry.customType === "tasks-auth" && entry.data) {
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
  pi.registerCommand("tasks-auth", {
    description: "Authenticate with Google Tasks OAuth",
    handler: async (_args, ctx) => {
      const clientId = getClientId(); const clientSecret = getClientSecret();
      if (!clientId || !clientSecret) { ctx.ui.notify("TASKS_CLIENT_ID (or GOOGLE_CLIENT_ID) and TASKS_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) must be set.", "error"); return; }
      if (authState) {
        const ok = await ctx.ui.confirm("Tasks Auth", "Already authenticated. Re-authenticate?");
        if (!ok) { ctx.ui.notify("Keeping existing Tasks auth.", "info"); return; }
      }
      try {
        const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
        authState = state; pi.appendEntry("tasks-auth", { ...state });
        ctx.ui.setStatus("tasks", "☑ Tasks: authenticated");
        ctx.ui.notify("Tasks authentication successful!", "success");
      } catch (err) {
        ctx.ui.setStatus("tasks", "☑ Tasks: not authenticated (run /tasks-auth)");
        ctx.ui.notify(`Auth failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  // ── Tool: tasks_auth ────────────────────────────────────────────────────
  pi.registerTool({
    name: "tasks_auth", label: "Tasks Auth",
    description: "Check Google Tasks auth status or initiate OAuth flow.",
    promptSnippet: "Authenticate with Google Tasks to enable task management",
    promptGuidelines: ["Use tasks_auth before any other tasks tool if unsure about auth status."],
    parameters: Type.Object({ action: StringEnum(["status", "authenticate"] as const) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const clientId = getClientId(); const clientSecret = getClientSecret();
      if (!clientId || !clientSecret) throw new Error("TASKS_CLIENT_ID (or GOOGLE_CLIENT_ID) and TASKS_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) required.");
      if (params.action === "status") {
        restoreAuthState(ctx);
        if (authState) return { content: [{ type: "text", text: `Authenticated. Token expires at ${new Date(authState.expiresAt).toISOString()}.` }], details: { authenticated: true } };
        return { content: [{ type: "text", text: "Not authenticated. Run /tasks-auth or use action=authenticate." }], details: { authenticated: false } };
      }
      const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
      authState = state; pi.appendEntry("tasks-auth", { ...state });
      ctx.ui.setStatus("tasks", "☑ Tasks: authenticated");
      return { content: [{ type: "text", text: "Tasks authentication successful." }], details: { authenticated: true } };
    },
  });

  // ── Tool: tasks_list_tasklists ──────────────────────────────────────────
  pi.registerTool({
    name: "tasks_list_tasklists", label: "Tasks Lists",
    description: "List all task lists (e.g., 'My Tasks', work lists, custom lists).",
    promptSnippet: "List all Google Tasks task lists",
    parameters: Type.Object({ maxResults: Type.Optional(Type.Number({ default: 100, maximum: 100, minimum: 1 })), pageToken: Type.Optional(Type.String()) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const qp = new URLSearchParams();
      if (params.maxResults) qp.set("maxResults", String(params.maxResults));
      if (params.pageToken) qp.set("pageToken", params.pageToken);
      const data = (await tasksApi(`/users/@me/lists?${qp.toString()}`, token)) as { items?: Array<{ id: string; title: string; updated?: string }>; nextPageToken?: string };
      if (!data.items || data.items.length === 0) return { content: [{ type: "text", text: "No task lists found." }], details: {} };
      const lines = data.items.map(l => `${l.id} | ${l.title}${l.updated ? ` | updated: ${l.updated}` : ""}`);
      let text = `Task lists (${data.items.length}):\n\nID | Title | Updated\n` + "─".repeat(80) + "\n" + lines.join("\n");
      if (data.nextPageToken) text += `\n\n[nextPageToken: ${data.nextPageToken}]`;
      return { content: [{ type: "text", text: truncateResult(text) }], details: { items: data.items, nextPageToken: data.nextPageToken } };
    },
  });

  // ── Tool: tasks_list_tasks ──────────────────────────────────────────────
  pi.registerTool({
    name: "tasks_list_tasks", label: "Tasks List",
    description: "List tasks in a specific task list. Supports filtering by completion status.",
    promptSnippet: "List tasks in a Google Tasks list",
    promptGuidelines: [
      "Use tasks_list_tasks when the user wants to see their to-do list.",
      "The tasklist ID is obtained from tasks_list_tasklists. 'default' is the default list.",
    ],
    parameters: Type.Object({
      tasklistId: Type.String({ default: "default", description: "Task list ID (default: 'default')" }),
      showCompleted: Type.Optional(Type.Boolean({ default: false })),
      showHidden: Type.Optional(Type.Boolean({ default: false })),
      maxResults: Type.Optional(Type.Number({ default: 100, maximum: 100, minimum: 1 })),
      pageToken: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const qp = new URLSearchParams();
      if (params.showCompleted) qp.set("showCompleted", "true");
      if (params.showHidden) qp.set("showHidden", "true");
      if (params.maxResults) qp.set("maxResults", String(params.maxResults));
      if (params.pageToken) qp.set("pageToken", params.pageToken);
      const data = (await tasksApi(`/lists/${params.tasklistId}/tasks?${qp.toString()}`, token)) as {
        items?: Array<{ id: string; title: string; notes?: string; status: string; due?: string; completed?: string; updated?: string; parent?: string }>; nextPageToken?: string;
      };
      if (!data.items || data.items.length === 0) return { content: [{ type: "text", text: `No tasks found in list "${params.tasklistId}".` }], details: { tasklistId: params.tasklistId } };
      const lines: string[] = [];
      for (const t of data.items) {
        const status = t.status === "completed" ? "✓" : "☐";
        const due = t.due ? ` | due: ${t.due}` : "";
        const note = t.notes ? ` | notes: ${t.notes.slice(0, 60)}${t.notes.length > 60 ? "…" : ""}` : "";
        lines.push(`${status} ${t.id} | ${t.title}${due}${note}`);
      }
      let text = `Tasks in list "${params.tasklistId}" (${data.items.length}):\n\n` + lines.join("\n");
      if (data.nextPageToken) text += `\n\n[nextPageToken: ${data.nextPageToken}]`;
      return { content: [{ type: "text", text: truncateResult(text) }], details: { items: data.items, nextPageToken: data.nextPageToken } };
    },
  });

  // ── Tool: tasks_get_task ────────────────────────────────────────────────
  pi.registerTool({
    name: "tasks_get_task", label: "Tasks Get",
    description: "Read a specific task by ID.",
    promptSnippet: "Read a specific task by ID",
    promptGuidelines: ["The task ID is obtained from tasks_list_tasks."],
    parameters: Type.Object({
      taskId: Type.String({ description: "The task ID" }),
      tasklistId: Type.String({ default: "default", description: "Task list ID" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const task = (await tasksApi(`/lists/${params.tasklistId}/tasks/${params.taskId}`, token)) as {
        id: string; title: string; notes?: string; status: string; due?: string; completed?: string; updated?: string; links?: Array<{ type: string; link: string; description?: string }>;
      };
      const lines: string[] = [];
      lines.push(`┌────────────────────────────────────────────────────────────`);
      lines.push(`│ Task ID:   ${task.id}`);
      lines.push(`│ Title:     ${task.title || "(no title)"}`);
      lines.push(`│ Status:    ${task.status}`);
      if (task.due) lines.push(`│ Due:       ${task.due}`);
      if (task.completed) lines.push(`│ Completed: ${task.completed}`);
      if (task.updated) lines.push(`│ Updated:   ${task.updated}`);
      lines.push(`└────────────────────────────────────────────────────────────`);
      if (task.notes) lines.push(`\nNotes:\n${task.notes}`);
      if (task.links && task.links.length > 0) {
        lines.push(`\nLinks:`);
        for (const l of task.links) lines.push(`  • ${l.description || l.type}: ${l.link}`);
      }
      return { content: [{ type: "text", text: truncateResult(lines.join("\n")) }], details: task };
    },
  });

  // ── Tool: tasks_create_task ─────────────────────────────────────────────
  pi.registerTool({
    name: "tasks_create_task", label: "Tasks Create",
    description: "Create a new task in a list.",
    promptSnippet: "Create a new task in Google Tasks",
    promptGuidelines: [
      "Use tasks_create_task when the user wants to add a to-do item.",
      "Confirm title and due date before creating.",
    ],
    parameters: Type.Object({
      tasklistId: Type.String({ default: "default", description: "Task list ID" }),
      title: Type.String({ description: "Task title" }),
      notes: Type.Optional(Type.String({ description: "Task notes/description" })),
      due: Type.Optional(Type.String({ description: "Due date (RFC 3339, e.g., '2026-06-02T12:00:00Z')" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const body: Record<string, unknown> = { title: params.title };
      if (params.notes) body.notes = params.notes;
      if (params.due) body.due = params.due;
      const task = (await tasksApi(`/lists/${params.tasklistId}/tasks`, token, { method: "POST", body: JSON.stringify(body) })) as { id: string; title: string; status: string; due?: string };
      return { content: [{ type: "text", text: `Task created.\n\nID: ${task.id}\nTitle: ${task.title}\nStatus: ${task.status}${task.due ? `\nDue: ${task.due}` : ""}` }], details: task };
    },
  });

  // ── Tool: tasks_update_task ─────────────────────────────────────────────
  pi.registerTool({
    name: "tasks_update_task", label: "Tasks Update",
    description: "Update an existing task (title, notes, due date, status).",
    promptSnippet: "Update an existing task",
    promptGuidelines: ["Only provide fields you want to change."],
    parameters: Type.Object({
      taskId: Type.String({ description: "Task ID to update" }),
      tasklistId: Type.String({ default: "default", description: "Task list ID" }),
      title: Type.Optional(Type.String()),
      notes: Type.Optional(Type.String()),
      due: Type.Optional(Type.String()),
      status: Type.Optional(StringEnum(["needsAction", "completed"] as const)),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const body: Record<string, unknown> = {};
      if (params.title !== undefined) body.title = params.title;
      if (params.notes !== undefined) body.notes = params.notes;
      if (params.due !== undefined) body.due = params.due;
      if (params.status !== undefined) body.status = params.status;
      const task = (await tasksApi(`/lists/${params.tasklistId}/tasks/${params.taskId}`, token, { method: "PATCH", body: JSON.stringify(body) })) as { id: string; title: string; status: string; due?: string };
      return { content: [{ type: "text", text: `Task updated.\n\nID: ${task.id}\nTitle: ${task.title}\nStatus: ${task.status}${task.due ? `\nDue: ${task.due}` : ""}` }], details: task };
    },
  });

  // ── Tool: tasks_delete_task ─────────────────────────────────────────────
  pi.registerTool({
    name: "tasks_delete_task", label: "Tasks Delete",
    description: "Delete a task permanently.",
    promptSnippet: "Delete a task",
    promptGuidelines: ["Confirm the task ID before deleting."],
    parameters: Type.Object({
      taskId: Type.String({ description: "Task ID to delete" }),
      tasklistId: Type.String({ default: "default", description: "Task list ID" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      await tasksApi(`/lists/${params.tasklistId}/tasks/${params.taskId}`, token, { method: "DELETE" });
      return { content: [{ type: "text", text: `Task ${params.taskId} deleted.` }], details: { deleted: true, taskId: params.taskId } };
    },
  });

  // ── Tool: tasks_clear_completed ─────────────────────────────────────────
  pi.registerTool({
    name: "tasks_clear_completed", label: "Tasks Clear Completed",
    description: "Clear all completed tasks from a task list.",
    promptSnippet: "Clear completed tasks from a list",
    parameters: Type.Object({
      tasklistId: Type.String({ default: "default", description: "Task list ID" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      await tasksApi(`/lists/${params.tasklistId}/clear`, token, { method: "POST" });
      return { content: [{ type: "text", text: `Completed tasks cleared from list "${params.tasklistId}".` }], details: { cleared: true, tasklistId: params.tasklistId } };
    },
  });

  // ── Tool: tasks_move_task ───────────────────────────────────────────────
  pi.registerTool({
    name: "tasks_move_task", label: "Tasks Move",
    description: "Move a task to a different position or parent within a list.",
    promptSnippet: "Move a task within a task list",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task ID to move" }),
      tasklistId: Type.String({ default: "default", description: "Task list ID" }),
      parent: Type.Optional(Type.String({ description: "Parent task ID to nest under" })),
      previous: Type.Optional(Type.String({ description: "Task ID to place after" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const qp = new URLSearchParams();
      if (params.parent) qp.set("parent", params.parent);
      if (params.previous) qp.set("previous", params.previous);
      const task = (await tasksApi(`/lists/${params.tasklistId}/tasks/${params.taskId}/move?${qp.toString()}`, token, { method: "POST" })) as { id: string; title: string; parent?: string };
      return { content: [{ type: "text", text: `Task moved.\n\nID: ${task.id}\nTitle: ${task.title}${task.parent ? `\nParent: ${task.parent}` : ""}` }], details: task };
    },
  });

  // ── Startup status ───────────────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    if (authState) ctx.ui.setStatus("tasks", "☑ Tasks: authenticated");
    else ctx.ui.setStatus("tasks", "☑ Tasks: not authenticated (run /tasks-auth or /google-auth)");
  });
}
