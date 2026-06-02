/**
 * Living Canvas Extension — Project-specific data fetch tools
 *
 * Provides custom tools for the Living Canvas dashboard backend:
 * - fetch_gmail: list emails from the user's Gmail inbox
 * - fetch_calendar: list calendar events
 * - fetch_tasks: list Google Tasks
 * - fetch_drive: list recent Drive files
 *
 * All tools read Google OAuth tokens from ~/.pi/agent/auth.json (google-antigravity)
 * and handle token refresh automatically.
 */

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { readFile } from "node:fs/promises";
import { request } from "node:https";
import { type } from "node:os";

const AUTH_JSON_PATH = `${process.env.HOME || process.env.USERPROFILE}/.pi/agent/auth.json`;
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface TokenInfo {
  access: string;
  refresh: string;
  expires: number;
  type?: string;
}

/**
 * Read the google-antigravity token from auth.json
 */
async function getGoogleToken(): Promise<TokenInfo | null> {
  try {
    const raw = await readFile(AUTH_JSON_PATH, "utf8");
    const auth = JSON.parse(raw);
    const info = auth["google-antigravity"];
    if (!info || !info.access || !info.refresh) return null;
    return {
      access: info.access,
      refresh: info.refresh,
      expires: info.expires || 0,
      type: info.type || "oauth",
    };
  } catch {
    return null;
  }
}

/**
 * Refresh the access token using the refresh token
 */
async function refreshToken(token: TokenInfo): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const postData = JSON.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: token.refresh,
    grant_type: "refresh_token",
  });

  return new Promise((resolve) => {
    const req = request(
      GOOGLE_OAUTH_TOKEN_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            resolve(data.access_token || null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.write(postData);
    req.end();
  });
}

/**
 * Get a valid access token (refresh if expired)
 */
async function getAccessToken(): Promise<string | null> {
  const token = await getGoogleToken();
  if (!token) return null;

  const nowMs = Date.now();
  if (token.expires && nowMs >= token.expires - 60000) {
    const refreshed = await refreshToken(token);
    if (refreshed) return refreshed;
  }
  return token.access;
}

/**
 * Generic Google API call
 */
async function googleApiCall<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  const url = new URL(path, "https://www.googleapis.com");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }

  return new Promise((resolve) => {
    const req = request(
      url,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body) as T);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.end();
  });
}

/**
 * Fetch Gmail messages
 */
async function fetchGmail(count: number = 10, query?: string): Promise<any> {
  const params: Record<string, string> = {
    maxResults: String(count),
    labelIds: "INBOX",
  };
  if (query) params.q = query;

  const data = await googleApiCall<any>(
    "/gmail/v1/users/me/messages",
    params
  );

  if (!data || !data.messages) return { status: "error", error: "No messages found" };

  const messages = [];
  for (const msg of data.messages.slice(0, count)) {
    const detail = await googleApiCall<any>(`/gmail/v1/users/me/messages/${msg.id}`, { format: "metadata" });
    if (!detail) continue;

    const headers = detail.payload?.headers || [];
    const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || "";

    messages.push({
      id: detail.id,
      from_email: getHeader("From"),
      from_name: getHeader("From").split("<")[0].trim(),
      subject: getHeader("Subject"),
      date: getHeader("Date"),
      preview: detail.snippet || "",
      is_read: !detail.labelIds?.includes("UNREAD"),
    });
  }

  return { status: "ok", emails: messages };
}

/**
 * Fetch Calendar events
 */
async function fetchCalendar(date?: string): Promise<any> {
  const target = date ? new Date(date) : new Date();
  const start = new Date(target);
  start.setHours(0, 0, 0, 0);
  const end = new Date(target);
  end.setHours(23, 59, 59, 999);

  const params = {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    maxResults: "50",
    singleEvents: "true",
    orderBy: "startTime",
  };

  const data = await googleApiCall<any>("/calendar/v3/calendars/primary/events", params);
  if (!data || !data.items) return { status: "error", error: "No events found" };

  const events = data.items.map((item: any) => ({
    id: item.id,
    summary: item.summary || "No title",
    start: item.start?.dateTime || item.start?.date || null,
    end: item.end?.dateTime || item.end?.date || null,
    location: item.location || "",
    description: item.description || "",
  }));

  return { status: "ok", events };
}

/**
 * Fetch Google Tasks
 */
async function fetchTasks(listId: string = "default", prompt?: string): Promise<any> {
  // First, get task lists to find the actual list ID
  const lists = await googleApiCall<any>("/tasks/v1/users/@me/lists");
  let actualListId = listId;
  if (lists?.items?.length > 0) {
    const first = lists.items.find((l: any) => l.id === listId) || lists.items[0];
    actualListId = first.id;
  }

  const data = await googleApiCall<any>(`/tasks/v1/lists/${actualListId}/tasks`, {
    maxResults: "50",
    showCompleted: "true",
  });

  if (!data || !data.items) return { status: "error", error: "No tasks found" };

  const tasks = data.items.map((item: any) => ({
    id: item.id,
    title: item.title || "",
    notes: item.notes || "",
    completed: item.status === "completed",
    due: item.due || null,
  }));

  return { status: "ok", tasks };
}

/**
 * Fetch Google Drive files
 */
async function fetchDrive(count: number = 10, prompt?: string): Promise<any> {
  const params: Record<string, string> = {
    pageSize: String(count),
    orderBy: "modifiedTime desc",
    fields: "files(id,name,mimeType,modifiedTime,webViewLink,thumbnailLink,size)",
  };

  const data = await googleApiCall<any>("/drive/v3/files", params);
  if (!data || !data.files) return { status: "error", error: "No files found" };

  const files = data.files.map((file: any) => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    webViewLink: file.webViewLink,
    thumbnailLink: file.thumbnailLink,
    size: file.size,
  }));

  return { status: "ok", files };
}

// ─── Tool Definitions ───

const fetchGmailTool = defineTool({
  name: "fetch_gmail",
  label: "Fetch Gmail",
  description: "Fetch the latest emails from the user's Gmail inbox. Returns emails with id, subject, from, date, preview.",
  promptSnippet: "Fetch emails from Gmail inbox",
  promptGuidelines: ["Use fetch_gmail when the user needs to retrieve email messages from their Gmail account."],
  parameters: Type.Object({
    count: Type.Optional(Type.Number({ description: "Number of emails to fetch (default 10)" })),
    query: Type.Optional(Type.String({ description: "Gmail search query (e.g., 'from:sender' or 'subject:topic')" })),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const result = await fetchGmail(params.count || 10, params.query);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
});

const fetchCalendarTool = defineTool({
  name: "fetch_calendar",
  label: "Fetch Calendar",
  description: "Fetch calendar events for a specific date. Returns events with id, summary, start, end, location.",
  promptSnippet: "Fetch calendar events",
  promptGuidelines: ["Use fetch_calendar when the user needs to retrieve calendar events from their Google Calendar."],
  parameters: Type.Object({
    date: Type.Optional(Type.String({ description: "Date in YYYY-MM-DD format (default: today)" })),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const result = await fetchCalendar(params.date);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
});

const fetchTasksTool = defineTool({
  name: "fetch_tasks",
  label: "Fetch Tasks",
  description: "Fetch Google Tasks from the user's task list. Returns tasks with id, title, completed, due.",
  promptSnippet: "Fetch Google Tasks",
  promptGuidelines: ["Use fetch_tasks when the user needs to retrieve tasks from their Google Tasks list."],
  parameters: Type.Object({
    listId: Type.Optional(Type.String({ description: "Task list ID (default: first available list)" })),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const result = await fetchTasks(params.listId || "default");
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
});

const fetchDriveTool = defineTool({
  name: "fetch_drive",
  label: "Fetch Drive",
  description: "Fetch recent files from Google Drive. Returns files with id, name, mimeType, modifiedTime, size.",
  promptSnippet: "Fetch recent Google Drive files",
  promptGuidelines: ["Use fetch_drive when the user needs to retrieve recent files from their Google Drive."],
  parameters: Type.Object({
    count: Type.Optional(Type.Number({ description: "Number of files to fetch (default 10)" })),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const result = await fetchDrive(params.count || 10);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(fetchGmailTool);
  pi.registerTool(fetchCalendarTool);
  pi.registerTool(fetchTasksTool);
  pi.registerTool(fetchDriveTool);
}
