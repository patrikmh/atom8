import { useCallback } from 'react'
import { WidgetConfig } from '@/types'
import { FileText, File } from 'lucide-react'
import { apiClient } from '@/services/api'
import { useWidgetData } from '@/hooks/useWidgetData'
import { WidgetLoading, WidgetEmpty, WidgetError, WidgetRawText, WidgetRefreshBar } from './WidgetUI'

import type { ParsedData } from '@/types'

interface DocsData {
  type?: string
  text?: string
  data?: ParsedData
  docs?: any[]
  files?: any[]
  error?: string
  status?: string
  needs_auth?: boolean
}

const mimeTypeMap: Record<string, string> = {
  'application/vnd.google-apps.document': 'document',
  'application/vnd.google-apps.spreadsheet': 'spreadsheet',
  'application/vnd.google-apps.presentation': 'presentation',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
}

const DocsWidget = ({ widget }: { widget: WidgetConfig }) => {
  const fetcher = useCallback((prompt: string) => apiClient.getDocs(10, prompt), [])
  const { data, isLoading, error, fetchedAt, fetchData } = useWidgetData<DocsData>(
    widget,
    fetcher,
    'Failed to load documents',
  )

  // The backend may return docs or files
  const rawDocs = data?.docs || data?.files || data?.data?.docs || data?.data?.files || []
  const docs = error ? [] : rawDocs
  const text = data?.text
  const hasText = !error && text

  const getDocType = (doc: any) => {
    if (doc.mime_type) return mimeTypeMap[doc.mime_type] || 'document'
    if (doc.mimeType) return mimeTypeMap[doc.mimeType] || 'document'
    return 'document'
  }

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

  if (docs.length === 0) {
    return <WidgetEmpty message="No documents found" subtext="Try a different search or check your Google Docs." onRefresh={fetchData} />
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2 pb-1 border-b border-gray-100">
        <FileText className="w-4 h-4 text-indigo-500" />
        <span className="text-xs font-medium text-gray-500">
          {docs.length} document{docs.length !== 1 ? 's' : ''}
        </span>
      </div>
      {docs.slice(0, 10).map((doc: any) => {
        const type = getDocType(doc)
        return (
          <div key={doc.id || doc.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50/80 transition-colors">
            <File className="w-8 h-8 text-indigo-400" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{doc.name || doc.title || doc.filename}</div>
              <div className="text-xs text-gray-400">
                {type} · {formatDate(doc.modifiedTime || doc.modified || doc.last_edited)}
              </div>
            </div>
          </div>
        )
      })}
      <WidgetRefreshBar fetchedAt={fetchedAt} onRefresh={fetchData} />
    </div>
  )
}

export default DocsWidget