import type {
  GmailResponse,
  CalendarResponse,
  TasksResponse,
  DriveResponse,
  ResearchResponse,
  AllDataResponse,
} from '@/types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  // Only cache-bust data/AI endpoints, not health or auth
  const isDataEndpoint = path.startsWith('/api/data') || path.startsWith('/api/ai')
  const url = isDataEndpoint ? `${API_BASE}${path}?_cb=${Date.now()}` : `${API_BASE}${path}`
  console.log('[api] fetching:', url, 'options:', options)
  const res = await fetch(url, {
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  })
  console.log('[api] response status:', res.status, 'for', url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('[api] error:', err)
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  const data = await res.json()
  console.log('[api] response data:', data)
  return data as Promise<T>
}

export const apiClient = {
  // Data endpoints
  getGmail: (count: number = 10, prompt?: string) =>
    api<GmailResponse>('/api/data/gmail', { method: 'POST', body: JSON.stringify({ count, prompt }) }),

  getCalendar: (date?: string, prompt?: string) =>
    api<CalendarResponse>('/api/data/calendar', { method: 'POST', body: JSON.stringify({ date, prompt }) }),

  getTasks: (listId: string = 'default', prompt?: string) =>
    api<TasksResponse>('/api/data/tasks', { method: 'POST', body: JSON.stringify({ list_id: listId, prompt }) }),

  getDrive: (count: number = 10, prompt?: string) =>
    api<DriveResponse>('/api/data/drive', { method: 'POST', body: JSON.stringify({ count, prompt }) }),

  getAllData: (opts?: {
    gmailCount?: number; gmailPrompt?: string;
    calendarDate?: string; calendarPrompt?: string;
    tasksListId?: string; tasksPrompt?: string;
    driveCount?: number; drivePrompt?: string;
  }) => api<AllDataResponse>('/api/data/all', {
    method: 'POST',
    body: JSON.stringify({
      gmail_count: opts?.gmailCount ?? 10,
      gmail_prompt: opts?.gmailPrompt ?? 'Show my latest emails',
      calendar_date: opts?.calendarDate,
      calendar_prompt: opts?.calendarPrompt ?? "Show today's events",
      tasks_list_id: opts?.tasksListId ?? 'default',
      tasks_prompt: opts?.tasksPrompt ?? 'Show my tasks',
      drive_count: opts?.driveCount ?? 10,
      drive_prompt: opts?.drivePrompt ?? 'Show my files',
    }),
  }),

  // Auth
  getAuthStatus: () => api<{ authenticated: boolean; has_token: boolean; is_expired?: boolean }>('/api/auth/google/status'),
  getAuthUrl: () => api<{ url: string }>('/api/auth/google/url'),
  storeToken: (token: { access_token: string; refresh_token?: string }) =>
    api('/api/auth/google/token', { method: 'POST', body: JSON.stringify(token) }),
  clearAuth: () => api('/api/auth/google', { method: 'DELETE' }),

  // Dashboard
  getLayout: () => api<{ widgets: any; background: any; sidebar_open: boolean }>('/api/dashboard/layout'),
  saveLayout: (data: { widgets_json: string; background_json: string; sidebar_open: boolean }) =>
    api('/api/dashboard/layout', { method: 'POST', body: JSON.stringify(data) }),

  // AI
  sendChatMessage: (message: string, session_id?: string) =>
    api('/api/ai/chat', { method: 'POST', body: JSON.stringify({ message, session_id }) }),
  clearChatSession: (session_id: string) =>
    api('/api/ai/chat/clear', { method: 'POST', body: JSON.stringify({ session_id }) }),
  newChatSession: (session_id?: string) =>
    api('/api/ai/chat/new', { method: 'POST', body: JSON.stringify({ session_id }) }),
  research: (topic: string) =>
    api<ResearchResponse>('/api/ai/research', { method: 'POST', body: JSON.stringify({ topic }) }),
  designSuggestion: (layout: any) =>
    api('/api/ai/design', { method: 'POST', body: JSON.stringify({ layout }) }),

  // Health
  health: () => api<{ status: string }>('/health'),
}
