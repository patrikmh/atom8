export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  static?: boolean;
}

export type WidgetType = 'gmail' | 'calendar' | 'tasks' | 'drive' | 'ai' | 'custom';

export type Category = 'Gmail' | 'Calendar' | 'Tasks' | 'Drive' | 'AI' | 'Custom';

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  category: Category;
  prompt: string;
  layout: LayoutItem;
  style: WidgetStyle;
  data?: unknown;
  isLoading?: boolean;
  error?: string | null;
  refreshInterval?: number;
}

export interface WidgetStyle {
  backgroundColor: string;
  backgroundOpacity: number;
  borderColor: string;
  borderRadius: number;
  borderWidth: number;
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  shadow: string;
  padding: number;
  margin: number;
}

export type BackgroundMode = 'plain' | 'grid' | 'image' | 'dark';

export interface CanvasBackground {
  mode: BackgroundMode;
  color: string;
  imageUrl?: string;
  gridColor: string;
}

export const DEFAULT_WIDGET_STYLE: WidgetStyle = {
  backgroundColor: '#ffffff',
  backgroundOpacity: 1,
  borderColor: '#e5e7eb',
  borderRadius: 8,
  borderWidth: 1,
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 14,
  fontColor: '#1f2937',
  shadow: '0 1px 3px rgba(0,0,0,0.1)',
  padding: 16,
  margin: 0,
};

export const DEFAULT_CANVAS_BACKGROUND: CanvasBackground = {
  mode: 'plain',
  color: '#f5f5f5',
  gridColor: '#e0e0e0',
};

export const DEFAULT_LAYOUT: WidgetConfig[] = [
  {
    id: 'calendar-today',
    type: 'calendar',
    title: 'Today\'s Events',
    category: 'Calendar',
    prompt: 'Get today\'s calendar events',
    layout: { i: 'calendar-today', x: 0, y: 0, w: 6, h: 4 },
    style: DEFAULT_WIDGET_STYLE,
  },
  {
    id: 'gmail-last-10',
    type: 'gmail',
    title: 'Recent Emails',
    category: 'Gmail',
    prompt: 'Get last 10 emails',
    layout: { i: 'gmail-last-10', x: 6, y: 0, w: 6, h: 4 },
    style: DEFAULT_WIDGET_STYLE,
  },
  {
    id: 'tasks-today',
    type: 'tasks',
    title: 'Today\'s Tasks',
    category: 'Tasks',
    prompt: 'Get today\'s tasks',
    layout: { i: 'tasks-today', x: 0, y: 4, w: 4, h: 3 },
    style: DEFAULT_WIDGET_STYLE,
  },
];

export interface ThemeConfig {
  name: string;
  canvasBg: string;
  widgetBg: string;
  widgetBorder: string;
  widgetText: string;
  headerBg: string;
  accentColor: string;
  sidebarBg: string;
  sidebarText: string;
  shadow: string;
}

export const PREBUILT_THEMES: ThemeConfig[] = [
  {
    name: 'Light',
    canvasBg: '#f5f5f5',
    widgetBg: '#ffffff',
    widgetBorder: '#e5e7eb',
    widgetText: '#1f2937',
    headerBg: '#ffffff',
    accentColor: '#3b82f6',
    sidebarBg: '#ffffff',
    sidebarText: '#374151',
    shadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  {
    name: 'Dark',
    canvasBg: '#1a1a2e',
    widgetBg: '#16213e',
    widgetBorder: '#0f3460',
    widgetText: '#e0e0e0',
    headerBg: '#16213e',
    accentColor: '#e94560',
    sidebarBg: '#16213e',
    sidebarText: '#b0b0b0',
    shadow: '0 4px 12px rgba(0,0,0,0.4)',
  },
  {
    name: 'Ocean',
    canvasBg: '#e0f2fe',
    widgetBg: '#ffffff',
    widgetBorder: '#bae6fd',
    widgetText: '#0c4a6e',
    headerBg: '#f0f9ff',
    accentColor: '#0ea5e9',
    sidebarBg: '#f0f9ff',
    sidebarText: '#0369a1',
    shadow: '0 2px 8px rgba(14,165,233,0.15)',
  },
  {
    name: 'Forest',
    canvasBg: '#f0fdf4',
    widgetBg: '#ffffff',
    widgetBorder: '#bbf7d0',
    widgetText: '#14532d',
    headerBg: '#f0fdf4',
    accentColor: '#22c55e',
    sidebarBg: '#f0fdf4',
    sidebarText: '#166534',
    shadow: '0 2px 8px rgba(34,197,94,0.15)',
  },
  {
    name: 'Sunset',
    canvasBg: '#fff7ed',
    widgetBg: '#ffffff',
    widgetBorder: '#fed7aa',
    widgetText: '#7c2d12',
    headerBg: '#fff7ed',
    accentColor: '#f97316',
    sidebarBg: '#fff7ed',
    sidebarText: '#9a3412',
    shadow: '0 2px 8px rgba(249,115,22,0.15)',
  },
];

export const DEFAULT_THEME = PREBUILT_THEMES[0];

export const COMPONENT_LIBRARY_ITEMS: Omit<WidgetConfig, 'id' | 'layout' | 'style' | 'data'>[] = [
  {
    type: 'gmail',
    title: 'Last N Emails',
    category: 'Gmail',
    prompt: 'Get last {{count}} emails',
  },
  {
    type: 'gmail',
    title: 'Starred Emails',
    category: 'Gmail',
    prompt: 'Get starred emails',
  },
  {
    type: 'calendar',
    title: 'Today\'s Events',
    category: 'Calendar',
    prompt: 'Get today\'s calendar events',
  },
  {
    type: 'calendar',
    title: 'Upcoming Events',
    category: 'Calendar',
    prompt: 'Get upcoming events for next 7 days',
  },
  {
    type: 'tasks',
    title: 'Today\'s Tasks',
    category: 'Tasks',
    prompt: 'Get today\'s tasks',
  },
  {
    type: 'tasks',
    title: 'All Tasks',
    category: 'Tasks',
    prompt: 'Get all tasks',
  },
  {
    type: 'drive',
    title: 'Recent Files',
    category: 'Drive',
    prompt: 'Get recent files',
  },
  {
    type: 'ai',
    title: 'AI Research',
    category: 'AI',
    prompt: 'Research the latest news on {{topic}}',
  },
  {
    type: 'custom',
    title: 'Custom Widget',
    category: 'Custom',
    prompt: 'Custom data query',
  },
];

// ─── API Response Types ───────────────────────────────────────────────────

/** Single email item returned by the backend. */
export interface EmailItem {
  id: string;
  subject: string;
  from_name: string;
  from_email: string;
  date: string;
  preview: string;
  is_read?: boolean;
}

/** Gmail data endpoint response. */
export interface GmailResponse {
  emails: EmailItem[];
  status: 'ok' | 'error';
  error?: string;
  needs_auth?: boolean;
}

/** Single calendar event returned by the backend. */
export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
}

/** Calendar data endpoint response. */
export interface CalendarResponse {
  events: CalendarEvent[];
  date: string;
  status: 'ok' | 'error';
  error?: string;
  needs_auth?: boolean;
}

/** Single task item returned by the backend. */
export interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
  due?: string;
}

/** Tasks data endpoint response. */
export interface TasksResponse {
  tasks: TaskItem[];
  status: 'ok' | 'error';
  error?: string;
  needs_auth?: boolean;
}

/** Single drive file returned by the backend. */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

/** Drive data endpoint response. */
export interface DriveResponse {
  files: DriveFile[];
  status: 'ok' | 'error';
  error?: string;
  needs_auth?: boolean;
}

/** Web research endpoint response. */
export interface ResearchResponse {
  content: string;
  sources?: string[];
  status: 'ok' | 'error';
  error?: string;
}

/** AI summarize endpoint response. */
export interface SummarizeResponse {
  summary: string;
  sources?: string[];
  intent: string;
  status: 'ok' | 'error';
  error?: string;
}

/** Batch /all endpoint response. */
export interface AllDataResponse {
  gmail: GmailResponse;
  calendar: CalendarResponse;
  tasks: TasksResponse;
  drive: DriveResponse;
  status: 'ok' | 'error';
}

/** Generic API error response. */
export interface ApiErrorResponse {
  detail: string;
  status: 'error';
}
