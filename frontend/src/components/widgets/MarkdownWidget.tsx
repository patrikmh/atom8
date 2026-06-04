import { useCallback } from 'react'
import { WidgetConfig } from '@/types'
import { FileText } from 'lucide-react'
import { apiClient } from '@/services/api'
import { useWidgetData } from '@/hooks/useWidgetData'
import { WidgetLoading, WidgetEmpty, WidgetError, WidgetRawText } from './WidgetUI'

interface MarkdownData {
  type?: string
  text?: string
  status?: string
  error?: string
  needs_auth?: boolean
}

const MarkdownWidget = ({ widget }: { widget: WidgetConfig }) => {
  const fetcher = useCallback(async (prompt: string) => {
    const result = await apiClient.research(prompt)
    return { text: result.content || '' } as MarkdownData
  }, [])
  const { data, isLoading, error, fetchedAt, fetchData } = useWidgetData<MarkdownData>(
    widget,
    fetcher,
    'Failed to load markdown content',
  )

  const text = data?.text
  const hasText = !error && text

  if (isLoading) return <WidgetLoading />

  if (error) {
    return <WidgetError message={error} onRetry={fetchData} />
  }

  if (hasText) {
    return <WidgetRawText text={text} onRefresh={fetchData} fetchedAt={fetchedAt} />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 pb-1 border-b border-gray-100">
        <FileText className="w-4 h-4 text-gray-500" />
        <span className="text-xs font-medium text-gray-500">Markdown</span>
      </div>
      <WidgetEmpty message="No markdown content" subtext="Enter a prompt to generate markdown content." onRefresh={fetchData} />
    </div>
  )
}

export default MarkdownWidget