import { useCallback } from 'react'
import { WidgetConfig } from '@/types'
import { BookOpen, ExternalLink } from 'lucide-react'
import { apiClient } from '@/services/api'
import { useWidgetData } from '@/hooks/useWidgetData'
import { WidgetLoading, WidgetEmpty, WidgetError, WidgetRawText, WidgetRefreshBar } from './WidgetUI'

import type { ParsedData } from '@/types'

interface NotionData {
  type?: string
  text?: string
  data?: ParsedData
  pages?: any[]
  items?: any[]
  files?: any[]
  docs?: any[]
  error?: string
  status?: string
  needs_auth?: boolean
}

const NotionWidget = ({ widget }: { widget: WidgetConfig }) => {
  const fetcher = useCallback((prompt: string) => apiClient.getNotion(10, prompt), [])
  const { data, isLoading, error, fetchedAt, fetchData } = useWidgetData<NotionData>(
    widget,
    fetcher,
    'Failed to load Notion pages',
  )

  // The backend may return pages or items or files
  const rawPages = data?.pages || data?.items || data?.data?.pages || data?.data?.items || data?.data?.files || data?.data?.docs || []
  const pages = error ? [] : rawPages
  const text = data?.text
  const hasText = !error && text

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '—'
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)
    if (diffSec < 60) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHour < 24) return `${diffHour}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (isLoading) return <WidgetLoading />

  if (error) {
    return <WidgetError message={error} onRetry={fetchData} />
  }

  if (hasText) {
    return <WidgetRawText text={text} onRefresh={fetchData} fetchedAt={fetchedAt} />
  }

  if (pages.length === 0) {
    return <WidgetEmpty message="No Notion pages found" subtext="Try a different search or check your Notion workspace." onRefresh={fetchData} />
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2 pb-1 border-b border-gray-100">
        <BookOpen className="w-4 h-4 text-sky-500" />
        <span className="text-xs font-medium text-gray-500">
          {pages.length} page{pages.length !== 1 ? 's' : ''}
        </span>
      </div>
      {pages.slice(0, 10).map((page: any) => {
        const url = page.url || page.webViewLink || page.link
        const title = page.title || page.name || page.filename || page.plain_text || 'Untitled'
        return (
          <div key={page.id || page.name || title} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50/80 transition-colors">
            <BookOpen className="w-8 h-8 text-sky-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{title}</div>
              <div className="text-xs text-gray-400">
                {formatDate(page.last_edited || page.modifiedTime || page.modified || page.created_time || page.created)}
              </div>
            </div>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded hover:bg-gray-100 transition-colors"
                title="Open in Notion"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-4 h-4 text-gray-400" />
              </a>
            )}
          </div>
        )
      })}
      <WidgetRefreshBar fetchedAt={fetchedAt} onRefresh={fetchData} />
    </div>
  )
}

export default NotionWidget