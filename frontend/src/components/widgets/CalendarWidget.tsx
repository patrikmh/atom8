import { useEffect, useState } from 'react'
import { CalendarDays, CalendarOff, RefreshCw } from 'lucide-react'
import { WidgetConfig } from '@/types'
import { apiClient } from '@/services/api'
import { useLayoutStore } from '@/stores/layoutStore'

interface CalendarData {
  events?: any[]
  error?: string
  status?: string
  needs_auth?: boolean
  date?: string
}

const SkeletonRow = () => (
  <div className="flex items-center gap-3 p-2 animate-pulse">
    <div className="w-1.5 h-10 rounded-full bg-gray-200 shrink-0" />
    <div className="flex-1 space-y-1.5">
      <div className="h-3 bg-gray-200 rounded w-3/5" />
      <div className="h-2.5 bg-gray-200 rounded w-1/3" />
    </div>
  </div>
)

const EmptyState = ({ onRefresh, today }: { onRefresh: () => void; today: string }) => (
  <div className="flex flex-col items-center justify-center h-full text-center p-4 gap-3">
    <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center">
      <CalendarOff className="w-6 h-6 text-green-300" />
    </div>
    <div className="space-y-1">
      <p className="text-sm font-medium text-gray-600">No events for {today}</p>
      <p className="text-xs text-gray-400 max-w-[180px]">Your calendar is clear. Enjoy the free time!</p>
    </div>
    <button
      onClick={onRefresh}
      className="flex items-center gap-1.5 text-xs text-green-600 hover:text-green-700 font-medium px-3 py-1.5 rounded-lg hover:bg-green-50 transition-colors"
    >
      <RefreshCw className="w-3 h-3" />
      Refresh
    </button>
  </div>
)

const CalendarWidget = ({ widget }: { widget: WidgetConfig }) => {
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
      const data = await apiClient.getCalendar(undefined, widget.prompt) as CalendarData
      if (data.error || data.status === 'error') {
        const msg = data.error || 'Failed to load calendar'
        console.error(`[CalendarWidget] API error:`, msg)
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
      const msg = err.message || 'Failed to load calendar'
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

  const rawEvents = (widget.data as any)?.events || localData?.events || []
  const hasError = !!(widget.error || error || (localData as CalendarData)?.error || (widget.data as CalendarData)?.error)
  // Normalize API field names (Google returns 'summary' but we render 'title',
  // and ISO timestamps need formatting while mock data has pre-formatted times)
  const events = rawEvents.length > 0 && !hasError
    ? rawEvents.map((e: any) => ({
        ...e,
        title: e.title || e.summary || 'Untitled',
        start: e.start?.includes('T') ? new Date(e.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : e.start,
        end: e.end?.includes('T') ? new Date(e.end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : e.end,
      }))
    : []
  const displayError = widget.error || error || (localData as CalendarData)?.error || (widget.data as CalendarData)?.error
  const displayLoading = widget.isLoading || isLoading
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  if (displayLoading) {
    return (
      <div className="space-y-1 py-2">
        <div className="text-center mb-3">
          <div className="h-5 bg-gray-200 rounded w-1/3 mx-auto animate-pulse" />
        </div>
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
          <CalendarDays className="w-6 h-6 text-red-300" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-red-500">{displayError}</p>
          <p className="text-xs text-gray-400">Check your connection or try again.</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-xs text-green-600 hover:text-green-700 font-medium px-3 py-1.5 rounded-lg hover:bg-green-50 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    )
  }

  if (events.length === 0) {
    return <EmptyState onRefresh={fetchData} today={today} />
  }

  return (
    <div className="space-y-3">
      <div className="text-center">
        <h3 className="text-lg font-semibold">{today}</h3>
      </div>
      <div className="space-y-2">
        {events.map((event: any) => (
          <div
            key={event.id}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50/80 cursor-pointer transition-all hover:shadow-sm hover:translate-x-0.5"
          >
            <div
              className="w-1.5 h-10 rounded-full shrink-0"
              style={{ backgroundColor: event.color || '#3b82f6' }}
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{event.title}</div>
              <div className="text-xs text-gray-500">
                {event.start} - {event.end}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2 px-1">
        <span className="text-[10px] text-gray-400">
          {fetchedAt ? `Updated ${formatTimeAgo(fetchedAt)}` : ''}
        </span>
        <button onClick={fetchData} className="text-xs text-green-600 cursor-pointer hover:underline flex items-center gap-1">
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

export default CalendarWidget
