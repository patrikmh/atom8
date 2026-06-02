import { useEffect, useState } from 'react'
import { WidgetConfig } from '@/types'
import { Sparkles, Loader2 } from 'lucide-react'
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
      <div className="flex items-center justify-center h-full gap-2 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Researching...</span>
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
      {isLoading ? (
        <div className="flex items-center justify-center h-full gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Researching...</span>
        </div>
      ) : data?.result ? (
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
        <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
          <Sparkles className="w-8 h-8" />
          <span className="text-sm text-center">AI research results will appear here</span>
          <span className="text-xs text-gray-300">{widget.prompt}</span>
        </div>
      )}
    </div>
  )
}

export default AIWidget
