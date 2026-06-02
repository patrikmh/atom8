const API_BASE = (import.meta as any).env?.VITE_API_BASE || 
  (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8000` : 'http://localhost:8000')

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}?_cb=${Date.now()}`
  const res = await fetch(url, {
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  })
  console.log(`[api] ${path} -> ${res.status}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error(`[api] ${path} error:`, err)
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const apiClient = {
  // Data endpoints
  getGmail: (count: number = 10, prompt?: string) =>
    api('/api/data/gmail', { method: 'POST', body: JSON.stringify({ count, prompt }) }),
  
  getCalendar: (date?: string, prompt?: string) =>
    api('/api/data/calendar', { method: 'POST', body: JSON.stringify({ date, prompt }) }),
  
  getTasks: (listId: string = 'default', prompt?: string) =>
    api('/api/data/tasks', { method: 'POST', body: JSON.stringify({ list_id: listId, prompt }) }),
  
  getDrive: (count: number = 10, prompt?: string) =>
    api('/api/data/drive', { method: 'POST', body: JSON.stringify({ count, prompt }) }),

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
    api('/api/ai/research', { method: 'POST', body: JSON.stringify({ topic }) }),
  designSuggestion: (layout: any) =>
    api('/api/ai/design', { method: 'POST', body: JSON.stringify({ layout }) }),

  // Health
  health: () => api<{ status: string }>('/health'),
}
