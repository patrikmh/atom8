/**
 * Living Canvas Research Extension — Comprehensive AI Research
 *
 * Provides robust web research capabilities for the Living Canvas AI research widget.
 * Models after the deep-research skill but in a single-tool, lighter form:
 *   - Multi-phase: Search → Browse → Extract → Summarize
 *   - Multiple search backends with fallback
 *   - Structured content extraction per page
 *   - Returns findings with inline citations
 *
 * Tools:
 *   research_topic   — Deep web research on any topic (companies, people, news, products)
 *   research_gmail   — Search emails for a topic
 *   research_calendar — Find calendar events
 *   research_tasks   — Find tasks
 *   research_drive   — Find recent files
 */

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { readFile } from "node:fs/promises";
import { request } from "node:https";

const AUTH_JSON_PATH = `${process.env.HOME || process.env.USERPROFILE}/.pi/agent/auth.json`;
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

// ─────────────────────────────────────────────────────────────────────────────
// Google API helpers (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Web Research — Lighter deep-research
// ─────────────────────────────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string; // which search engine found it
}

interface PageContent {
  url: string;
  title: string;
  summary: string;
  keyPoints: string[];
  error?: string;
}

interface ResearchResult {
  status: string;
  topic: string;
  summary: string;
  findings: string[];
  sources: PageContent[];
  searchResults: SearchResult[];
  error?: string;
}

/**
 * Detect what kind of research the user is asking for.
 * This helps us pick the right extraction strategy and search queries.
 */
function detectResearchType(topic: string): {
  type: "company" | "person" | "news" | "product" | "general";
  searchQueries: string[];
  extractionStrategy: string;
} {
  const lower = topic.toLowerCase();

  // Company detection
  const companyKeywords = ["company", "företag", "ab", "aktiebolag", "inc", "corp", "llc", "ltd", "group", "startup"];
  const isCompany = companyKeywords.some((k) => lower.includes(k)) || /\b[A-Z][a-z]+\s+(AB|Inc|Corp|LLC|Ltd|Group)\b/.test(topic);

  if (isCompany) {
    return {
      type: "company",
      searchQueries: [`${topic} about`, `${topic} company`, `${topic} LinkedIn`],
      extractionStrategy: "company",
    };
  }

  // Person detection
  const personKeywords = ["person", "people", "founder", "ceo", "director", "author", "researcher"];
  const namePattern = /^[A-Z][a-z]+\s+[A-Z][a-z]+/;
  const isPerson = personKeywords.some((k) => lower.includes(k)) || namePattern.test(topic);

  if (isPerson) {
    return {
      type: "person",
      searchQueries: [`${topic}`, `${topic} LinkedIn`, `${topic} biography`],
      extractionStrategy: "person",
    };
  }

  // News detection
  const newsKeywords = ["news", "nyheter", "latest", "just nu", "breaking", "today", "sportbladet", "aftonbladet"];
  const isNews = newsKeywords.some((k) => lower.includes(k));

  if (isNews) {
    return {
      type: "news",
      searchQueries: [`${topic} latest news`, `${topic}`],
      extractionStrategy: "news",
    };
  }

  // Product detection
  const productKeywords = ["product", "app", "software", "tool", "platform", "review", "comparison"];
  const isProduct = productKeywords.some((k) => lower.includes(k));

  if (isProduct) {
    return {
      type: "product",
      searchQueries: [`${topic} review`, `${topic} features`, `${topic} pricing`],
      extractionStrategy: "product",
    };
  }

  // General fallback
  return {
    type: "general",
    searchQueries: [`${topic}`, `${topic} overview`, `${topic} explained`],
    extractionStrategy: "general",
  };
}

/**
 * Search for URLs using curl to DuckDuckGo HTML (non-JS) and Bing.
 * Returns a list of SearchResults.
 */
async function searchUrls(
  topic: string,
  pi: ExtensionAPI,
  signal?: AbortSignal,
  maxResults: number = 8
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();

  const searchEngines = [
    {
      name: "duckduckgo-html",
      url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(topic)}`,
    },
    {
      name: "duckduckgo-lite",
      url: `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(topic)}`,
    },
    {
      name: "bing",
      url: `https://www.bing.com/search?q=${encodeURIComponent(topic)}`,
    },
  ];

  for (const engine of searchEngines) {
    try {
      const curlResult = await pi.exec(
        "bash",
        [
          "-c",
          `curl -s -L -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --max-time 15 "${engine.url}"`,
        ],
        { signal, timeout: 20000 }
      );

      if (curlResult.code !== 0 || !curlResult.stdout) continue;

      const html = curlResult.stdout;
      const newResults = parseSearchHtml(html, engine.name, maxResults, seenUrls);
      for (const r of newResults) {
        results.push(r);
        seenUrls.add(r.url);
      }
    } catch {
      // ignore single engine failure
    }
  }

  return results;
}

/**
 * Parse HTML from search engines to extract links, titles, snippets.
 */
function parseSearchHtml(
  html: string,
  source: string,
  maxResults: number,
  seenUrls: Set<string>
): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo HTML patterns
  const ddgResultRegex = /<a\s+class="result__a"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const ddgSnippetRegex = /<a\s+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  let snippets: string[] = [];
  let snippetMatch;
  while ((snippetMatch = ddgSnippetRegex.exec(html)) !== null) {
    snippets.push(stripHtml(snippetMatch[1]).trim());
  }

  let snippetIndex = 0;
  while ((match = ddgResultRegex.exec(html)) !== null) {
    if (results.length >= maxResults) break;
    const rawUrl = match[1];
    const title = stripHtml(match[2]).trim();
    const url = cleanUrl(rawUrl);

    if (!url || !title || seenUrls.has(url) || isBlockedDomain(url)) continue;
    seenUrls.add(url);

    results.push({
      title,
      url,
      snippet: snippets[snippetIndex++] || "",
      source,
    });
  }

  // Bing patterns
  const bingTitleRegex = /<a[^>]*href="([^"]+)"[^>]*h="[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const bingSnippetRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;

  let bingSnippets: string[] = [];
  let bingSnippetMatch;
  while ((bingSnippetMatch = bingSnippetRegex.exec(html)) !== null) {
    const text = stripHtml(bingSnippetMatch[1]).trim();
    if (text.length > 20 && text.length < 500) bingSnippets.push(text);
  }

  let bingSnippetIndex = 0;
  while ((match = bingTitleRegex.exec(html)) !== null) {
    if (results.length >= maxResults) break;
    const rawUrl = match[1];
    const title = stripHtml(match[2]).trim();
    const url = cleanUrl(rawUrl);

    if (!url || !title || seenUrls.has(url) || isBlockedDomain(url)) continue;
    seenUrls.add(url);

    results.push({
      title,
      url,
      snippet: bingSnippets[bingSnippetIndex++] || "",
      source,
    });
  }

  return results;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function cleanUrl(url: string): string | null {
  // DuckDuckGo redirects
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return null; // relative

  // Skip tracking / ad URLs
  if (url.includes("google.com/aclk") || url.includes("bing.com/aclick")) return null;
  if (url.includes("duckduckgo.com") || url.includes("google.com/search")) return null;

  return url;
}

function isBlockedDomain(url: string): boolean {
  const blocked = [
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "tiktok.com",
    "youtube.com",
    "pinterest.com",
    "reddit.com",
    "quora.com",
    "tripadvisor.com",
    "yelp.com",
  ];
  return blocked.some((d) => url.includes(d));
}

/**
 * Visit a URL with playwright-cli and extract structured content.
 */
async function browseAndExtract(
  url: string,
  title: string,
  strategy: string,
  pi: ExtensionAPI,
  signal?: AbortSignal,
  timeoutMs: number = 25000
): Promise<PageContent> {
  try {
    // Open the page
    const openResult = await pi.exec("playwright-cli", ["open", url], {
      signal,
      timeout: timeoutMs,
    });

    if (openResult.code !== 0) {
      return {
        url,
        title,
        summary: "",
        keyPoints: [],
        error: `Failed to open: ${openResult.stderr || openResult.stdout}`,
      };
    }

    // Check for CAPTCHA / block
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
        url,
        title,
        summary: "",
        keyPoints: [],
        error: "Page blocked by CAPTCHA / anti-bot",
      };
    }

    // Wait for content
    await pi.exec(
      "playwright-cli",
      ["eval", "await new Promise(r => setTimeout(r, 1500))"],
      { signal, timeout: 10000 }
    );

    // Extract based on strategy
    let evalScript: string;
    switch (strategy) {
      case "company":
        evalScript = companyExtractionScript();
        break;
      case "person":
        evalScript = personExtractionScript();
        break;
      case "news":
        evalScript = newsExtractionScript();
        break;
      case "product":
        evalScript = productExtractionScript();
        break;
      default:
        evalScript = generalExtractionScript();
    }

    const evalResult = await pi.exec("playwright-cli", ["eval", evalScript], {
      signal,
      timeout: 15000,
    });

    // Close browser
    await pi.exec("playwright-cli", ["close"], { signal, timeout: 5000 });

    const extracted = parseEvalOutput(evalResult.stdout);
    if (extracted && typeof extracted === "object" && !Array.isArray(extracted)) {
      return {
        url,
        title: extracted.title || title,
        summary: extracted.summary || "",
        keyPoints: extracted.keyPoints || [],
      };
    }

    return {
      url,
      title,
      summary: "",
      keyPoints: [],
      error: "Could not extract structured content",
    };
  } catch (err: any) {
    try {
      await pi.exec("playwright-cli", ["close"], { signal, timeout: 5000 });
    } catch {}
    return {
      url,
      title,
      summary: "",
      keyPoints: [],
      error: err.message || "Browse failed",
    };
  }
}

// ── Extraction Scripts ─────────────────────────────────────────────

function generalExtractionScript(): string {
  return `() => {
    const title = document.title || '';
    const removeTags = ['script','style','nav','footer','header','aside','noscript','iframe','svg','canvas','form'];
    const clone = document.cloneNode(true);
    removeTags.forEach(tag => clone.querySelectorAll(tag).forEach(el => el.remove()));
    const selectors = ['article','main','[role="main"]','.content','.post-content','.article-content','.entry-content','#content','.main'];
    let text = '';
    for (const sel of selectors) {
      const el = clone.querySelector(sel);
      if (el && el.innerText.length > 300) {
        text = el.innerText;
        break;
      }
    }
    if (!text) text = clone.querySelector('body')?.innerText || '';
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 20);
    const summary = lines.slice(0, 5).join(' ').substring(0, 800);
    const keyPoints = lines.slice(0, 8).filter(l => l.length > 30 && l.length < 200);
    return { title, summary, keyPoints };
  }`;
}

function companyExtractionScript(): string {
  return `() => {
    const title = document.title || '';
    const removeTags = ['script','style','nav','footer','header','aside','noscript','iframe'];
    const clone = document.cloneNode(true);
    removeTags.forEach(tag => clone.querySelectorAll(tag).forEach(el => el.remove()));
    const selectors = ['main','article','[role="main"]','.about','.company','.content','#content'];
    let text = '';
    for (const sel of selectors) {
      const el = clone.querySelector(sel);
      if (el && el.innerText.length > 200) {
        text = el.innerText;
        break;
      }
    }
    if (!text) text = clone.querySelector('body')?.innerText || '';
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 15);
    // Look for structured info
    const info = { founded: '', employees: '', industry: '', location: '', revenue: '', website: '' };
    lines.forEach(line => {
      if (/founded|start|established|grundad/i.test(line)) info.founded = line;
      if (/employee|anställd|staff|team|medarbetare/i.test(line)) info.employees = line;
      if (/industry|sector|bransch/i.test(line)) info.industry = line;
      if (/headquarter|location|office|based in|adress/i.test(line)) info.location = line;
      if (/revenue|turnover|omsättning/i.test(line)) info.revenue = line;
    });
    const summary = lines.slice(0, 6).join(' ').substring(0, 800);
    const keyPoints = [
      ...Object.entries(info).filter(([_, v]) => v).map(([k, v]) => \`\${k}: \${v}\`),
      ...lines.filter(l => l.length > 30 && l.length < 200).slice(0, 6)
    ];
    return { title, summary, keyPoints };
  }`;
}

function personExtractionScript(): string {
  return `() => {
    const title = document.title || '';
    const removeTags = ['script','style','nav','footer','header','aside','noscript','iframe'];
    const clone = document.cloneNode(true);
    removeTags.forEach(tag => clone.querySelectorAll(tag).forEach(el => el.remove()));
    const text = clone.querySelector('body')?.innerText || '';
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 15);
    const info = { role: '', company: '', education: '', location: '', bio: '' };
    lines.forEach(line => {
      if (/ceo|founder|director|manager|engineer|lead|head of|chief/i.test(line)) info.role = line;
      if (/university|college|phd|master|bachelor|degree|utbildning/i.test(line)) info.education = line;
      if (/located|based in|city|region|country/i.test(line)) info.location = line;
    });
    const summary = lines.slice(0, 5).join(' ').substring(0, 800);
    const keyPoints = [
      ...Object.entries(info).filter(([_, v]) => v).map(([k, v]) => \`\${k}: \${v}\`),
      ...lines.filter(l => l.length > 30 && l.length < 200).slice(0, 6)
    ];
    return { title, summary, keyPoints };
  }`;
}

function newsExtractionScript(): string {
  return `() => {
    const title = document.title || '';
    const removeTags = ['script','style','nav','footer','header','aside','noscript','iframe'];
    const clone = document.cloneNode(true);
    removeTags.forEach(tag => clone.querySelectorAll(tag).forEach(el => el.remove()));
    const selectors = ['article','main','.article','.news-article','.post-content','[role="main"]'];
    let text = '';
    for (const sel of selectors) {
      const el = clone.querySelector(sel);
      if (el && el.innerText.length > 200) {
        text = el.innerText;
        break;
      }
    }
    if (!text) text = clone.querySelector('body')?.innerText || '';
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 20);
    const summary = lines.slice(0, 5).join(' ').substring(0, 800);
    const keyPoints = lines.filter(l => l.length > 30 && l.length < 200).slice(0, 8);
    return { title, summary, keyPoints };
  }`;
}

function productExtractionScript(): string {
  return `() => {
    const title = document.title || '';
    const removeTags = ['script','style','nav','footer','header','aside','noscript','iframe'];
    const clone = document.cloneNode(true);
    removeTags.forEach(tag => clone.querySelectorAll(tag).forEach(el => el.remove()));
    const selectors = ['main','article','.product','.content','#content','.review'];
    let text = '';
    for (const sel of selectors) {
      const el = clone.querySelector(sel);
      if (el && el.innerText.length > 200) { text = el.innerText; break; }
    }
    if (!text) text = clone.querySelector('body')?.innerText || '';
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 15);
    const info = { price: '', features: '', rating: '', pros: '', cons: '' };
    lines.forEach(line => {
      if (/price|cost|pricing|kr|usd|\$|€|£/i.test(line)) info.price = line;
      if (/feature|function|capability|supports/i.test(line)) info.features = line;
      if (/rating|review|score|stars/i.test(line)) info.rating = line;
      if (/pros|advantages|benefits|strengths/i.test(line)) info.pros = line;
      if (/cons|disadvantages|drawbacks|limitations/i.test(line)) info.cons = line;
    });
    const summary = lines.slice(0, 5).join(' ').substring(0, 800);
    const keyPoints = [
      ...Object.entries(info).filter(([_, v]) => v).map(([k, v]) => \`\${k}: \${v}\`),
      ...lines.filter(l => l.length > 30 && l.length < 200).slice(0, 6)
    ];
    return { title, summary, keyPoints };
  }`;
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
  const arrMatch = stdout.match(/\{[\s\S]*\}/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]);
    } catch {
      return stdout;
    }
  }
  return stdout;
}

// ── Direct URL Map (for news sites that bypass search) ─────────────────────

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
  bbc: "https://www.bbc.com/news",
  cnn: "https://www.cnn.com",
  reuters: "https://www.reuters.com",
  guardian: "https://www.theguardian.com",
  nyt: "https://www.nytimes.com",
  forbes: "https://www.forbes.com",
  techcrunch: "https://techcrunch.com",
  verge: "https://www.theverge.com",
  wikipedia: "https://en.wikipedia.org/wiki/Special:Search",
};

function inferUrl(topic: string): string | null {
  const lower = topic.toLowerCase();
  if (topic.startsWith("http")) return topic;
  for (const [key, url] of Object.entries(DIRECT_URL_MAP)) {
    if (lower.includes(key)) return url;
  }
  return null;
}

// ── Main Research Orchestrator ───────────────────────────────────────────────

async function doWebResearch(
  topic: string,
  pi: ExtensionAPI,
  signal?: AbortSignal
): Promise<ResearchResult> {
  const researchType = detectResearchType(topic);
  const maxPages = 4;
  const maxSearchResults = 8;

  // Phase 1: Search
  let searchResults: SearchResult[] = [];

  // Try direct URL first for known sites
  const directUrl = inferUrl(topic);
  if (directUrl) {
    searchResults.push({
      title: `Direct: ${topic}`,
      url: directUrl,
      snippet: "",
      source: "direct",
    });
  }

  // Try curl-based search engines
  for (const query of researchType.searchQueries) {
    const engineResults = await searchUrls(query, pi, signal, maxSearchResults);
    for (const r of engineResults) {
      if (!searchResults.find((s) => s.url === r.url)) {
        searchResults.push(r);
      }
    }
    if (searchResults.length >= maxSearchResults) break;
  }

  // If no search results, try the direct URL as fallback
  if (searchResults.length === 0 && directUrl) {
    searchResults = [{ title: topic, url: directUrl, snippet: "", source: "fallback" }];
  }

  if (searchResults.length === 0) {
    return {
      status: "error",
      topic,
      summary: "",
      findings: [],
      sources: [],
      searchResults: [],
      error: "No search results found. The search engines may be blocking automated requests.",
    };
  }

  // Phase 2: Browse top results
  const pages: PageContent[] = [];
  const urlsToBrowse = searchResults.slice(0, maxPages);

  for (const result of urlsToBrowse) {
    const page = await browseAndExtract(
      result.url,
      result.title,
      researchType.extractionStrategy,
      pi,
      signal
    );
    pages.push(page);
  }

  // Phase 3: Summarize
  const successfulPages = pages.filter((p) => !p.error && p.summary);
  const failedPages = pages.filter((p) => p.error);

  if (successfulPages.length === 0) {
    return {
      status: "error",
      topic,
      summary: "",
      findings: [],
      sources: pages,
      searchResults,
      error: `Could not extract content from any page. ${failedPages.map((p) => `${p.url}: ${p.error}`).join("; ")}`,
    };
  }

  // Build findings
  const findings: string[] = [];
  for (const page of successfulPages) {
    if (page.summary) {
      findings.push(`[${page.title || "Source"}](${page.url}): ${page.summary}`);
    }
    for (const point of page.keyPoints.slice(0, 3)) {
      findings.push(`- ${point} ([source](${page.url}))`);
    }
  }

  // Build summary
  const summaryParts = successfulPages.map(
    (p) => `${p.title || "Source"}: ${p.summary?.substring(0, 200) || "..."}`
  );
  const summary = `Found ${successfulPages.length} sources about "${topic}". ${summaryParts.join(" ")}`;

  return {
    status: "ok",
    topic,
    summary,
    findings: findings.slice(0, 15),
    sources: successfulPages,
    searchResults: searchResults.slice(0, 10),
  };
}

// ─── Tool Registration ───

function registerTools(pi: ExtensionAPI) {
  pi.registerTool(
    defineTool({
      name: "research_topic",
      label: "Research Topic",
      description:
        "Perform comprehensive web research on any topic. Uses search engines to find sources, " +
        "then visits the top result pages to extract structured content. Returns a summary with " +
        "findings and citations. Works for companies, people, products, news, and general topics.",
      promptSnippet: "Research a topic on the web",
      promptGuidelines: [
        "Use research_topic when the user asks for research, news, or information about a topic.",
        "The tool searches the web, visits result pages, and extracts structured content.",
        "Results include findings with inline citations to the source URLs.",
      ],
      parameters: Type.Object({
        topic: Type.String({ description: "Topic to research (e.g. 'Tesla company', 'React framework', 'Swedish election news')" }),
      }),

      async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
        const result = await doWebResearch(params.topic, pi, signal);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      },
    })
  );

  pi.registerTool(
    defineTool({
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
    })
  );

  pi.registerTool(
    defineTool({
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
    })
  );

  pi.registerTool(
    defineTool({
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
    })
  );

  pi.registerTool(
    defineTool({
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
    })
  );
}

export default function (pi: ExtensionAPI) {
  registerTools(pi);
}
