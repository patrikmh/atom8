import { useCallback } from 'react'
import { WidgetConfig } from '@/types'
import { apiClient } from '@/services/api'
import { useWidgetData } from '@/hooks/useWidgetData'
import { WidgetLoading, WidgetEmpty, WidgetError, WidgetRefreshBar } from './WidgetUI'

interface GmailData {
  emails?: any[]
  error?: string
  status?: string
  needs_auth?: boolean
}

const formatEmailDate = (dateStr: string | undefined): string => {
  if (!dateStr) return ''
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

const stripInvisibleChars = (text: string | undefined): string => {
  if (!text) return ''
  return text.replace(/[\u200B\u200C\u200D\u2060\uFEFF\u00AD\u034f\u180b-\u180d\u180e]/g, '').trim()
}

const GmailWidget = ({ widget }: { widget: WidgetConfig }) => {
  const fetcher = useCallback((prompt: string) => apiClient.getGmail(10, prompt), [])
  const { data, isLoading, error, fetchedAt, fetchData } = useWidgetData<GmailData>(
    widget,
    fetcher,
    'Failed to load emails',
  )

  const rawEmails = data?.emails || []
  const emails = error ? [] : rawEmails

  if (isLoading) return <WidgetLoading />

  if (error) {
    return <WidgetError message={error} onRetry={fetchData} />
  }

  if (emails.length === 0) {
    return <WidgetEmpty message="No emails found" onRefresh={fetchData} />
  }

  return (
    <div className="space-y-2">
      {emails.slice(0, 10).map((email: any) => (
        <div
          key={email.id}
          className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50/80 cursor-pointer transition-all hover:shadow-sm hover:translate-x-0.5"
        >
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xs shrink-0">
            {(email.from_name || email.from || '?').charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm truncate">{email.from_name || email.from}</span>
              <span className="text-xs text-gray-400 shrink-0 ml-2">{formatEmailDate(email.date)}</span>
            </div>
            <div className="text-sm font-semibold truncate">{email.subject}</div>
            <div className="text-xs text-gray-500 truncate">{stripInvisibleChars(email.preview)}</div>
          </div>
        </div>
      ))}
      <WidgetRefreshBar fetchedAt={fetchedAt} onRefresh={fetchData} />
    </div>
  )
}

export default GmailWidget
