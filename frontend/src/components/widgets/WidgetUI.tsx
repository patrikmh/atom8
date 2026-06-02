import { RefreshCw, Inbox } from 'lucide-react'

/**
 * Shared UI primitives for all data widgets.
 *
 * These components replace the duplicated SkeletonRow, EmptyState,
 * error state, and refresh button found in every widget.
 */

/** Skeleton loading row — reused in every widget loading state. */
export const SkeletonRow = () => (
  <div className="flex items-start gap-3 p-2 animate-pulse">
    <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
    <div className="flex-1 space-y-1.5 pt-1">
      <div className="h-3 bg-gray-200 rounded w-3/5" />
      <div className="h-2.5 bg-gray-200 rounded w-4/5" />
      <div className="h-2 bg-gray-200 rounded w-1/2" />
    </div>
  </div>
)

/** Full-widget loading state with 5 skeleton rows. */
export const WidgetLoading = () => (
  <div className="space-y-1 py-2">
    <SkeletonRow />
    <SkeletonRow />
    <SkeletonRow />
    <SkeletonRow />
    <SkeletonRow />
  </div>
)

/** Empty state with a refresh button. */
export const WidgetEmpty = ({
  message = 'No data found',
  subtext = 'Try adjusting your search or wait for the data to load.',
  onRefresh,
}: {
  message?: string
  subtext?: string
  onRefresh: () => void
}) => (
  <div className="flex flex-col items-center justify-center h-full text-center p-4 gap-3">
    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
      <Inbox className="w-6 h-6 text-blue-300" />
    </div>
    <div className="space-y-1">
      <p className="text-sm font-medium text-gray-600">{message}</p>
      <p className="text-xs text-gray-400 max-w-[180px]">{subtext}</p>
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

/** Error state with a retry button. */
export const WidgetError = ({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) => (
  <div className="flex flex-col items-center justify-center h-full text-center p-4 gap-3">
    <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
      <RefreshCw className="w-6 h-6 text-red-300" />
    </div>
    <div className="space-y-1">
      <p className="text-sm font-medium text-red-500">{message}</p>
      <p className="text-xs text-gray-400">Check your connection or try again.</p>
    </div>
    <button
      onClick={onRetry}
      className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
    >
      <RefreshCw className="w-3 h-3" />
      Retry
    </button>
  </div>
)

/** Refresh button with timestamp — shown at the bottom of widgets. */
export const WidgetRefreshBar = ({
  fetchedAt,
  onRefresh,
}: {
  fetchedAt: number | null
  onRefresh: () => void
}) => (
  <div className="flex items-center justify-between pt-2 px-1">
    <span className="text-[10px] text-gray-400">
      {fetchedAt ? `Updated ${formatTimeAgo(fetchedAt)}` : ''}
    </span>
    <button
      onClick={onRefresh}
      className="text-xs text-blue-500 cursor-pointer hover:underline flex items-center gap-1"
    >
      <RefreshCw className="w-3 h-3" />
      Refresh
    </button>
  </div>
)

/** Format a timestamp into a human-readable "ago" string. */
export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
