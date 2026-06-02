import { useEffect, useState } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { WidgetConfig } from '@/types'
import { apiClient } from '@/services/api'
import { useLayoutStore } from '@/stores/layoutStore'

interface GmailData {
  emails?: any[]
  error?: string
  status?: string
  needs_auth?: boolean
}

const GmailWidget = ({ widget }: { widget: WidgetConfig }) => {
  const setWidgetData = useLayoutStore((s) => s.setWidgetData)
  const setWidgetLoading = useLayoutStore((s) => s.setWidgetLoading)
  const setWidgetError = useLayoutStore((s) => s.setWidgetError)
  const [localData, setLocalData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
        console.error(`[GmailWidget] API error:`, msg)
        setError(msg)
        setWidgetError(widget.id, msg)
        setLocalData(data)
        setWidgetData(widget.id, data)
      } else {
        setLocalData(data)
        setWidgetData(widget.id, data)
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to load emails'
      console.error(`[GmailWidget] fetch failed:`, msg)
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
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        <span className="ml-2 text-sm text-gray-500">Loading emails...</span>
      </div>
    )
  }

  if (displayError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <Mail className="w-8 h-8 text-red-300 mb-2" />
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
    <div className="space-y-2">
      {emails.slice(0, 10).map((email: any) => (
        <div
          key={email.id}
          className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50/80 cursor-pointer transition-colors"
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
      <div className="text-center pt-2">
        <button onClick={fetchData} className="text-xs text-blue-500 cursor-pointer hover:underline">
          Refresh
        </button>
      </div>
    </div>
  )
}

export default GmailWidget
