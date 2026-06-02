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

const PEOPLE_API_BASE = "https://people.googleapis.com/v1";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/contacts.readonly",
];

const LOCALHOST_PORT_MIN = 8000;
const LOCALHOST_PORT_MAX = 8999;
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let authState: AuthState | null = null;

function getClientId(): string | undefined { return process.env.CONTACTS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID; }
function getClientSecret(): string | undefined { return process.env.CONTACTS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET; }
function setAuthState(state: AuthState | null) { authState = state; }
function isTokenExpired(): boolean {
  if (!authState) return true;
  return Date.now() >= authState.expiresAt - 60_000;
}

// Try to restore authState from session entries (google-auth or contacts-auth)
function restoreAuthState(ctx: ExtensionContext) {
  if (authState) return;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "contacts-auth" && entry.data) {
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
  ctx.ui.notify("Opening Contacts authorization in browser...", "info");
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
  if (!clientId || !clientSecret) throw new Error("CONTACTS_CLIENT_ID (or GOOGLE_CLIENT_ID) and CONTACTS_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) must be set.");
  if (!authState) throw new Error("Not authenticated. Run /contacts-auth or use contacts_auth.");
  if (isTokenExpired()) {
    ctx.ui.notify("Contacts token expired, refreshing...", "warning");
    const refreshed = await refreshAccessToken(authState.refreshToken, clientId, clientSecret);
    authState.accessToken = refreshed.accessToken; authState.expiresAt = refreshed.expiresAt;
    pi.appendEntry("contacts-auth", { ...authState });
  }
  return authState.accessToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// People API helpers
// ─────────────────────────────────────────────────────────────────────────────

async function peopleApi(endpoint: string, accessToken: string, options: RequestInit = {}): Promise<unknown> {
  const url = `${PEOPLE_API_BASE}${endpoint}`;
  const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json", ...(options.headers || {}) } });
  if (!res.ok) { const body = await res.text(); throw new Error(`People API error (${res.status}): ${body}`); }
  return res.json();
}

const PERSON_FIELDS = "names,emailAddresses,phoneNumbers,addresses,organizations,photos,biographies,urls";

function truncateResult(text: string): string {
  const t = truncateHead(text, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
  if (t.truncated) return t.content + `\n\n[Output truncated: ${t.outputLines} of ${t.totalLines} lines (${t.outputBytes} of ${t.totalBytes} bytes).]`;
  return t.content;
}

function formatPerson(person: {
  resourceName?: string; names?: Array<{ displayName?: string; givenName?: string; familyName?: string }>;
  emailAddresses?: Array<{ value?: string; type?: string }>;
  phoneNumbers?: Array<{ value?: string; type?: string; canonicalForm?: string }>;
  addresses?: Array<{ formattedValue?: string; type?: string; city?: string; country?: string }>;
  organizations?: Array<{ name?: string; title?: string; department?: string; type?: string }>;
  photos?: Array<{ url?: string }>;
  biographies?: Array<{ value?: string }>;
  urls?: Array<{ value?: string; type?: string }>;
}): string {
  const lines: string[] = [];
  const name = person.names?.[0]?.displayName || person.names?.[0]?.givenName || "(unnamed)";
  lines.push(`┌────────────────────────────────────────────────────────────`);
  lines.push(`│ Resource: ${person.resourceName || "unknown"}`);
  lines.push(`│ Name:     ${name}`);
  lines.push(`└────────────────────────────────────────────────────────────`);
  if (person.emailAddresses && person.emailAddresses.length > 0) {
    lines.push(`\nEmails:`);
    for (const e of person.emailAddresses) {
      lines.push(`  • ${e.value || ""}${e.type ? ` (${e.type})` : ""}`);
    }
  }
  if (person.phoneNumbers && person.phoneNumbers.length > 0) {
    lines.push(`\nPhones:`);
    for (const p of person.phoneNumbers) {
      lines.push(`  • ${p.canonicalForm || p.value || ""}${p.type ? ` (${p.type})` : ""}`);
    }
  }
  if (person.addresses && person.addresses.length > 0) {
    lines.push(`\nAddresses:`);
    for (const a of person.addresses) {
      lines.push(`  • ${a.formattedValue || ""}${a.type ? ` (${a.type})` : ""}`);
    }
  }
  if (person.organizations && person.organizations.length > 0) {
    lines.push(`\nOrganizations:`);
    for (const o of person.organizations) {
      lines.push(`  • ${o.name || ""}${o.title ? ` — ${o.title}` : ""}${o.department ? ` (${o.department})` : ""}`);
    }
  }
  if (person.biographies && person.biographies.length > 0) {
    lines.push(`\nNotes: ${person.biographies[0].value || ""}`);
  }
  if (person.urls && person.urls.length > 0) {
    lines.push(`\nURLs:`);
    for (const u of person.urls) {
      lines.push(`  • ${u.value || ""}${u.type ? ` (${u.type})` : ""}`);
    }
  }
  if (person.photos && person.photos[0]?.url) {
    lines.push(`\nPhoto: ${person.photos[0].url}`);
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension
// ─────────────────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "contacts-auth" && entry.data) {
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
  pi.registerCommand("contacts-auth", {
    description: "Authenticate with Google Contacts (People API) OAuth",
    handler: async (_args, ctx) => {
      const clientId = getClientId(); const clientSecret = getClientSecret();
      if (!clientId || !clientSecret) { ctx.ui.notify("CONTACTS_CLIENT_ID (or GOOGLE_CLIENT_ID) and CONTACTS_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) must be set.", "error"); return; }
      if (authState) {
        const ok = await ctx.ui.confirm("Contacts Auth", "Already authenticated. Re-authenticate?");
        if (!ok) { ctx.ui.notify("Keeping existing Contacts auth.", "info"); return; }
      }
      try {
        const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
        authState = state; pi.appendEntry("contacts-auth", { ...state });
        ctx.ui.setStatus("contacts", "👤 Contacts: authenticated");
        ctx.ui.notify("Contacts authentication successful!", "success");
      } catch (err) {
        ctx.ui.setStatus("contacts", "👤 Contacts: not authenticated (run /contacts-auth)");
        ctx.ui.notify(`Auth failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  // ── Tool: contacts_auth ─────────────────────────────────────────────────
  pi.registerTool({
    name: "contacts_auth", label: "Contacts Auth",
    description: "Check Google Contacts auth status or initiate OAuth flow.",
    promptSnippet: "Authenticate with Google Contacts to enable contact access",
    promptGuidelines: ["Use contacts_auth before any other contacts tool if unsure about auth status."],
    parameters: Type.Object({ action: StringEnum(["status", "authenticate"] as const) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const clientId = getClientId(); const clientSecret = getClientSecret();
      if (!clientId || !clientSecret) throw new Error("CONTACTS_CLIENT_ID and CONTACTS_CLIENT_SECRET required.");
      if (params.action === "status") {
        restoreAuthState(ctx);
        if (authState) return { content: [{ type: "text", text: `Authenticated. Token expires at ${new Date(authState.expiresAt).toISOString()}.` }], details: { authenticated: true } };
        return { content: [{ type: "text", text: "Not authenticated. Run /contacts-auth or use action=authenticate." }], details: { authenticated: false } };
      }
      const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
      authState = state; pi.appendEntry("contacts-auth", { ...state });
      ctx.ui.setStatus("contacts", "👤 Contacts: authenticated");
      return { content: [{ type: "text", text: "Contacts authentication successful." }], details: { authenticated: true } };
    },
  });

  // ── Tool: contacts_list ─────────────────────────────────────────────────
  pi.registerTool({
    name: "contacts_list", label: "Contacts List",
    description: "List Google Contacts with pagination. Returns names, emails, and phones.",
    promptSnippet: "List Google Contacts",
    promptGuidelines: ["Use contacts_list when the user wants to see their contacts or find a phone number/email."],
    parameters: Type.Object({
      pageSize: Type.Optional(Type.Number({ default: 30, maximum: 1000, minimum: 1 })),
      pageToken: Type.Optional(Type.String()),
      sortOrder: Type.Optional(StringEnum(["LAST_MODIFIED_DESCENDING", "FIRST_NAME_ASCENDING", "LAST_NAME_ASCENDING"] as const)),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const qp = new URLSearchParams();
      qp.set("personFields", PERSON_FIELDS);
      if (params.pageSize) qp.set("pageSize", String(params.pageSize));
      if (params.pageToken) qp.set("pageToken", params.pageToken);
      if (params.sortOrder) qp.set("sortOrder", params.sortOrder);
      const data = (await peopleApi(`/people/me/connections?${qp.toString()}`, token)) as {
        connections?: Array<{
          resourceName: string; names?: Array<{ displayName?: string }>;
          emailAddresses?: Array<{ value?: string }>; phoneNumbers?: Array<{ value?: string }>;
        }>; nextPageToken?: string; totalItems?: number;
      };
      if (!data.connections || data.connections.length === 0) {
        return { content: [{ type: "text", text: "No contacts found." }], details: { totalItems: data.totalItems } };
      }
      const lines = data.connections.map(p => {
        const name = p.names?.[0]?.displayName || "(unnamed)";
        const email = p.emailAddresses?.[0]?.value || "";
        const phone = p.phoneNumbers?.[0]?.value || "";
        return `${p.resourceName} | ${name}${email ? ` | ${email}` : ""}${phone ? ` | ${phone}` : ""}`;
      });
      let text = `Contacts (${data.connections.length}${data.totalItems ? ` of ${data.totalItems}` : ""}):\n\nResource | Name | Email | Phone\n` + "─".repeat(80) + "\n" + lines.join("\n");
      if (data.nextPageToken) text += `\n\n[nextPageToken: ${data.nextPageToken}]`;
      return { content: [{ type: "text", text: truncateResult(text) }], details: { connections: data.connections, nextPageToken: data.nextPageToken, totalItems: data.totalItems } };
    },
  });

  // ── Tool: contacts_search ───────────────────────────────────────────────
  pi.registerTool({
    name: "contacts_search", label: "Contacts Search",
    description: "Search Google Contacts by name, email, or phone number.",
    promptSnippet: "Search Google Contacts",
    promptGuidelines: [
      "Use contacts_search when the user wants to find a specific contact.",
      "The query searches across names, emails, and phone numbers.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query (e.g., 'Alice', 'alice@example.com')" }),
      pageSize: Type.Optional(Type.Number({ default: 10, maximum: 100, minimum: 1 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const body = {
        query: params.query,
        pageSize: params.pageSize || 10,
        readMask: "names,emailAddresses,phoneNumbers,addresses,organizations,photos,biographies,urls",
      };
      const data = (await peopleApi(`/people:searchContacts`, token, { method: "POST", body: JSON.stringify(body) })) as {
        results?: Array<{ person?: { resourceName?: string; names?: Array<{ displayName?: string }>; emailAddresses?: Array<{ value?: string }>; phoneNumbers?: Array<{ value?: string }> } }>;
      };
      if (!data.results || data.results.length === 0) {
        return { content: [{ type: "text", text: `No contacts found for "${params.query}".` }], details: {} };
      }
      const lines = data.results.map(r => {
        const p = r.person;
        const name = p?.names?.[0]?.displayName || "(unnamed)";
        const email = p?.emailAddresses?.[0]?.value || "";
        const phone = p?.phoneNumbers?.[0]?.value || "";
        return `${p?.resourceName || ""} | ${name}${email ? ` | ${email}` : ""}${phone ? ` | ${phone}` : ""}`;
      });
      const text = `Search results for "${params.query}" (${data.results.length}):\n\nResource | Name | Email | Phone\n` + "─".repeat(80) + "\n" + lines.join("\n");
      return { content: [{ type: "text", text: truncateResult(text) }], details: { results: data.results } };
    },
  });

  // ── Tool: contacts_get ──────────────────────────────────────────────────
  pi.registerTool({
    name: "contacts_get", label: "Contacts Get",
    description: "Read a specific contact by resource name with full details.",
    promptSnippet: "Read a specific contact by ID",
    promptGuidelines: ["The resource name is obtained from contacts_list or contacts_search (e.g., 'people/c123456789')."],
    parameters: Type.Object({
      resourceName: Type.String({ description: "Contact resource name (e.g., 'people/c123456789')" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const qp = new URLSearchParams();
      qp.set("personFields", PERSON_FIELDS);
      const person = (await peopleApi(`/${params.resourceName}?${qp.toString()}`, token)) as {
        resourceName?: string; names?: Array<{ displayName?: string }>; emailAddresses?: Array<{ value?: string }>;
        phoneNumbers?: Array<{ value?: string }>; addresses?: Array<{ formattedValue?: string }>;
        organizations?: Array<{ name?: string; title?: string }>; photos?: Array<{ url?: string }>;
        biographies?: Array<{ value?: string }>; urls?: Array<{ value?: string }>;
      };
      return { content: [{ type: "text", text: truncateResult(formatPerson(person)) }], details: person };
    },
  });

  // ── Tool: contacts_create ───────────────────────────────────────────────
  pi.registerTool({
    name: "contacts_create", label: "Contacts Create",
    description: "Create a new contact in Google Contacts.",
    promptSnippet: "Create a new contact",
    promptGuidelines: ["Confirm name and email before creating."],
    parameters: Type.Object({
      givenName: Type.String({ description: "First name" }),
      familyName: Type.Optional(Type.String({ description: "Last name" })),
      email: Type.Optional(Type.String({ description: "Email address" })),
      phone: Type.Optional(Type.String({ description: "Phone number" })),
      organization: Type.Optional(Type.String({ description: "Company/organization" })),
      jobTitle: Type.Optional(Type.String({ description: "Job title" })),
      notes: Type.Optional(Type.String({ description: "Notes" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const body: Record<string, unknown> = {
        names: [{ givenName: params.givenName }],
      };
      if (params.familyName) (body.names as Array<{ givenName: string; familyName?: string }>)[0].familyName = params.familyName;
      if (params.email) body.emailAddresses = [{ value: params.email }];
      if (params.phone) body.phoneNumbers = [{ value: params.phone }];
      if (params.organization || params.jobTitle) {
        body.organizations = [{ name: params.organization || "", title: params.jobTitle || "" }];
      }
      if (params.notes) body.biographies = [{ value: params.notes }];
      const person = (await peopleApi(`/people:createContact`, token, { method: "POST", body: JSON.stringify(body) })) as {
        resourceName: string; names?: Array<{ displayName?: string }>;
      };
      return {
        content: [{ type: "text", text: `Contact created.\n\nResource: ${person.resourceName}\nName: ${person.names?.[0]?.displayName || params.givenName}` }],
        details: person,
      };
    },
  });

  // ── Tool: contacts_update ───────────────────────────────────────────────
  pi.registerTool({
    name: "contacts_update", label: "Contacts Update",
    description: "Update an existing contact. Only provided fields are changed.",
    promptSnippet: "Update an existing contact",
    parameters: Type.Object({
      resourceName: Type.String({ description: "Contact resource name (e.g., 'people/c123456789')" }),
      givenName: Type.Optional(Type.String()),
      familyName: Type.Optional(Type.String()),
      email: Type.Optional(Type.String()),
      phone: Type.Optional(Type.String()),
      organization: Type.Optional(Type.String()),
      jobTitle: Type.Optional(Type.String()),
      notes: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const body: Record<string, unknown> = {};
      if (params.givenName || params.familyName) {
        body.names = [{ givenName: params.givenName || "" }];
        if (params.familyName) (body.names as Array<{ givenName: string; familyName?: string }>)[0].familyName = params.familyName;
      }
      if (params.email !== undefined) body.emailAddresses = [{ value: params.email }];
      if (params.phone !== undefined) body.phoneNumbers = [{ value: params.phone }];
      if (params.organization !== undefined || params.jobTitle !== undefined) {
        body.organizations = [{ name: params.organization || "", title: params.jobTitle || "" }];
      }
      if (params.notes !== undefined) body.biographies = [{ value: params.notes }];
      const person = (await peopleApi(`/${params.resourceName}:updateContact`, token, {
        method: "PATCH",
        body: JSON.stringify(body),
      })) as { resourceName: string; names?: Array<{ displayName?: string }> };
      return {
        content: [{ type: "text", text: `Contact updated.\n\nResource: ${person.resourceName}\nName: ${person.names?.[0]?.displayName || "(unnamed)"}` }],
        details: person,
      };
    },
  });

  // ── Tool: contacts_delete ────────────────────────────────────────────────
  pi.registerTool({
    name: "contacts_delete", label: "Contacts Delete",
    description: "Delete a contact permanently.",
    promptSnippet: "Delete a contact",
    parameters: Type.Object({
      resourceName: Type.String({ description: "Contact resource name (e.g., 'people/c123456789')" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      await peopleApi(`/${params.resourceName}:deleteContact`, token, { method: "DELETE" });
      return { content: [{ type: "text", text: `Contact ${params.resourceName} deleted.` }], details: { deleted: true, resourceName: params.resourceName } };
    },
  });

  // ── Startup status ───────────────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    if (authState) ctx.ui.setStatus("contacts", "👤 Contacts: authenticated");
    else ctx.ui.setStatus("contacts", "👤 Contacts: not authenticated (run /contacts-auth or /google-auth)");
  });
}