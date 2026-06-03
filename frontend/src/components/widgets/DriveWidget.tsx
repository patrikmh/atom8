import { useCallback } from 'react'
import { WidgetConfig } from '@/types'
import { FileText, FileSpreadsheet, Image, File, Folder, HardDrive } from 'lucide-react'
import { apiClient } from '@/services/api'
import { useWidgetData } from '@/hooks/useWidgetData'
import { WidgetLoading, WidgetEmpty, WidgetError, WidgetRawText, WidgetRefreshBar } from './WidgetUI'

import type { ParsedData } from '@/types'

interface DriveData {
  type?: string
  text?: string
  data?: ParsedData
  files?: any[]
  error?: string
  status?: string
  needs_auth?: boolean
}

const fileIcons: Record<string, React.ReactNode> = {
  pdf: <FileText className="w-8 h-8 text-red-500" />,
  spreadsheet: <FileSpreadsheet className="w-8 h-8 text-green-500" />,
  image: <Image className="w-8 h-8 text-blue-500" />,
  document: <File className="w-8 h-8 text-gray-500" />,
  folder: <Folder className="w-8 h-8 text-yellow-500" />,
}

const mimeTypeMap: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.google-apps.spreadsheet': 'spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
  'image/png': 'image',
  'image/jpeg': 'image',
  'application/vnd.google-apps.document': 'document',
  'application/vnd.google-apps.folder': 'folder',
  'application/vnd.google-apps.presentation': 'document',
}

const DriveWidget = ({ widget }: { widget: WidgetConfig }) => {
  const fetcher = useCallback((prompt: string) => apiClient.getDrive(10, prompt), [])
  const { data, isLoading, error, fetchedAt, fetchData } = useWidgetData<DriveData>(
    widget,
    fetcher,
    'Failed to load files',
  )

  const rawFiles = data?.files || []
  const files = error ? [] : rawFiles
  const text = data?.text
  const hasText = !error && text

  const getFileType = (file: any) => {
    if (file.icon) return file.icon
    if (file.type) return file.type
    if (file.mime_type) return mimeTypeMap[file.mime_type] || 'document'
    return 'document'
  }

  const formatBytes = (bytes: number | null | undefined): string => {
    if (!bytes || bytes === 0) return '—'
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    if (i === 0) return `${bytes} B`
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
  }

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '—'
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)
    if (diffSec < 60) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHour < 24) return `${diffHour}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (isLoading) return <WidgetLoading />

  if (error) {
    return <WidgetError message={error} onRetry={fetchData} />
  }

  if (hasText) {
    return <WidgetRawText text={text} onRefresh={fetchData} fetchedAt={fetchedAt} />
  }

  if (files.length === 0) {
    return <WidgetEmpty message="No files found" subtext="Try a different search or check your Drive." onRefresh={fetchData} />
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2 pb-1 border-b border-gray-100">
        <HardDrive className="w-4 h-4 text-orange-500" />
        <span className="text-xs font-medium text-gray-500">
          {files.length} file{files.length !== 1 ? 's' : ''}
        </span>
      </div>
      {files.slice(0, 10).map((file: any) => {
        const type = getFileType(file)
        const icon = fileIcons[type] || fileIcons.document
        return (
          <div key={file.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50/80 transition-colors">
            {icon}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{file.name}</div>
              <div className="text-xs text-gray-400">
                {formatBytes(file.size)} · {formatDate(file.modifiedTime || file.modified)}
              </div>
            </div>
          </div>
        )
      })}
      <WidgetRefreshBar fetchedAt={fetchedAt} onRefresh={fetchData} />
    </div>
  )
}

export default DriveWidget
