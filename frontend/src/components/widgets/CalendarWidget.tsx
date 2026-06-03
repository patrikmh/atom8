import { useCallback } from 'react'
// No lucide-react imports needed for this widget
import { WidgetConfig } from '@/types'
import { apiClient } from '@/services/api'
import { useWidgetData } from '@/hooks/useWidgetData'
import { WidgetLoading, WidgetEmpty, WidgetError, WidgetRawText, WidgetRefreshBar } from './WidgetUI'

import type { ParsedData } from '@/types'

interface CalendarData {
  type?: string
  text?: string
  data?: ParsedData
  events?: any[]
  error?: string
  status?: string
  needs_auth?: boolean
  date?: string
}

const CalendarWidget = ({ widget }: { widget: WidgetConfig }) => {
  const fetcher = useCallback((prompt: string) => apiClient.getCalendar(undefined, prompt), [])
  const { data, isLoading, error, fetchedAt, fetchData } = useWidgetData<CalendarData>(
    widget,
    fetcher,
    'Failed to load calendar',
  )

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  const rawEvents = data?.events || []
  const events = error
    ? []
    : rawEvents.map((e: any) => ({
        ...e,
        title: e.title || e.summary || 'Untitled',
        start: e.start?.includes('T')
          ? new Date(e.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
          : e.start,
        end: e.end?.includes('T')
          ? new Date(e.end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
          : e.end,
      }))
  const text = data?.text
  const hasText = !error && text

  if (isLoading) return <WidgetLoading />

  if (error) {
    return <WidgetError message={error} onRetry={fetchData} />
  }

  if (hasText) {
    return <WidgetRawText text={text} onRefresh={fetchData} fetchedAt={fetchedAt} />
  }

  if (events.length === 0) {
    return <WidgetEmpty message={`No events for ${today}`} subtext="Your calendar is clear. Enjoy the free time!" onRefresh={fetchData} />
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
            <div className="w-1.5 h-12 rounded-full bg-green-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{event.title}</div>
              <div className="text-xs text-gray-500">
                {event.start} – {event.end}
                {event.location && ` · ${event.location}`}
              </div>
            </div>
          </div>
        ))}
      </div>
      <WidgetRefreshBar fetchedAt={fetchedAt} onRefresh={fetchData} />
    </div>
  )
}

export default CalendarWidget
