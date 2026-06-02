import { useState, useEffect, useCallback, useRef } from 'react'
import { useLayoutStore } from '@/stores/layoutStore'
import { WidgetConfig } from '@/types'

/**
 * Generic data-fetching hook for dashboard widgets.
 *
 * Encapsulates the common pattern: loading state, error handling,
 * data storage, refresh trigger, and interval polling.
 */
export function useWidgetData<T>(
  widget: WidgetConfig,
  fetcher: (prompt: string) => Promise<T>,
  errorMessage: string = 'Failed to load data',
) {
  const setWidgetData = useLayoutStore((s) => s.setWidgetData)
  const setWidgetLoading = useLayoutStore((s) => s.setWidgetLoading)
  const setWidgetError = useLayoutStore((s) => s.setWidgetError)
  const refreshTrigger = useLayoutStore((s) => s.refreshTriggers[widget.id])

  const [data, setData] = useState<T | null>((widget.data as T) || null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)

  // Use a ref for the fetcher so it doesn't trigger re-creation of fetchData
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setWidgetLoading(widget.id, true)
    setWidgetError(widget.id, null)
    try {
      const result = await fetcherRef.current(widget.prompt) as any
      if (result?.error || result?.status === 'error') {
        const msg = result?.error || errorMessage
        setError(msg)
        setWidgetError(widget.id, msg)
        setData(result)
        setWidgetData(widget.id, result)
      } else {
        setData(result)
        setWidgetData(widget.id, result)
        setFetchedAt(Date.now())
      }
    } catch (err: any) {
      const msg = err?.message || errorMessage
      setError(msg)
      setWidgetError(widget.id, msg)
    } finally {
      setIsLoading(false)
      setWidgetLoading(widget.id, false)
    }
  }, [widget.id, widget.prompt, errorMessage, setWidgetData, setWidgetLoading, setWidgetError])

  // Fetch on mount / refresh trigger (skip if data already provided)
  const hasInitialData = !!widget.data
  useEffect(() => {
    if (hasInitialData) return
    fetchData()
  }, [widget.id, refreshTrigger, fetchData, hasInitialData])

  // Interval polling
  useEffect(() => {
    if (!widget.refreshInterval || widget.refreshInterval <= 0) return
    const interval = setInterval(() => {
      fetchData()
    }, widget.refreshInterval * 1000)
    return () => clearInterval(interval)
  }, [widget.id, widget.refreshInterval, fetchData])

  return { data, isLoading, error, fetchedAt, fetchData }
}
