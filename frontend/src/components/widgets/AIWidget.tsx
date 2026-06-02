import { useState, useCallback, useRef, useEffect } from 'react'
import { WidgetConfig } from '@/types'
import { Search, Send, Loader2, Globe, Mail, Calendar, CheckSquare, HardDrive, X, Pencil, Check } from 'lucide-react'
import { apiClient } from '@/services/api'
import { useWidgetData } from '@/hooks/useWidgetData'
import { useLayoutStore } from '@/stores/layoutStore'
import { WidgetError } from './WidgetUI'

interface SourceItem {
  url?: string
  title?: string
  date?: string
}

interface AIResult {
  result?: string
  sources?: (string | SourceItem)[]
  error?: string
  status?: string
}

const QUICK_PROMPTS = [
  { icon: <Globe className="w-4 h-4" />, label: 'Web', prefix: 'Research latest news on ' },
  { icon: <Mail className="w-4 h-4" />, label: 'Emails', prefix: 'Find emails about ' },
  { icon: <Calendar className="w-4 h-4" />, label: 'Events', prefix: 'Get calendar events for ' },
  { icon: <CheckSquare className="w-4 h-4" />, label: 'Tasks', prefix: 'Get tasks for ' },
  { icon: <HardDrive className="w-4 h-4" />, label: 'Files', prefix: 'Find recent files in ' },
]

const isDefaultPrompt = (prompt: string) => {
  const trimmed = prompt.trim().toLowerCase()
  return trimmed === 'ai research' || trimmed === '' || trimmed === 'research'
}

const AIWidget = ({ widget }: { widget: WidgetConfig }) => {
  const [input, setInput] = useState(widget.prompt)
  const [isEditing, setIsEditing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const updateWidgetPrompt = useLayoutStore((s) => s.updateWidgetPrompt)
  const triggerRefresh = useLayoutStore((s) => s.triggerRefresh)

  const defaultPrompt = isDefaultPrompt(widget.prompt)

  // Auto-focus textarea when editing starts
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(input.length, input.length)
    }
  }, [isEditing, input])

  const extractTopic = (prompt: string): string => {
    const topic = prompt.replace(/\{\{topic\}\}/g, '').trim()
    if (topic && topic !== prompt) {
      return topic.replace(/Research the latest news on\s*/i, '').trim() || 'general'
    }
    return prompt.replace(/Research the latest news on\s*/i, '').trim() || 'general'
  }

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
      return { result: '', sources: [] } as AIResult
    }

    const topic = extractTopic(prompt)
    const intent = detectIntent(prompt)
    let result: { result: string; sources: string[] } = { result: '', sources: [] }

    if (intent === 'gmail') {
      const data = await apiClient.getGmail(10, prompt) as any
      if (data?.data?.length) {
        result = { result: data.data.join('\n\n'), sources: [] }
      } else {
        result = { result: 'No emails found matching your query.', sources: [] }
      }
    } else if (intent === 'calendar') {
      const data = await apiClient.getCalendar(undefined, prompt) as any
      if (data?.data?.length) {
        result = { result: data.data.join('\n\n'), sources: [] }
      } else {
        result = { result: 'No events found for your query.', sources: [] }
      }
    } else if (intent === 'tasks') {
      const data = await apiClient.getTasks('default', prompt) as any
      if (data?.data?.length) {
        result = { result: data.data.join('\n\n'), sources: [] }
      } else {
        result = { result: 'No tasks found for your query.', sources: [] }
      }
    } else if (intent === 'drive') {
      const data = await apiClient.getDrive(10, prompt) as any
      if (data?.data?.length) {
        result = { result: data.data.join('\n\n'), sources: [] }
      } else {
        result = { result: 'No files found for your query.', sources: [] }
      }
    } else {
      const data = await apiClient.research(topic) as { content?: string; sources?: string[] }
      result = { result: data?.content || '', sources: data?.sources || [] }
    }

    return result as AIResult
  }, [])

  const { data, isLoading, error, fetchData } = useWidgetData<AIResult>(
    widget,
    fetcher,
    'Failed to research',
  )

  const handleSubmit = () => {
    if (!input.trim()) return
    updateWidgetPrompt(widget.id, input.trim())
    setIsEditing(false)
    setTimeout(() => triggerRefresh(widget.id), 50)
  }

  const handleCancel = () => {
    setInput(widget.prompt)
    setIsEditing(false)
  }

  const handleQuickPrompt = (prefix: string) => {
    setInput(prefix)
    setIsEditing(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !defaultPrompt) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      handleCancel()
    }
  }

  // ── Prompt Bar (shared between all states) ──
  const PromptBar = () => {
    if (isEditing) {
      return (
        <div className="px-3 py-2 border-b border-purple-100 bg-purple-50/50">
          <div className="flex items-start gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your research query..."
              rows={2}
              className="flex-1 text-xs bg-white rounded-md border border-purple-200 px-3 py-2 outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200 text-gray-700 placeholder:text-gray-400 resize-none min-h-[44px]"
            />
            <div className="flex flex-col gap-1 shrink-0">
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isLoading}
                className="p-1.5 rounded-md bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Save & run"
              >
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              </button>
              <button
                onClick={handleCancel}
                className="p-1.5 rounded-md bg-white text-gray-500 hover:text-gray-700 border border-gray-200 transition-colors"
                title="Cancel"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 group cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={() => { setInput(widget.prompt); setIsEditing(true) }}
      >
        <span className="text-xs text-gray-600 truncate flex-1 font-medium">
          {defaultPrompt ? 'Click to enter a query...' : widget.prompt}
        </span>
        <button
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-purple-500 hover:bg-purple-50 transition-all"
          title="Edit prompt"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    )
  }

  // ── Default state (no prompt yet) ──
  if (defaultPrompt) {
    return (
      <div className="flex flex-col h-full">
        <PromptBar />
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center border border-purple-100">
            <Search className="w-6 h-6 text-purple-500" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-700">AI Research</h3>
            <p className="text-xs text-gray-400 max-w-[180px]">
              Enter a topic to research the web, or query your Google data.
            </p>
          </div>
          <div className="w-full space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white focus-within:border-purple-300 focus-within:ring-1 focus-within:ring-purple-200 transition-all">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a topic or question..."
                className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
                autoFocus
              />
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isLoading}
                className="shrink-0 p-1.5 rounded-md bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => handleQuickPrompt(p.prefix)}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] rounded-md border border-gray-100 hover:bg-gray-50 transition-colors text-gray-500"
                >
                  {p.icon}
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PromptBar />
        <div className="flex-1 space-y-3 py-4 px-3">
          <div className="flex items-center gap-2 animate-pulse">
            <div className="w-8 h-8 rounded-lg bg-gray-200" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-gray-200 rounded w-3/5" />
              <div className="h-2.5 bg-gray-200 rounded w-4/5" />
            </div>
          </div>
          <div className="h-2 bg-gray-200 rounded w-full animate-pulse" />
          <div className="h-2 bg-gray-200 rounded w-5/6 animate-pulse" />
          <div className="h-2 bg-gray-200 rounded w-4/6 animate-pulse" />
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="flex flex-col h-full">
        <PromptBar />
        <div className="flex-1">
          <WidgetError message={error} onRetry={fetchData} />
        </div>
      </div>
    )
  }

  // ── Results state ──
  return (
    <div className="flex flex-col h-full">
      <PromptBar />
      <div className="flex-1 overflow-auto p-3">
        {data?.result ? (
          <div className="space-y-3">
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{data.result}</div>
            {data.sources && data.sources.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-gray-500 uppercase">Sources</div>
                {data.sources.map((source, idx) => (
                  <a
                    key={idx}
                    href={typeof source === 'string' ? source : source.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-blue-500 hover:underline truncate"
                  >
                    {typeof source === 'string' ? source : source.title || source.url || 'Source'}
                  </a>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center">
              <Search className="w-6 h-6 text-purple-300" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-600">Ready to research</p>
              <p className="text-xs text-gray-400 max-w-[180px]">Results will appear here when data is loaded.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AIWidget
