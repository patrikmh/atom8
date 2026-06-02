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

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
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
  return process.env.CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
}

function getClientSecret(): string | undefined {
  return process.env.CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
}

function setAuthState(state: AuthState | null) {
  authState = state;
}

function isTokenExpired(): boolean {
  if (!authState) return true;
  return Date.now() >= authState.expiresAt - 60_000; // 1 min buffer
}

// Try to restore authState from session entries (google-auth or calendar-auth)
function restoreAuthState(ctx: ExtensionContext) {
  if (authState) return;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "calendar-auth" && entry.data) {
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
// OAuth helpers (shared with Gmail extension, but scoped to Calendar)
// ─────────────────────────────────────────────────────────────────────────────

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

async function performAuthFlow(
  clientId: string,
  clientSecret: string,
  ctx: ExtensionContext,
  pi: ExtensionAPI
): Promise<AuthState> {
  const port = getRandomPort();
  const redirectUri = `http://localhost:${port}`;
  const state = generateState();

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

  ctx.ui.notify("Opening Calendar authorization in browser...", "info");

  try {
    await pi.exec("open", [authUrl], { timeout: 5000 });
  } catch {
    ctx.ui.notify("Could not open browser automatically.", "warning");
  }

  const opened = await ctx.ui.input(
    `If the browser didn't open, click this link to authorize Calendar access:\n${authUrl}\n\nWaiting for authorization...`,
    "Press Enter once you've authorized (or type 'cancel')"
  );

  if (opened?.toLowerCase() === "cancel") {
    throw new Error("Authentication cancelled by user.");
  }

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
      "CALENDAR_CLIENT_ID (or GOOGLE_CLIENT_ID) and CALENDAR_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) must be set."
    );
  }

  if (!authState) {
    throw new Error(
      "Not authenticated. Run /calendar-auth or use the calendar_auth tool first."
    );
  }

  if (isTokenExpired()) {
    ctx.ui.notify("Calendar token expired, refreshing...", "warning");
    const refreshed = await refreshAccessToken(
      authState.refreshToken,
      clientId,
      clientSecret
    );
    authState.accessToken = refreshed.accessToken;
    authState.expiresAt = refreshed.expiresAt;
    pi.appendEntry("calendar-auth", { ...authState });
  }

  return authState.accessToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar API helpers
// ─────────────────────────────────────────────────────────────────────────────

async function calendarApi(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<unknown> {
  const url = `${CALENDAR_API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Calendar API error (${res.status}): ${body}`);
  }

  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar types
// ─────────────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status?: string;
  creator?: { email?: string };
  organizer?: { email?: string };
  attendees?: Array<{ email?: string; responseStatus?: string; displayName?: string }>;
  hangoutLink?: string;
  htmlLink?: string;
  recurringEventId?: string;
  visibility?: string;
  created?: string;
  updated?: string;
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{ method: string; minutes: number }>;
  };
  conferenceData?: {
    conferenceId?: string;
    entryPoints?: Array<{ entryPointType?: string; uri?: string; label?: string }>;
  };
}

interface CalendarList {
  items?: Array<{
    id: string;
    summary: string;
    description?: string;
    timeZone?: string;
    primary?: boolean;
    accessRole?: string;
    colorId?: string;
  }>;
  nextPageToken?: string;
}

interface FreeBusyRequest {
  timeMin: string;
  timeMax: string;
  items: Array<{ id: string }>;
}

interface FreeBusyResponse {
  calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Format helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatEvent(event: CalendarEvent, detail = false): string {
  const lines: string[] = [];

  const startStr = event.start.dateTime || event.start.date || "unknown";
  const endStr = event.end.dateTime || event.end.date || "unknown";
  const tz = event.start.timeZone || "";

  lines.push(`┌────────────────────────────────────────────────────────────`);
  lines.push(`│ Event ID:  ${event.id}`);
  lines.push(`│ Summary:   ${event.summary || "(no title)"}`);
  lines.push(`│ Start:     ${startStr}${tz ? ` (${tz})` : ""}`);
  lines.push(`│ End:       ${endStr}`);
  if (event.location) lines.push(`│ Location:  ${event.location}`);
  if (event.status) lines.push(`│ Status:    ${event.status}`);
  if (event.visibility) lines.push(`│ Visibility: ${event.visibility}`);
  if (event.hangoutLink) lines.push(`│ Meet link: ${event.hangoutLink}`);
  if (event.htmlLink) lines.push(`│ Calendar:  ${event.htmlLink}`);
  lines.push(`└────────────────────────────────────────────────────────────`);

  if (detail) {
    if (event.description) {
      lines.push(`\n--- Description ---\n${event.description}`);
    }
    if (event.creator?.email) {
      lines.push(`\nCreator: ${event.creator.email}`);
    }
    if (event.organizer?.email) {
      lines.push(`Organizer: ${event.organizer.email}`);
    }
    if (event.attendees && event.attendees.length > 0) {
      lines.push(`\n--- Attendees ---`);
      for (const a of event.attendees) {
        const name = a.displayName || a.email || "unknown";
        const status = a.responseStatus || "no response";
        lines.push(`  • ${name} — ${status}`);
      }
    }
    if (event.reminders?.overrides && event.reminders.overrides.length > 0) {
      lines.push(`\n--- Reminders ---`);
      for (const r of event.reminders.overrides) {
        lines.push(`  • ${r.method} at ${r.minutes} minutes before`);
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

function formatDateTimeISO(d: Date): string {
  return d.toISOString();
}

function parseDateTimeInput(input: string): string {
  // If input is already ISO, return it. Otherwise, try to parse.
  if (input.match(/^\d{4}-\d{2}-\d{2}/)) {
    return new Date(input).toISOString();
  }
  // Try relative terms like "today", "tomorrow", "next week"
  const now = new Date();
  const lower = input.toLowerCase().trim();
  if (lower === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (lower === "tomorrow") {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    return new Date(t.getFullYear(), t.getMonth(), t.getDate()).toISOString();
  }
  return new Date(input).toISOString();
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
        entry.customType === "calendar-auth" &&
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

  // ── Command: /calendar-auth ───────────────────────────────────────────────
  pi.registerCommand("calendar-auth", {
    description: "Authenticate with Google Calendar OAuth",
    handler: async (_args, ctx) => {
      const clientId = getClientId();
      const clientSecret = getClientSecret();

      if (!clientId || !clientSecret) {
        ctx.ui.notify(
          "CALENDAR_CLIENT_ID (or GOOGLE_CLIENT_ID) and CALENDAR_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) must be set.",
          "error"
        );
        return;
      }

      if (authState) {
        const ok = await ctx.ui.confirm(
          "Calendar Auth",
          "Already authenticated. Re-authenticate?"
        );
        if (!ok) {
          ctx.ui.notify("Keeping existing Calendar authentication.", "info");
          return;
        }
      }

      try {
        const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
        authState = state;
        pi.appendEntry("calendar-auth", { ...state });
        ctx.ui.setStatus("calendar", "📅 Calendar: authenticated");
        ctx.ui.notify("Calendar authentication successful!", "success");
      } catch (err) {
        ctx.ui.setStatus(
          "calendar",
          "📅 Calendar: not authenticated (run /calendar-auth)"
        );
        ctx.ui.notify(
          `Auth failed: ${err instanceof Error ? err.message : String(err)}`,
          "error"
        );
      }
    },
  });

  // ── Tool: calendar_auth ───────────────────────────────────────────────────
  pi.registerTool({
    name: "calendar_auth",
    label: "Calendar Auth",
    description:
      "Check Google Calendar authentication status or initiate OAuth flow. " +
      "Returns status: authenticated or not. If not authenticated, " +
      "pi will start a local server and open the Google authorization page in your browser. " +
      "Click authorize in the browser — pi captures the callback automatically. No code copying needed.",
    promptSnippet: "Authenticate with Google Calendar to enable calendar access",
    promptGuidelines: [
      "Use calendar_auth before any other calendar tool if you are unsure whether the user is authenticated.",
    ],
    parameters: Type.Object({
      action: StringEnum(["status", "authenticate"] as const),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const clientId = getClientId();
      const clientSecret = getClientSecret();

      if (!clientId || !clientSecret) {
        throw new Error(
          "CALENDAR_CLIENT_ID (or GOOGLE_CLIENT_ID) and CALENDAR_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) environment variables are required."
        );
      }

      if (params.action === "status") {
        restoreAuthState(ctx);
        if (authState) {
          return {
            content: [
              {
                type: "text",
                text: `Authenticated with Google Calendar. Token expires at ${new Date(authState.expiresAt).toISOString()}.`,
              },
            ],
            details: { authenticated: true },
          };
        }
        return {
          content: [
            {
              type: "text",
              text: "Not authenticated with Google Calendar. Run /calendar-auth or use action=authenticate.",
            },
          ],
          details: { authenticated: false },
        };
      }

      // action === "authenticate"
      const state = await performAuthFlow(clientId, clientSecret, ctx, pi);
      authState = state;
      pi.appendEntry("calendar-auth", { ...state });
      ctx.ui.setStatus("calendar", "📅 Calendar: authenticated");

      return {
        content: [
          {
            type: "text",
            text: "Google Calendar authentication successful. You can now use Calendar tools.",
          },
        ],
        details: { authenticated: true },
      };
    },
  });

  // ── Tool: calendar_list_events ────────────────────────────────────────────
  pi.registerTool({
    name: "calendar_list_events",
    label: "Calendar List Events",
    description:
      "List events from a Google Calendar. Supports time range filtering, search query, and pagination. " +
      "Defaults to the primary calendar.",
    promptSnippet: "List events from a Google Calendar with optional date range",
    promptGuidelines: [
      "Use calendar_list_events when the user asks to see their calendar, upcoming events, or schedule.",
      "Use the calendarId parameter to target a specific calendar (default is 'primary').",
      "Use timeMin and timeMax to filter by date range. Accepts ISO strings or relative terms like 'today', 'tomorrow'.",
      "Use q for free-text search within event titles/descriptions.",
    ],
    parameters: Type.Object({
      calendarId: Type.Optional(
        Type.String({
          default: "primary",
          description: "Calendar ID (default: primary). Use calendar_list_calendars to find IDs.",
        })
      ),
      timeMin: Type.Optional(
        Type.String({
          description: "Start of time range (ISO 8601 or 'today', 'tomorrow')",
        })
      ),
      timeMax: Type.Optional(
        Type.String({
          description: "End of time range (ISO 8601 or relative date)",
        })
      ),
      q: Type.Optional(
        Type.String({
          description: "Free-text search query for events",
        })
      ),
      maxResults: Type.Optional(
        Type.Number({ default: 25, maximum: 2500, minimum: 1 })
      ),
      pageToken: Type.Optional(Type.String()),
      showDeleted: Type.Optional(Type.Boolean({ default: false })),
      singleEvents: Type.Optional(
        Type.Boolean({
          default: true,
          description: "Expand recurring events into individual instances",
        })
      ),
      orderBy: Type.Optional(
        StringEnum(["startTime", "updated"] as const, {
          default: "startTime",
          description: "Order of returned events",
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const calendarId = params.calendarId || "primary";

      const queryParams = new URLSearchParams();
      if (params.timeMin) {
        queryParams.set("timeMin", parseDateTimeInput(params.timeMin));
      }
      if (params.timeMax) {
        queryParams.set("timeMax", parseDateTimeInput(params.timeMax));
      }
      if (params.q) queryParams.set("q", params.q);
      if (params.maxResults)
        queryParams.set("maxResults", String(params.maxResults));
      if (params.pageToken) queryParams.set("pageToken", params.pageToken);
      if (params.showDeleted) queryParams.set("showDeleted", "true");
      if (params.singleEvents !== false)
        queryParams.set("singleEvents", "true");
      if (params.orderBy) queryParams.set("orderBy", params.orderBy);

      const data = (await calendarApi(
        `/calendars/${encodeURIComponent(calendarId)}/events?${queryParams.toString()}`,
        token
      )) as {
        items?: CalendarEvent[];
        nextPageToken?: string;
        summary?: string;
        timeZone?: string;
      };

      if (!data.items || data.items.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No events found in calendar "${data.summary || calendarId}"${params.timeMin ? ` from ${params.timeMin}` : ""}.`,
            },
          ],
          details: { calendarId, summary: data.summary },
        };
      }

      const parts: string[] = [];
      parts.push(
        `Calendar: ${data.summary || calendarId}${data.timeZone ? ` (${data.timeZone})` : ""}`
      );
      parts.push(`Found ${data.items.length} events:\n`);
      parts.push("─".repeat(80));

      for (const event of data.items) {
        parts.push(formatEvent(event));
      }

      if (data.nextPageToken) {
        parts.push(`\n[nextPageToken: ${data.nextPageToken}]`);
      }

      return {
        content: [{ type: "text", text: truncateResult(parts.join("\n")) }],
        details: {
          events: data.items,
          nextPageToken: data.nextPageToken,
          calendarId,
          summary: data.summary,
        },
      };
    },
  });

  // ── Tool: calendar_get_event ──────────────────────────────────────────────
  pi.registerTool({
    name: "calendar_get_event",
    label: "Calendar Get Event",
    description:
      "Read a specific Google Calendar event by ID. Returns full details including attendees, reminders, and conferencing info.",
    promptSnippet: "Read a specific calendar event by ID",
    promptGuidelines: [
      "Use calendar_get_event when the user asks to see details of a specific event.",
      "The event ID is obtained from calendar_list_events.",
    ],
    parameters: Type.Object({
      eventId: Type.String({ description: "The event ID to read" }),
      calendarId: Type.Optional(
        Type.String({
          default: "primary",
          description: "Calendar ID (default: primary)",
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const calendarId = params.calendarId || "primary";

      const event = (await calendarApi(
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(params.eventId)}`,
        token
      )) as CalendarEvent;

      return {
        content: [
          {
            type: "text",
            text: truncateResult(formatEvent(event, true)),
          },
        ],
        details: event,
      };
    },
  });

  // ── Tool: calendar_create_event ───────────────────────────────────────────
  pi.registerTool({
    name: "calendar_create_event",
    label: "Calendar Create Event",
    description:
      "Create a new event in a Google Calendar. Supports title, description, location, start/end times, attendees, and reminders.",
    promptSnippet: "Create a new event in Google Calendar",
    promptGuidelines: [
      "Use calendar_create_event when the user asks to schedule, add, or create a meeting/event.",
      "Confirm the event details (time, attendees) before creating.",
      "Start and end times must be ISO 8601 strings (e.g., '2026-06-02T14:00:00+02:00').",
      "Use the attendees array to invite people by email.",
    ],
    parameters: Type.Object({
      calendarId: Type.Optional(
        Type.String({
          default: "primary",
          description: "Calendar ID (default: primary)",
        })
      ),
      summary: Type.String({ description: "Event title" }),
      description: Type.Optional(Type.String()),
      location: Type.Optional(Type.String()),
      start: Type.String({
        description: "Start time (ISO 8601, e.g., '2026-06-02T14:00:00+02:00')",
      }),
      end: Type.String({
        description: "End time (ISO 8601)",
      }),
      timeZone: Type.Optional(
        Type.String({
          default: "UTC",
          description: "Time zone (e.g., 'Europe/Stockholm')",
        })
      ),
      attendees: Type.Optional(
        Type.Array(
          Type.String({
            description: "Attendee email addresses",
          })
        )
      ),
      reminders: Type.Optional(
        Type.Array(
          Type.Object({
            method: StringEnum(["email", "popup"] as const),
            minutes: Type.Number({
              description: "Minutes before event to send reminder",
            }),
          })
        )
      ),
      sendUpdates: Type.Optional(
        StringEnum(["all", "externalOnly", "none"] as const, {
          default: "all",
          description: "Who to notify when the event is created",
        })
      ),
      conferenceData: Type.Optional(
        Type.Boolean({
          default: false,
          description: "Add a Google Meet conference to the event",
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const calendarId = params.calendarId || "primary";

      const body: Record<string, unknown> = {
        summary: params.summary,
        start: {
          dateTime: params.start,
          timeZone: params.timeZone || "UTC",
        },
        end: {
          dateTime: params.end,
          timeZone: params.timeZone || "UTC",
        },
      };

      if (params.description) body.description = params.description;
      if (params.location) body.location = params.location;
      if (params.attendees && params.attendees.length > 0) {
        body.attendees = params.attendees.map((email) => ({ email }));
      }
      if (params.reminders && params.reminders.length > 0) {
        body.reminders = {
          useDefault: false,
          overrides: params.reminders,
        };
      }
      if (params.conferenceData) {
        body.conferenceData = {
          createRequest: {
            requestId: crypto.randomBytes(16).toString("hex"),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        };
      }

      const query = new URLSearchParams();
      if (params.sendUpdates) query.set("sendUpdates", params.sendUpdates);
      if (params.conferenceData) query.set("conferenceDataVersion", "1");

      const event = (await calendarApi(
        `/calendars/${encodeURIComponent(calendarId)}/events${query.toString() ? `?${query.toString()}` : ""}`,
        token,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      )) as CalendarEvent;

      return {
        content: [
          {
            type: "text",
            text: `Event created successfully.\n\n${formatEvent(event, true)}`,
          },
        ],
        details: event,
      };
    },
  });

  // ── Tool: calendar_update_event ───────────────────────────────────────────
  pi.registerTool({
    name: "calendar_update_event",
    label: "Calendar Update Event",
    description:
      "Update an existing Google Calendar event. Only fields provided are changed; others are preserved.",
    promptSnippet: "Update an existing calendar event",
    promptGuidelines: [
      "Use calendar_update_event when the user asks to edit, reschedule, or modify an event.",
      "Provide only the fields you want to change. Existing fields are preserved.",
      "The event ID is required and is obtained from calendar_list_events.",
    ],
    parameters: Type.Object({
      eventId: Type.String({ description: "The event ID to update" }),
      calendarId: Type.Optional(
        Type.String({
          default: "primary",
          description: "Calendar ID (default: primary)",
        })
      ),
      summary: Type.Optional(Type.String({ description: "New event title" })),
      description: Type.Optional(Type.String()),
      location: Type.Optional(Type.String()),
      start: Type.Optional(
        Type.String({ description: "New start time (ISO 8601)" })
      ),
      end: Type.Optional(
        Type.String({ description: "New end time (ISO 8601)" })
      ),
      timeZone: Type.Optional(Type.String()),
      attendees: Type.Optional(
        Type.Array(
          Type.String({ description: "Updated attendee email addresses" })
        )
      ),
      sendUpdates: Type.Optional(
        StringEnum(["all", "externalOnly", "none"] as const)
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const calendarId = params.calendarId || "primary";

      const body: Record<string, unknown> = {};
      if (params.summary !== undefined) body.summary = params.summary;
      if (params.description !== undefined) body.description = params.description;
      if (params.location !== undefined) body.location = params.location;
      if (params.start || params.end || params.timeZone) {
        const tz = params.timeZone || "UTC";
        body.start = {
          dateTime: params.start,
          timeZone: tz,
        };
        body.end = {
          dateTime: params.end,
          timeZone: tz,
        };
      }
      if (params.attendees !== undefined) {
        body.attendees = params.attendees.map((email) => ({ email }));
      }

      const query = new URLSearchParams();
      if (params.sendUpdates) query.set("sendUpdates", params.sendUpdates);

      const event = (await calendarApi(
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(params.eventId)}${query.toString() ? `?${query.toString()}` : ""}`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        }
      )) as CalendarEvent;

      return {
        content: [
          {
            type: "text",
            text: `Event updated successfully.\n\n${formatEvent(event, true)}`,
          },
        ],
        details: event,
      };
    },
  });

  // ── Tool: calendar_delete_event ───────────────────────────────────────────
  pi.registerTool({
    name: "calendar_delete_event",
    label: "Calendar Delete Event",
    description: "Delete a Google Calendar event by ID.",
    promptSnippet: "Delete a calendar event",
    promptGuidelines: [
      "Use calendar_delete_event when the user asks to remove or cancel an event.",
      "Confirm the event ID before deleting.",
    ],
    parameters: Type.Object({
      eventId: Type.String({ description: "The event ID to delete" }),
      calendarId: Type.Optional(
        Type.String({
          default: "primary",
          description: "Calendar ID (default: primary)",
        })
      ),
      sendUpdates: Type.Optional(
        StringEnum(["all", "externalOnly", "none"] as const, {
          default: "all",
          description: "Who to notify about the cancellation",
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const calendarId = params.calendarId || "primary";

      const query = new URLSearchParams();
      if (params.sendUpdates) query.set("sendUpdates", params.sendUpdates);

      await calendarApi(
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(params.eventId)}${query.toString() ? `?${query.toString()}` : ""}`,
        token,
        { method: "DELETE" }
      );

      return {
        content: [
          {
            type: "text",
            text: `Event ${params.eventId} deleted successfully from calendar "${calendarId}".`,
          },
        ],
        details: { deleted: true, eventId: params.eventId, calendarId },
      };
    },
  });

  // ── Tool: calendar_list_calendars ─────────────────────────────────────────
  pi.registerTool({
    name: "calendar_list_calendars",
    label: "Calendar List Calendars",
    description:
      "List all calendars the user has access to, including primary, shared, and holiday calendars.",
    promptSnippet: "List all Google Calendars",
    promptGuidelines: [
      "Use calendar_list_calendars when the user wants to know which calendars they have or find a calendar ID.",
    ],
    parameters: Type.Object({
      showHidden: Type.Optional(
        Type.Boolean({ default: false, description: "Include hidden calendars" })
      ),
      maxResults: Type.Optional(
        Type.Number({ default: 100, maximum: 250, minimum: 1 })
      ),
      pageToken: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);

      const queryParams = new URLSearchParams();
      if (params.showHidden) queryParams.set("showHidden", "true");
      if (params.maxResults)
        queryParams.set("maxResults", String(params.maxResults));
      if (params.pageToken) queryParams.set("pageToken", params.pageToken);

      const data = (await calendarApi(
        `/users/me/calendarList?${queryParams.toString()}`,
        token
      )) as CalendarList;

      if (!data.items || data.items.length === 0) {
        return {
          content: [{ type: "text", text: "No calendars found." }],
          details: {},
        };
      }

      const lines: string[] = [];
      lines.push(`Calendars (${data.items.length}):\n`);
      lines.push("ID | Summary | Primary | TimeZone | Access Role");
      lines.push("─".repeat(80));

      for (const cal of data.items) {
        const primary = cal.primary ? "★" : "";
        lines.push(
          `${cal.id} | ${cal.summary} ${primary} | ${cal.timeZone || "-"} | ${cal.accessRole || "-"}`
        );
      }

      if (data.nextPageToken) {
        lines.push(`\n[nextPageToken: ${data.nextPageToken}]`);
      }

      return {
        content: [{ type: "text", text: truncateResult(lines.join("\n")) }],
        details: { calendars: data.items, nextPageToken: data.nextPageToken },
      };
    },
  });

  // ── Tool: calendar_freebusy ───────────────────────────────────────────────
  pi.registerTool({
    name: "calendar_freebusy",
    label: "Calendar Free/Busy",
    description:
      "Check free/busy availability across one or more calendars within a time range. " +
      "Returns busy blocks for each queried calendar.",
    promptSnippet: "Check free/busy time across calendars",
    promptGuidelines: [
      "Use calendar_freebusy when the user wants to find their free time, check availability, or see if someone is busy.",
      "Provide timeMin and timeMax as ISO 8601 strings.",
      "Use calendarIds to check multiple calendars at once (default is primary).",
    ],
    parameters: Type.Object({
      calendarIds: Type.Optional(
        Type.Array(
          Type.String({
            description: "Calendar IDs to check (default: ['primary'])",
          })
        )
      ),
      timeMin: Type.String({
        description: "Start of time range (ISO 8601, e.g., '2026-06-02T00:00:00Z')",
      }),
      timeMax: Type.String({
        description: "End of time range (ISO 8601)",
      }),
      timeZone: Type.Optional(
        Type.String({
          default: "UTC",
          description: "Time zone for the query",
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);
      const calendarIds = params.calendarIds || ["primary"];
      const tz = params.timeZone || "UTC";

      const body: FreeBusyRequest = {
        timeMin: parseDateTimeInput(params.timeMin),
        timeMax: parseDateTimeInput(params.timeMax),
        items: calendarIds.map((id) => ({ id })),
      };

      const data = (await calendarApi(
        `/freeBusy`,
        token,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      )) as FreeBusyResponse;

      const lines: string[] = [];
      lines.push(`Free/Busy query (${params.timeMin} → ${params.timeMax})\n`);
      lines.push("─".repeat(80));

      if (data.calendars) {
        for (const [calId, calData] of Object.entries(data.calendars)) {
          lines.push(`\nCalendar: ${calId}`);
          if (calData.busy && calData.busy.length > 0) {
            lines.push(`  Busy blocks (${calData.busy.length}):`);
            for (const block of calData.busy) {
              lines.push(`    • ${block.start} → ${block.end}`);
            }
          } else {
            lines.push(`  Free — no busy blocks in this range.`);
          }
        }
      }

      return {
        content: [{ type: "text", text: truncateResult(lines.join("\n")) }],
        details: data,
      };
    },
  });

  // ── Tool: calendar_get_calendar ───────────────────────────────────────────
  pi.registerTool({
    name: "calendar_get_calendar",
    label: "Calendar Get Calendar",
    description:
      "Get metadata for a specific calendar (name, timezone, description, etc.).",
    promptSnippet: "Get calendar metadata by ID",
    parameters: Type.Object({
      calendarId: Type.String({
        description: "Calendar ID (use 'primary' for the main calendar)",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const token = await ensureValidToken(ctx, pi);

      const cal = (await calendarApi(
        `/calendars/${encodeURIComponent(params.calendarId)}`,
        token
      )) as {
        id: string;
        summary: string;
        description?: string;
        timeZone?: string;
        location?: string;
      };

      return {
        content: [
          {
            type: "text",
            text:
              `ID: ${cal.id}\n` +
              `Summary: ${cal.summary}\n` +
              `TimeZone: ${cal.timeZone || "-"}\n` +
              `Location: ${cal.location || "-"}\n` +
              `Description: ${cal.description || "-"}`,
          },
        ],
        details: cal,
      };
    },
  });

  // ── Notification on startup ───────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    if (authState) {
      ctx.ui.setStatus("calendar", "📅 Calendar: authenticated");
    } else {
      ctx.ui.setStatus("calendar", "📅 Calendar: not authenticated (run /calendar-auth or /google-auth)");
    }
  });
}
