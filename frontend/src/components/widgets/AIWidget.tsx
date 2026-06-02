import { useEffect, useState } from 'react'
import { WidgetConfig } from '@/types'
import { Sparkles, RefreshCw, Search, BookOpen } from 'lucide-react'
import { apiClient } from '@/services/api'
import { useLayoutStore } from '@/stores/layoutStore'

const AIWidget = ({ widget }: { widget: WidgetConfig }) => {
  const [localData, setLocalData] = useState<{ result?: string; sources?: string[] } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setWidgetData = useLayoutStore((s) => s.setWidgetData)
  const setWidgetLoading = useLayoutStore((s) => s.setWidgetLoading)
  const setWidgetError = useLayoutStore((s) => s.setWidgetError)
  const refreshTrigger = useLayoutStore((s) => s.refreshTriggers[widget.id])

  const extractTopic = (prompt: string): string => {
    // If prompt contains a placeholder, the actual topic is what remains after removing it
    // and any surrounding template text. Use the last part as the topic.
    const topic = prompt.replace(/\{\{topic\}\}/g, '').trim()
    if (topic && topic !== prompt) {
      return topic.replace(/Research the latest news on\s*/i, '').trim() || 'general'
    }
    // No placeholder — strip known prefixes and return the rest
    return prompt.replace(/Research the latest news on\s*/i, '').trim() || 'general'
  }

  const fetchData = async () => {
    setIsLoading(true)
    setError(null)
    setWidgetLoading(widget.id, true)
    setWidgetError(widget.id, null)
    try {
      const topic = extractTopic(widget.prompt)
      const data = await apiClient.research(topic) as { content?: string; sources?: string[] }
      const result = { result: data?.content || '', sources: data?.sources || [] }
      setLocalData(result)
      setWidgetData(widget.id, result)
    } catch (err: any) {
      const msg = err.message || 'Failed to research'
      setError(msg)
      setWidgetError(widget.id, msg)
    } finally {
      setIsLoading(false)
      setWidgetLoading(widget.id, false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id, refreshTrigger])

  const data = (widget.data as { result?: string; sources?: string[] } | undefined) || localData || null
  const displayLoading = widget.isLoading || isLoading
  const displayError = widget.error || error

  if (displayLoading) {
    return (
      <div className="space-y-3 py-4">
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
    )
  }

  if (displayError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-red-300" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-red-500">{displayError}</p>
          <p className="text-xs text-gray-400">Check your connection or try again.</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {data?.result ? (
        <div className="space-y-3">
          <div className="text-sm leading-relaxed">{data.result}</div>
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
        <div className="flex flex-col items-center justify-center h-full text-center p-4 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center">
            <Search className="w-6 h-6 text-purple-300" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-600">Ready to research</p>
            <p className="text-xs text-gray-400 max-w-[180px]">Results will appear here when data is loaded.</p>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-gray-300 px-2 py-1 rounded bg-gray-50">
            <BookOpen className="w-3 h-3" />
            <span className="truncate max-w-[160px]">{widget.prompt}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default AIWidget
