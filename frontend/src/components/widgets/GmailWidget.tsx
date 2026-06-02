import { useEffect, useState } from 'react'
import { Mail, Inbox, RefreshCw } from 'lucide-react'
import { WidgetConfig } from '@/types'
import { apiClient } from '@/services/api'
import { useLayoutStore } from '@/stores/layoutStore'

interface GmailData {
  emails?: any[]
  error?: string
  status?: string
  needs_auth?: boolean
}

const SkeletonRow = () => (
  <div className="flex items-start gap-3 p-2 animate-pulse">
    <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
    <div className="flex-1 space-y-1.5 pt-1">
      <div className="h-3 bg-gray-200 rounded w-3/5" />
      <div className="h-2.5 bg-gray-200 rounded w-4/5" />
      <div className="h-2 bg-gray-200 rounded w-1/2" />
    </div>
  </div>
)

const EmptyState = ({ onRefresh }: { onRefresh: () => void }) => (
  <div className="flex flex-col items-center justify-center h-full text-center p-4 gap-3">
    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
      <Inbox className="w-6 h-6 text-blue-300" />
    </div>
    <div className="space-y-1">
      <p className="text-sm font-medium text-gray-600">No emails found</p>
      <p className="text-xs text-gray-400 max-w-[180px]">Try adjusting your search or wait for the inbox to load.</p>
    </div>
    <button
      onClick={onRefresh}
      className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
    >
      <RefreshCw className="w-3 h-3" />
      Refresh
    </button>
  </div>
)

const GmailWidget = ({ widget }: { widget: WidgetConfig }) => {
  const setWidgetData = useLayoutStore((s) => s.setWidgetData)
  const setWidgetLoading = useLayoutStore((s) => s.setWidgetLoading)
  const setWidgetError = useLayoutStore((s) => s.setWidgetError)
  const [localData, setLocalData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const refreshTrigger = useLayoutStore((s) => s.refreshTriggers[widget.id])

  const fetchData = async () => {
    setIsLoading(true)
    setError(null)
    setWidgetLoading(widget.id, true)
    setWidgetError(widget.id, null)
    try {
      const data = await apiClient.getGmail(10, widget.prompt) as GmailData
      if (data.error || data.status === 'error') {
        const msg = data.error || 'Failed to load emails'
        setError(msg)
        setWidgetError(widget.id, msg)
        setLocalData(data)
        setWidgetData(widget.id, data)
      } else {
        setLocalData(data)
        setWidgetData(widget.id, data)
        setFetchedAt(Date.now())
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to load emails'
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

  useEffect(() => {
    if (!widget.refreshInterval || widget.refreshInterval <= 0) return
    const interval = setInterval(() => {
      fetchData()
    }, widget.refreshInterval * 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id, widget.refreshInterval])

  const rawEmails = (widget.data as any)?.emails || localData?.emails || []
  const hasError = !!(widget.error || error || (localData as GmailData)?.error || (widget.data as GmailData)?.error)
  const emails = hasError ? [] : rawEmails
  const displayError = widget.error || error || (localData as GmailData)?.error || (widget.data as GmailData)?.error
  const displayLoading = widget.isLoading || isLoading

  if (displayLoading) {
    return (
      <div className="space-y-1 py-2">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    )
  }

  if (displayError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
          <Mail className="w-6 h-6 text-red-300" />
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

  if (emails.length === 0) {
    return <EmptyState onRefresh={fetchData} />
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
              <span className="text-xs text-gray-400 shrink-0 ml-2">{email.date}</span>
            </div>
            <div className="text-sm font-semibold truncate">{email.subject}</div>
            <div className="text-xs text-gray-500 truncate">{email.preview}</div>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between pt-2 px-1">
        <span className="text-[10px] text-gray-400">
          {fetchedAt ? `Updated ${formatTimeAgo(fetchedAt)}` : ''}
        </span>
        <button onClick={fetchData} className="text-xs text-blue-500 cursor-pointer hover:underline flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>
    </div>
  )
}

const formatTimeAgo = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default GmailWidget
