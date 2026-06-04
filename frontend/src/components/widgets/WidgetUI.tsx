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

/** Full-widget loading state with 5 skeleton rows and a message. */
export const WidgetLoading = () => (
  <div className="space-y-1 py-2">
    <div className="flex items-center gap-2 px-2 py-1 text-xs text-blue-500 animate-pulse">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
      Fetching data, please wait...
    </div>
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

/** Parse inline markdown (bold, italic, code, links, images). */
function parseInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  // Matches: **bold**, *italic*, `code`, [text](url), ![alt](url)
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|!\[([^\]]*)\]\(([^)]+)\))/g
  let lastIndex = 0
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-gray-900">{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(<em key={match.index} className="italic text-gray-600">{match[3]}</em>)
    } else if (match[4]) {
      parts.push(<code key={match.index} className="text-xs bg-gray-100 px-1 py-0.5 rounded font-mono">{match[4]}</code>)
    } else if (match[5] && match[6]) {
      // Link [text](url)
      const url = match[6]
      const displayText = match[5]
      parts.push(
        <a key={match.index} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
          {displayText}
        </a>
      )
    } else if (match[7] !== undefined && match[8]) {
      // Image ![alt](url)
      parts.push(
        <img key={match.index} src={match[8]} alt={match[7]} className="max-w-full h-auto rounded my-2" />
      )
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts.length === 1 ? parts[0] : parts
}

/** Parse simple markdown into React elements. */
export function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let inTable = false
  let tableRows: string[] = []
  let inCodeBlock = false
  let codeBlockLang = ''
  let codeBlockLines: string[] = []
  let inBlockquote = false
  let blockquoteLines: string[] = []

  const flushTable = () => {
    if (tableRows.length < 2) return
    const headerCells = tableRows[0].split('|').filter((c) => c.trim()).map((c) => c.trim())
    const bodyRows = tableRows.slice(2).filter((r) => r.trim() && !r.trim().startsWith('|---'))
    elements.push(
      <div key={`table-${elements.length}`} className="overflow-x-auto my-2">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-gray-300">
              {headerCells.map((h, i) => (
                <th key={i} className="text-left py-1 px-2 font-semibold text-gray-600">
                  {parseInline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, ri) => {
              const cells = row.split('|').filter((c) => c.trim()).map((c) => c.trim())
              return (
                <tr key={ri} className="border-b border-gray-100 last:border-0">
                  {cells.map((c, ci) => (
                    <td key={ci} className="py-1 px-2 text-gray-700">
                      {parseInline(c)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  const flushCodeBlock = () => {
    const code = codeBlockLines.join('\n')
    elements.push(
      <div key={`code-${elements.length}`} className="my-2">
        {codeBlockLang && (
          <div className="bg-gray-800 text-gray-400 text-[10px] px-3 py-1 rounded-t-lg font-mono uppercase">
            {codeBlockLang}
          </div>
        )}
        <pre className={`bg-gray-900 text-gray-100 p-3 overflow-x-auto text-xs font-mono ${codeBlockLang ? 'rounded-b-lg' : 'rounded-lg'}`}>
          <code>{code}</code>
        </pre>
      </div>
    )
    inCodeBlock = false
    codeBlockLang = ''
    codeBlockLines = []
  }

  const flushBlockquote = () => {
    const text = blockquoteLines.join('\n')
    elements.push(
      <blockquote key={`bq-${elements.length}`} className="border-l-4 border-gray-300 pl-3 py-1 my-2 text-sm text-gray-600 italic">
        {parseInline(text)}
      </blockquote>
    )
    inBlockquote = false
    blockquoteLines = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Code blocks
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true
        codeBlockLang = trimmed.slice(3).trim()
        continue
      } else {
        flushCodeBlock()
        continue
      }
    }
    if (inCodeBlock) {
      codeBlockLines.push(line)
      continue
    }

    // Tables
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (inBlockquote) flushBlockquote()
      tableRows.push(line)
      inTable = true
      continue
    }
    if (inTable && !trimmed.startsWith('|')) {
      flushTable()
      tableRows = []
      inTable = false
    }

    // Horizontal rules
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      if (inBlockquote) flushBlockquote()
      elements.push(<hr key={`hr-${elements.length}`} className="border-gray-200 my-3" />)
      continue
    }

    // Blockquotes
    if (trimmed.startsWith('> ')) {
      if (inTable) { flushTable(); tableRows = []; inTable = false }
      blockquoteLines.push(trimmed.slice(2))
      inBlockquote = true
      continue
    }
    if (inBlockquote && trimmed !== '') {
      blockquoteLines.push(trimmed)
      continue
    }
    if (inBlockquote && trimmed === '') {
      flushBlockquote()
      continue
    }

    // Empty lines
    if (trimmed === '') {
      elements.push(<div key={`sp-${elements.length}`} className="h-2" />)
      continue
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={elements.length} className="text-sm font-semibold text-gray-800 mt-3 mb-1">
          {parseInline(trimmed.slice(4))}
        </h4>
      )
      continue
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={elements.length} className="text-sm font-semibold text-gray-800 mt-3 mb-1">
          {parseInline(trimmed.slice(3))}
        </h3>
      )
      continue
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={elements.length} className="text-base font-semibold text-gray-800 mt-3 mb-1">
          {parseInline(trimmed.slice(2))}
        </h2>
      )
      continue
    }

    // Ordered lists
    const orderedMatch = trimmed.match(/^(\d+)\.\s(.+)$/)
    if (orderedMatch) {
      elements.push(
        <li key={elements.length} className="text-sm text-gray-700 ml-4 list-decimal">
          {parseInline(orderedMatch[2])}
        </li>
      )
      continue
    }

    // Unordered lists
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <li key={elements.length} className="text-sm text-gray-700 ml-4 list-disc">
          {parseInline(trimmed.slice(2))}
        </li>
      )
      continue
    }

    // Default paragraph
    elements.push(
      <p key={elements.length} className="text-sm text-gray-700 leading-relaxed">
        {parseInline(trimmed)}
      </p>
    )
  }

  // Flush any remaining blocks
  if (inTable) flushTable()
  if (inCodeBlock) flushCodeBlock()
  if (inBlockquote) flushBlockquote()

  return elements
}

/** Styled raw text response — shown when backend returns text instead of structured data. */
export const WidgetRawText = ({
  text,
  onRefresh,
  fetchedAt,
}: {
  text: string
  onRefresh: () => void
  fetchedAt: number | null
}) => (
  <div className="flex flex-col h-full">
    <div className="flex-1 overflow-y-auto py-2 px-2">
      <div className="space-y-1">
        {parseMarkdown(text)}
      </div>
    </div>
    <WidgetRefreshBar fetchedAt={fetchedAt} onRefresh={onRefresh} />
  </div>
)
