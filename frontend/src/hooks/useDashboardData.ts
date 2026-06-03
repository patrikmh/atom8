import { useEffect, useRef } from 'react'
import { useLayoutStore } from '@/stores/layoutStore'
import { apiClient } from '@/services/api'
import { WidgetConfig } from '@/types'

/**
 * Batch-load all data widget data on dashboard mount using a single
 * /api/data/all call. This reduces 4 separate HTTP round-trips to 1,
 * cutting total load time by ~3× (network + backend serialisation overhead).
 *
 * Individual widgets still use their own useWidgetData hook for:
 *   - Refresh intervals (polling)
 *   - Manual refresh button clicks
 *   - Per-widget error handling
 */
export function useDashboardData(widgets: WidgetConfig[]) {
  const setWidgetData = useLayoutStore((s) => s.setWidgetData)
  const setWidgetLoading = useLayoutStore((s) => s.setWidgetLoading)
  const setWidgetError = useLayoutStore((s) => s.setWidgetError)

  const hasLoaded = useRef(false)

  useEffect(() => {
    if (hasLoaded.current) return
    const dataWidgets = widgets.filter(
      (w) => w.type === 'gmail' || w.type === 'calendar' || w.type === 'tasks' || w.type === 'drive'
    )
    if (dataWidgets.length === 0) return

    hasLoaded.current = true

    // Mark all data widgets as loading
    dataWidgets.forEach((w) => setWidgetLoading(w.id, true))

    apiClient
      .getAllData({
        gmailCount: 10,
        gmailPrompt: dataWidgets.find((w) => w.type === 'gmail')?.prompt || 'Show my latest emails',
        calendarPrompt: dataWidgets.find((w) => w.type === 'calendar')?.prompt || "Show today's events",
        tasksPrompt: dataWidgets.find((w) => w.type === 'tasks')?.prompt || 'Show my tasks',
        drivePrompt: dataWidgets.find((w) => w.type === 'drive')?.prompt || 'Show my files',
      })
      .then((response) => {
        if (response.status !== 'ok') {
          throw new Error('Batch data fetch failed')
        }
        // Distribute data to each widget
        dataWidgets.forEach((w) => {
          const data = response[w.type as keyof typeof response]
          if (data && typeof data === 'object') {
            setWidgetData(w.id, data)
            setWidgetError(w.id, null)
          }
        })
      })
      .catch((err) => {
        console.error('[useDashboardData] batch fetch failed:', err)
        dataWidgets.forEach((w) => {
          setWidgetError(w.id, err.message || 'Failed to load data')
        })
      })
      .finally(() => {
        dataWidgets.forEach((w) => setWidgetLoading(w.id, false))
      })
  }, [widgets, setWidgetData, setWidgetLoading, setWidgetError])
}
