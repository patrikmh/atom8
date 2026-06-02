import { useEffect, useState } from 'react'
import { WidgetConfig } from '@/types'
import { FileText, FileSpreadsheet, Image, File, Folder, Loader2, HardDrive } from 'lucide-react'
import { apiClient } from '@/services/api'
import { useLayoutStore } from '@/stores/layoutStore'

const MOCK_FILES = [
  { id: '1', name: 'Q2 Report.pdf', type: 'pdf', size: '2.4 MB', date: '2 hours ago' },
  { id: '2', name: 'Budget 2026.xlsx', type: 'spreadsheet', size: '156 KB', date: '5 hours ago' },
  { id: '3', name: 'Design Mockup.png', type: 'image', size: '4.1 MB', date: 'Yesterday' },
  { id: '4', name: 'Meeting Notes.docx', type: 'document', size: '24 KB', date: 'Yesterday' },
  { id: '5', name: 'Project Alpha', type: 'folder', size: '—', date: '2 days ago' },
  { id: '6', name: 'Presentation.pptx', type: 'document', size: '8.2 MB', date: '3 days ago' },
]

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
      const data = await apiClient.getDrive(10, widget.prompt)
      setLocalData(data)
      setWidgetData(widget.id, data)
    } catch (err: any) {
      const msg = err.message || 'Failed to load files'
      console.error(`[DriveWidget] fetch failed:`, msg)
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
  const files = rawFiles.length > 0 ? rawFiles : MOCK_FILES
  const displayError = widget.error || error
  const displayLoading = widget.isLoading || isLoading

  const getFileType = (file: any) => {
    if (file.type) return file.type
    if (file.mime_type) return mimeTypeMap[file.mime_type] || 'document'
    return 'document'
  }

  if (displayLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-yellow-500 animate-spin" />
        <span className="ml-2 text-sm text-gray-500">Loading files...</span>
      </div>
    )
  }

  if (displayError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <HardDrive className="w-8 h-8 text-red-300 mb-2" />
        <p className="text-sm text-red-500">{displayError}</p>
        <button
          onClick={fetchData}
          className="mt-2 text-xs text-yellow-500 hover:text-yellow-600 font-medium"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {files.map((file: any) => (
        <div
          key={file.id}
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50/80 cursor-pointer transition-colors"
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
      <div className="text-center pt-2">
        <button onClick={fetchData} className="text-xs text-yellow-500 cursor-pointer hover:underline">
          Refresh
        </button>
      </div>
    </div>
  )
}

export default DriveWidget
