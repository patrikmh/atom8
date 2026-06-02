import { useEffect, useState } from 'react'
import { Loader2, CalendarDays } from 'lucide-react'
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

const CalendarWidget = ({ widget }: { widget: WidgetConfig }) => {
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
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to load calendar'
      console.error(`[CalendarWidget] fetch failed:`, msg)
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
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
        <span className="ml-2 text-sm text-gray-500">Loading calendar...</span>
      </div>
    )
  }

  if (displayError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <CalendarDays className="w-8 h-8 text-red-300 mb-2" />
        <p className="text-sm text-red-500">{displayError}</p>
        <button
          onClick={fetchData}
          className="mt-2 text-xs text-green-500 hover:text-green-600 font-medium"
        >
          Retry
        </button>
      </div>
    )
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
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50/80 cursor-pointer transition-colors"
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
      {events.length === 0 && (
        <div className="text-center py-4 text-gray-400 text-sm">
          No events today
        </div>
      )}
      <div className="text-center pt-2">
        <button onClick={fetchData} className="text-xs text-green-500 cursor-pointer hover:underline">
          Refresh
        </button>
      </div>
    </div>
  )
}

export default CalendarWidget
