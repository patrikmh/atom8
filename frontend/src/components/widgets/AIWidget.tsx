import { useCallback } from 'react'
import { WidgetConfig } from '@/types'
import { Search, BookOpen } from 'lucide-react'
import { apiClient } from '@/services/api'
import { useWidgetData } from '@/hooks/useWidgetData'
import { WidgetError } from './WidgetUI'

interface AIResult {
  result?: string
  sources?: string[]
  error?: string
  status?: string
}

const AIWidget = ({ widget }: { widget: WidgetConfig }) => {
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
    const topic = extractTopic(prompt)
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
        result = { result: 'No emails found matching your query.', sources: [] }
      }
    } else if (intent === 'calendar') {
      const data = await apiClient.getCalendar(undefined, prompt) as any
      if (data?.events?.length) {
        const lines = data.events.map((e: any, i: number) =>
          `${i + 1}. ${e.title || e.summary || '(no title)'} at ${e.start || 'N/A'}`
        )
        result = { result: `Found ${data.events.length} event(s):\n${lines.join('\n')}`, sources: [] }
      } else {
        result = { result: 'No events found for your query.', sources: [] }
      }
    } else if (intent === 'tasks') {
      const data = await apiClient.getTasks('default', prompt) as any
      if (data?.tasks?.length) {
        const lines = data.tasks.map((t: any, i: number) =>
          `${i + 1}. ${t.completed ? '✓' : '○'} ${t.title || '(no title)'}`
        )
        result = { result: `Found ${data.tasks.length} task(s):\n${lines.join('\n')}`, sources: [] }
      } else {
        result = { result: 'No tasks found for your query.', sources: [] }
      }
    } else if (intent === 'drive') {
      const data = await apiClient.getDrive(10, prompt) as any
      if (data?.files?.length) {
        const lines = data.files.map((f: any, i: number) =>
          `${i + 1}. ${f.name || '(no name)'} (${f.mime_type || 'unknown'})`
        )
        result = { result: `Found ${data.files.length} file(s):\n${lines.join('\n')}`, sources: [] }
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

  if (isLoading) {
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

  if (error) {
    return (
      <WidgetError
        message={error}
        onRetry={fetchData}
      />
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
