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
    console.log('[useWidgetData] fetchData starting for', widget.id)
    setIsLoading(true)
    setError(null)
    setWidgetLoading(widget.id, true)
    setWidgetError(widget.id, null)
    try {
      console.log('[useWidgetData] calling fetcher for', widget.id, 'prompt:', widget.prompt)
      const result = await fetcherRef.current(widget.prompt) as any
      console.log('[useWidgetData] fetcher result for', widget.id, ':', result)
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
      console.error('[useWidgetData] fetch error for', widget.id, ':', err)
      const msg = err?.message || errorMessage
      setError(msg)
      setWidgetError(widget.id, msg)
    } finally {
      console.log('[useWidgetData] fetchData finished for', widget.id)
      setIsLoading(false)
      setWidgetLoading(widget.id, false)
    }
  }, [widget.id, widget.prompt, errorMessage, setWidgetData, setWidgetLoading, setWidgetError])

  // Fetch on mount / refresh trigger (skip if data already provided)
  const hasInitialData = !!widget.data
  useEffect(() => {
    console.log('[useWidgetData] effect triggered', widget.id, 'hasInitialData:', hasInitialData, 'widget.data:', widget.data)
    if (hasInitialData) return
    console.log('[useWidgetData] calling fetchData for', widget.id)
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
