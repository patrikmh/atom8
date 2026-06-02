import { useEffect, useState } from 'react'
import { WidgetConfig } from '@/types'
import { Puzzle, Loader2, Mail, Calendar, CheckSquare, HardDrive, Globe, Sparkles, ChevronRight } from 'lucide-react'
import { apiClient } from '@/services/api'
import { useLayoutStore } from '@/stores/layoutStore'

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
  const [localData, setLocalData] = useState<{ result?: string; sources?: string[] } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setWidgetData = useLayoutStore((s) => s.setWidgetData)
  const setWidgetLoading = useLayoutStore((s) => s.setWidgetLoading)
  const setWidgetError = useLayoutStore((s) => s.setWidgetError)
  const updateWidgetPrompt = useLayoutStore((s) => s.updateWidgetPrompt)
  const triggerRefresh = useLayoutStore((s) => s.triggerRefresh)
  const refreshTrigger = useLayoutStore((s) => s.refreshTriggers[widget.id])

  const defaultPrompt = isDefaultPrompt(widget.prompt)

  const fetchData = async () => {
    if (defaultPrompt) return
    setIsLoading(true)
    setError(null)
    setWidgetLoading(widget.id, true)
    setWidgetError(widget.id, null)
    try {
      const data = await apiClient.research(widget.prompt) as { content?: string; sources?: string[]; status?: string }
      const result = { result: data?.content || '', sources: data?.sources || [] }
      setLocalData(result)
      setWidgetData(widget.id, result)
    } catch (err: any) {
      const msg = err.message || 'Failed to fetch data'
      setError(msg)
      setWidgetError(widget.id, msg)
    } finally {
      setIsLoading(false)
      setWidgetLoading(widget.id, false)
    }
  }

  useEffect(() => {
    if (!widget.data && !localData && !defaultPrompt) {
      fetchData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id, refreshTrigger, widget.prompt])

  const data = (widget.data as { result?: string; sources?: string[] } | undefined) || localData || null
  const displayLoading = widget.isLoading || isLoading
  const displayError = widget.error || error

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

  if (displayLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading...</span>
      </div>
    )
  }

  if (displayError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <Sparkles className="w-8 h-8 text-red-300 mb-2" />
        <p className="text-sm text-red-500">{displayError}</p>
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
