/**
 * Living Canvas Research Extension — AI research widget support
 * 
 * Provides custom tools for the Living Canvas AI research widget:
 * - research_topic: perform web research on a topic
 * - research_gmail: search emails for a topic
 * - research_calendar: find events related to a topic
 * - research_tasks: find tasks related to a topic
 * - research_drive: find files related to a topic
 * 
 * All tools read Google OAuth tokens from ~/.pi/agent/auth.json (google-antigravity)
 * and handle token refresh automatically.
 */

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { readFile } from "node:fs/promises";
import { request } from "node:https";

const AUTH_JSON_PATH = `${process.env.HOME || process.env.USERPROFILE}/.pi/agent/auth.json`;
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface TokenInfo {
  access: string;
  refresh: string;
  expires: number;
  type?: string;
}

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

async function fetchGmail(count: number = 10, query?: string): Promise<any> {
  const params: Record<string, string> = {
    maxResults: String(count),
    labelIds: "INBOX",
  };
  if (query) params.q = query;

  const data = await googleApiCall<any>("/gmail/v1/users/me/messages", params);
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

async function fetchTasks(listId: string = "default"): Promise<any> {
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

async function fetchDrive(count: number = 10): Promise<any> {
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

// Map common topic keywords to direct URLs to avoid search-engine CAPTCHAs
const DIRECT_URL_MAP: Record<string, string> = {
  sportbladet: "https://www.sportbladet.se",
  aftonbladet: "https://www.aftonbladet.se",
  svt: "https://www.svt.se",
  expressen: "https://www.expressen.se",
  dn: "https://www.dn.se",
  svd: "https://www.svd.se",
  di: "https://www.di.se",
  gp: "https://www.gp.se",
  sydsvenskan: "https://www.sydsvenskan.se",
  hd: "https://www.hd.se",
  hn: "https://www.hn.se",
  nt: "https://www.nt.se",
  vk: "https://www.vk.se",
  op: "https://www.op.se",
  gd: "https://www.gd.se",
  arbetarbladet: "https://www.arbetarbladet.se",
  norrländska: "https://www.norrländska.se",
  norran: "https://www.norran.se",
  norrteljetidning: "https://www.norrteljetidning.se",
  upsala: "https://www.unt.se",
  unt: "https://www.unt.se",
  mitti: "https://www.mitti.se",
  metro: "https://www.metro.se",
  nyheter: "https://www.svt.se/nyheter",
  bbc: "https://www.bbc.com/news",
  cnn: "https://www.cnn.com",
  reuters: "https://www.reuters.com",
  ap: "https://apnews.com",
  guardian: "https://www.theguardian.com",
  nyt: "https://www.nytimes.com",
  washingtonpost: "https://www.washingtonpost.com",
  forbes: "https://www.forbes.com",
  techcrunch: "https://techcrunch.com",
  verge: "https://www.theverge.com",
  arstechnica: "https://arstechnica.com",
  hackernews: "https://news.ycombinator.com",
  reddit: "https://www.reddit.com",
  twitter: "https://twitter.com",
  x: "https://x.com",
  linkedin: "https://www.linkedin.com",
  github: "https://github.com",
  youtube: "https://www.youtube.com",
  wikipedia: "https://en.wikipedia.org/wiki/Special:Search",
};

function inferUrl(topic: string): string {
  const lower = topic.toLowerCase();
  if (topic.startsWith("http")) return topic;
  for (const [key, url] of Object.entries(DIRECT_URL_MAP)) {
    if (lower.includes(key)) return url;
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(topic)}`;
}

function parseEvalOutput(stdout: string): any {
  const marker = "### Result";
  const idx = stdout.indexOf(marker);
  if (idx !== -1) {
    const after = stdout.slice(idx + marker.length).trim();
    try {
      return JSON.parse(after);
    } catch {
      return after;
    }
  }
  // Try to find any JSON array in the output
  const arrMatch = stdout.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]);
    } catch {
      return stdout;
    }
  }
  return stdout;
}

async function doWebResearch(
  topic: string,
  pi: ExtensionAPI,
  signal?: AbortSignal
): Promise<any> {
  const url = inferUrl(topic);

  // Step 1: Open browser
  const openResult = await pi.exec("playwright-cli", ["open", url], {
    signal,
    timeout: 20000,
  });
  if (openResult.code !== 0) {
    return {
      status: "error",
      error: `Browser open failed: ${openResult.stderr || openResult.stdout}`,
    };
  }

  // Step 2: Check for CAPTCHA / block pages
  const snapResult = await pi.exec("playwright-cli", ["snapshot"], {
    signal,
    timeout: 15000,
  });
  const snapLower = snapResult.stdout.toLowerCase();
  if (
    snapLower.includes("captcha") ||
    snapLower.includes("ett sista steg") ||
    snapLower.includes("lös utmaningen") ||
    snapLower.includes("sorry, bots") ||
    snapLower.includes("verify you are human") ||
    snapLower.includes("i'm not a robot")
  ) {
    await pi.exec("playwright-cli", ["close"], { signal, timeout: 5000 });
    return {
      status: "error",
      error:
        "The site blocked the automated request (CAPTCHA). Try a different topic or visit the site directly.",
    };
  }

  // Step 3: Extract structured data via eval
  const extractScript = `() => {
    const results = [];
    const seen = new Set();
    const articles = document.querySelectorAll('article, [data-testid="article"], .article, .news-item, .story, .teaser, .post, .card');
    articles.forEach(article => {
      const link = article.querySelector('a');
      const heading = article.querySelector('h1, h2, h3, h4, .title, .headline, [data-testid="result-title"], [data-testid="article-title"]');
      const snippet = article.querySelector('p, .summary, .description, .excerpt, [data-testid="result-snippet"]');
      const timeEl = article.querySelector('time, .time, .date, [data-testid="article-date"]');
      if (link && heading) {
        const href = link.href || link.getAttribute('href');
        if (!href || seen.has(href)) return;
        seen.add(href);
        results.push({
          title: heading.textContent.trim().replace(/\\s+/g, ' '),
          url: href,
          snippet: snippet ? snippet.textContent.trim().replace(/\\s+/g, ' ').substring(0, 300) : '',
          date: timeEl ? timeEl.textContent.trim() : ''
        });
      }
    });
    // Fallback: grab any link with meaningful text inside article-like containers
    if (results.length === 0) {
      const allLinks = document.querySelectorAll('a');
      allLinks.forEach(link => {
        const href = link.href || link.getAttribute('href');
        if (!href || seen.has(href)) return;
        const text = link.textContent.trim();
        if (text.length > 20 && href.startsWith('http') && !href.includes('/sok') && !href.includes('/search')) {
          seen.add(href);
          results.push({ title: text.replace(/\\s+/g, ' ').substring(0, 200), url: href, snippet: '', date: '' });
        }
      });
    }
    return results.slice(0, 12);
  }`;

  const extractResult = await pi.exec(
    "playwright-cli",
    ["eval", extractScript],
    { signal, timeout: 15000 }
  );

  // Step 4: Close browser
  await pi.exec("playwright-cli", ["close"], { signal, timeout: 5000 });

  // Step 5: Parse results
  let results: any[] = [];
  try {
    const parsed = parseEvalOutput(extractResult.stdout);
    if (Array.isArray(parsed)) {
      results = parsed;
    }
  } catch {
    // ignore parse error
  }

  return {
    status: "ok",
    topic,
    summary: `Found ${results.length} results for "${topic}".`,
    results,
    sources: results.map((r: any) => r.url),
  };
}

// ─── Tool Registration ───

function registerTools(pi: ExtensionAPI) {
  pi.registerTool(defineTool({
    name: "research_topic",
    label: "Research Topic",
    description: "Perform web research on a topic and return a summary with sources.",
    promptSnippet: "Research a topic on the web",
    promptGuidelines: ["Use research_topic when the user asks for research, news, or information about a topic."],
    parameters: Type.Object({
      topic: Type.String({ description: "Topic to research" }),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const result = await doWebResearch(params.topic, pi, signal);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  }));

  pi.registerTool(defineTool({
    name: "research_gmail",
    label: "Research Gmail",
    description: "Search emails for a topic and return matching emails.",
    promptSnippet: "Search emails for a topic",
    promptGuidelines: ["Use research_gmail when the user asks about emails related to a topic."],
    parameters: Type.Object({
      topic: Type.String({ description: "Topic to search for" }),
      count: Type.Optional(Type.Number({ description: "Number of emails to fetch (default 10)" })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await fetchGmail(params.count || 10, params.topic);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  }));

  pi.registerTool(defineTool({
    name: "research_calendar",
    label: "Research Calendar",
    description: "Find calendar events related to a topic.",
    promptSnippet: "Find calendar events for a topic",
    promptGuidelines: ["Use research_calendar when the user asks about events related to a topic."],
    parameters: Type.Object({
      date: Type.Optional(Type.String({ description: "Date to search (default: today)" })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await fetchCalendar(params.date);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  }));

  pi.registerTool(defineTool({
    name: "research_tasks",
    label: "Research Tasks",
    description: "Find tasks related to a topic.",
    promptSnippet: "Find tasks related to a topic",
    promptGuidelines: ["Use research_tasks when the user asks about tasks related to a topic."],
    parameters: Type.Object({
      listId: Type.Optional(Type.String({ description: "Task list ID (default: first available)" })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await fetchTasks(params.listId || "default");
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  }));

  pi.registerTool(defineTool({
    name: "research_drive",
    label: "Research Drive",
    description: "Find files related to a topic.",
    promptSnippet: "Find recent files",
    promptGuidelines: ["Use research_drive when the user asks about files related to a topic."],
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
  }));
}

export default function (pi: ExtensionAPI) {
  registerTools(pi);
}
