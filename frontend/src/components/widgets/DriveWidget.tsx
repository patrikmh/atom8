import { useEffect, useState } from 'react'
import { WidgetConfig } from '@/types'
import { FileText, FileSpreadsheet, Image, File, Folder, HardDrive, FolderOpen, RefreshCw } from 'lucide-react'
import { apiClient } from '@/services/api'
import { useLayoutStore } from '@/stores/layoutStore'

interface DriveData {
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

const SkeletonRow = () => (
  <div className="flex items-center gap-3 p-2 animate-pulse">
    <div className="w-8 h-8 rounded-lg bg-gray-200 shrink-0" />
    <div className="flex-1 space-y-1.5">
      <div className="h-3 bg-gray-200 rounded w-3/5" />
      <div className="h-2.5 bg-gray-200 rounded w-1/4" />
    </div>
  </div>
)

const EmptyState = ({ onRefresh }: { onRefresh: () => void }) => (
  <div className="flex flex-col items-center justify-center h-full text-center p-4 gap-3">
    <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center">
      <FolderOpen className="w-6 h-6 text-orange-300" />
    </div>
    <div className="space-y-1">
      <p className="text-sm font-medium text-gray-600">No files found</p>
      <p className="text-xs text-gray-400 max-w-[180px]">Try a different search or check your Drive.</p>
    </div>
    <button
      onClick={onRefresh}
      className="flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-600 font-medium px-3 py-1.5 rounded-lg hover:bg-orange-50 transition-colors"
    >
      <RefreshCw className="w-3 h-3" />
      Refresh
    </button>
  </div>
)

const DriveWidget = ({ widget }: { widget: WidgetConfig }) => {
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
      const data = await apiClient.getDrive(10, widget.prompt) as DriveData
      if (data.error || data.status === 'error') {
        const msg = data.error || 'Failed to load files'
        console.error(`[DriveWidget] API error:`, msg)
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
      const msg = err.message || 'Failed to load files'
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

  const rawFiles = (widget.data as any)?.files || localData?.files || []
  const hasError = !!(widget.error || error || (localData as DriveData)?.error || (widget.data as DriveData)?.error)
  const files = hasError ? [] : rawFiles
  const displayError = widget.error || error || (localData as DriveData)?.error || (widget.data as DriveData)?.error
  const displayLoading = widget.isLoading || isLoading

  const getFileType = (file: any) => {
    if (file.type) return file.type
    if (file.mime_type) return mimeTypeMap[file.mime_type] || 'document'
    return 'document'
  }

  if (displayLoading) {
    return (
      <div className="space-y-1 py-2">
        <SkeletonRow />
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
          <HardDrive className="w-6 h-6 text-red-300" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-red-500">{displayError}</p>
          <p className="text-xs text-gray-400">Check your connection or try again.</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-600 font-medium px-3 py-1.5 rounded-lg hover:bg-orange-50 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    )
  }

  if (files.length === 0) {
    return <EmptyState onRefresh={fetchData} />
  }

  return (
    <div className="space-y-2">
      {files.map((file: any) => (
        <div
          key={file.id}
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50/80 cursor-pointer transition-all hover:shadow-sm hover:translate-x-0.5"
        >
          {fileIcons[getFileType(file)] || <File className="w-8 h-8 text-gray-500" />}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{file.name}</div>
            <div className="text-xs text-gray-500">
              {file.size || '—'} · {file.date || file.modified || '—'}
            </div>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between pt-2 px-1">
        <span className="text-[10px] text-gray-400">
          {fetchedAt ? `Updated ${formatTimeAgo(fetchedAt)}` : ''}
        </span>
        <button onClick={fetchData} className="text-xs text-orange-500 cursor-pointer hover:underline flex items-center gap-1">
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

export default DriveWidget
