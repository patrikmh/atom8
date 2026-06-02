import { useCallback } from 'react'
import { WidgetConfig } from '@/types'
import { Puzzle, Loader2, Mail, Calendar, CheckSquare, HardDrive, Globe, Sparkles, ChevronRight } from 'lucide-react'
import { apiClient } from '@/services/api'
import { useWidgetData } from '@/hooks/useWidgetData'
import { useLayoutStore } from '@/stores/layoutStore'

interface CustomData {
  result?: string
  sources?: string[]
  error?: string
  status?: string
}

const QUICK_PROMPTS = [
  { icon: <Mail className="w-4 h-4" />, label: 'Emails', prefix: 'Find emails about ' },
  { icon: <Calendar className="w-4 h-4" />, label: 'Events', prefix: 'Get calendar events for ' },
  { icon: <CheckSquare className="w-4 h-4" />, label: 'Tasks', prefix: 'Get tasks for ' },
  { icon: <HardDrive className="w-4 h-4" />, label: 'Files', prefix: 'Find recent files in ' },
  { icon: <Globe className="w-4 h-4" />, label: 'Web', prefix: 'Research latest news on ' },
]

const isDefaultPrompt = (prompt: string) => {
  const trimmed = prompt.trim().toLowerCase()
  return trimmed === 'custom data query' || trimmed === ''
}

const CustomWidget = ({ widget }: { widget: WidgetConfig }) => {
  const updateWidgetPrompt = useLayoutStore((s) => s.updateWidgetPrompt)
  const triggerRefresh = useLayoutStore((s) => s.triggerRefresh)

  const defaultPrompt = isDefaultPrompt(widget.prompt)

  const detectIntent = (prompt: string): 'gmail' | 'calendar' | 'tasks' | 'drive' | 'research' => {
    const p = prompt.toLowerCase()
    if (p.includes('email') || p.includes('mail') || p.includes('inbox') || p.includes('message')) return 'gmail'
    if (p.includes('calendar') || p.includes('event') || p.includes('meeting') || p.includes('schedule')) return 'calendar'
    if (p.includes('task') || p.includes('todo') || p.includes('checklist')) return 'tasks'
    if (p.includes('file') || p.includes('drive') || p.includes('document') || p.includes('folder')) return 'drive'
    return 'research'
  }

  const fetcher = useCallback(async (prompt: string) => {
    if (isDefaultPrompt(prompt)) {
      return { result: '', sources: [] } as CustomData
    }

    const intent = detectIntent(prompt)
    let result: { result: string; sources: string[] } = { result: '', sources: [] }

    if (intent === 'gmail') {
      const data = await apiClient.getGmail(10, prompt) as any
      if (data?.emails?.length) {
        const lines = data.emails.map((e: any, i: number) =>
          `${i + 1}. ${e.subject || '(no subject)'} from ${e.from_name || e.from_email || 'Unknown'}`
        )
        result = { result: `Found ${data.emails.length} email(s):\n${lines.join('\n')}`, sources: [] }
      } else {
        result = { result: 'No emails found.', sources: [] }
      }
    } else if (intent === 'calendar') {
      const data = await apiClient.getCalendar(undefined, prompt) as any
      if (data?.events?.length) {
        const lines = data.events.map((e: any, i: number) =>
          `${i + 1}. ${e.title || e.summary || '(no title)'} at ${e.start || 'N/A'}`
        )
        result = { result: `Found ${data.events.length} event(s):\n${lines.join('\n')}`, sources: [] }
      } else {
        result = { result: 'No events found.', sources: [] }
      }
    } else if (intent === 'tasks') {
      const data = await apiClient.getTasks('default', prompt) as any
      if (data?.tasks?.length) {
        const lines = data.tasks.map((t: any, i: number) =>
          `${i + 1}. ${t.completed ? '✓' : '○'} ${t.title || '(no title)'}`
        )
        result = { result: `Found ${data.tasks.length} task(s):\n${lines.join('\n')}`, sources: [] }
      } else {
        result = { result: 'No tasks found.', sources: [] }
      }
    } else if (intent === 'drive') {
      const data = await apiClient.getDrive(10, prompt) as any
      if (data?.files?.length) {
        const lines = data.files.map((f: any, i: number) =>
          `${i + 1}. ${f.name || '(no name)'} (${f.mime_type || 'unknown'})`
        )
        result = { result: `Found ${data.files.length} file(s):\n${lines.join('\n')}`, sources: [] }
      } else {
        result = { result: 'No files found.', sources: [] }
      }
    } else {
      const data = await apiClient.research(prompt) as { content?: string; sources?: string[]; status?: string }
      result = { result: data?.content || '', sources: data?.sources || [] }
    }

    return result as CustomData
  }, [])

  const { data, isLoading, error, fetchData } = useWidgetData<CustomData>(
    widget,
    fetcher,
    'Failed to fetch data',
  )

  const handleQuickPrompt = (prefix: string) => {
    updateWidgetPrompt(widget.id, prefix)
    setTimeout(() => triggerRefresh(widget.id), 100)
  }

  if (defaultPrompt) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-4 text-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center border border-blue-100">
          <Puzzle className="w-6 h-6 text-blue-500" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-700">Custom Widget</h3>
          <p className="text-xs text-gray-400 max-w-[180px]">
            Edit the prompt below to fetch emails, calendar, tasks, files, or research the web.
          </p>
        </div>
        <div className="w-full space-y-1">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p.label}
              onClick={() => handleQuickPrompt(p.prefix)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg border hover:bg-gray-50 transition-colors group"
              style={{ borderColor: '#e5e7eb' }}
            >
              <span className="flex items-center gap-2 text-gray-600">
                {p.icon}
                {p.label}
              </span>
              <ChevronRight className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading...</span>
      </div>
    )
  }

  if (error) {
    const isTimeout = error.toLowerCase().includes('timeout') || error.toLowerCase().includes('timed out')
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4 gap-2">
        <Sparkles className="w-8 h-8 text-red-300 mb-2" />
        <p className="text-sm text-red-500">{error}</p>
        <p className="text-xs text-gray-400 max-w-[180px]">
          {isTimeout
            ? 'The AI agent timed out. Try a Google data quick prompt for faster results.'
            : 'Check your connection or try again.'}
        </p>
        <button
          onClick={fetchData}
          className="mt-2 text-xs text-blue-500 hover:text-blue-600 font-medium"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {data?.result ? (
        <div className="space-y-3">
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{data.result}</div>
          {data.sources && data.sources.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-500 uppercase">Sources</div>
              {data.sources.map((source, idx) => (
                <a
                  key={idx}
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-blue-500 hover:underline truncate"
                >
                  {source}
                </a>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
          <Puzzle className="w-8 h-8" />
          <span className="text-sm text-center">Results will appear here</span>
        </div>
      )}
    </div>
  )
}

export default CustomWidget
