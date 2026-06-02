import { useEffect, useState } from 'react'
import { WidgetConfig } from '@/types'
import { CheckCircle2, Circle, ListTodo, ClipboardList, RefreshCw } from 'lucide-react'
import { apiClient } from '@/services/api'
import { useLayoutStore } from '@/stores/layoutStore'

interface TasksData {
  tasks?: any[]
  error?: string
  status?: string
  needs_auth?: boolean
}

const priorityColors: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
}

const SkeletonRow = () => (
  <div className="flex items-center gap-2 p-2 animate-pulse">
    <div className="w-5 h-5 rounded-full bg-gray-200 shrink-0" />
    <div className="flex-1 space-y-1.5">
      <div className="h-3 bg-gray-200 rounded w-4/5" />
    </div>
    <div className="w-12 h-5 bg-gray-200 rounded-full" />
  </div>
)

const EmptyState = ({ onRefresh }: { onRefresh: () => void }) => (
  <div className="flex flex-col items-center justify-center h-full text-center p-4 gap-3">
    <div className="w-12 h-12 rounded-2xl bg-yellow-50 flex items-center justify-center">
      <ClipboardList className="w-6 h-6 text-yellow-400" />
    </div>
    <div className="space-y-1">
      <p className="text-sm font-medium text-gray-600">No tasks</p>
      <p className="text-xs text-gray-400 max-w-[180px]">All caught up! Add tasks in Google Tasks to see them here.</p>
    </div>
    <button
      onClick={onRefresh}
      className="flex items-center gap-1.5 text-xs text-yellow-600 hover:text-yellow-700 font-medium px-3 py-1.5 rounded-lg hover:bg-yellow-50 transition-colors"
    >
      <RefreshCw className="w-3 h-3" />
      Refresh
    </button>
  </div>
)

const TasksWidget = ({ widget }: { widget: WidgetConfig }) => {
  const setWidgetData = useLayoutStore((s) => s.setWidgetData)
  const setWidgetLoading = useLayoutStore((s) => s.setWidgetLoading)
  const setWidgetError = useLayoutStore((s) => s.setWidgetError)
  const [localData, setLocalData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)

  const rawTasks = (widget.data as any)?.tasks || localData?.tasks || []
  const hasError = !!(widget.error || error || (localData as TasksData)?.error || (widget.data as TasksData)?.error)
  const [tasks, setTasks] = useState(rawTasks.length > 0 && !hasError ? rawTasks : [])
  const refreshTrigger = useLayoutStore((s) => s.refreshTriggers[widget.id])

  const fetchData = async () => {
    setIsLoading(true)
    setError(null)
    setWidgetLoading(widget.id, true)
    setWidgetError(widget.id, null)
    try {
      const data = await apiClient.getTasks('default', widget.prompt) as TasksData
      if (data.error || data.status === 'error') {
        const msg = data.error || 'Failed to load tasks'
        console.error(`[TasksWidget] API error:`, msg)
        setError(msg)
        setWidgetError(widget.id, msg)
        setLocalData(data)
        setWidgetData(widget.id, data)
      } else {
        setLocalData(data)
        setWidgetData(widget.id, data)
        if (data?.tasks) {
          setTasks(data.tasks)
        }
        setFetchedAt(Date.now())
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to load tasks'
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

  useEffect(() => {
    const newTasks = (widget.data as any)?.tasks || localData?.tasks || []
    const hasErr = !!(widget.error || error || (localData as TasksData)?.error || (widget.data as TasksData)?.error)
    setTasks(newTasks.length > 0 && !hasErr ? newTasks : hasErr ? [] : [])
  }, [widget.data, localData, widget.error, error])

  const toggleTask = (taskId: string) => {
    setTasks((prev: any[]) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
    )
  }

  const completed = tasks.filter((t: any) => t.completed).length
  const total = tasks.length
  const displayError = widget.error || error || (localData as TasksData)?.error || (widget.data as TasksData)?.error
  const displayLoading = widget.isLoading || isLoading

  if (displayLoading) {
    return (
      <div className="space-y-1 py-2">
        <div className="flex items-center justify-between mb-3 px-2">
          <div className="h-3 bg-gray-200 rounded w-20 animate-pulse" />
          <div className="h-2 bg-gray-200 rounded w-24 animate-pulse" />
        </div>
        <SkeletonRow />
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
          <ListTodo className="w-6 h-6 text-red-300" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-red-500">{displayError}</p>
          <p className="text-xs text-gray-400">Check your connection or try again.</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-xs text-yellow-600 hover:text-yellow-700 font-medium px-3 py-1.5 rounded-lg hover:bg-yellow-50 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    )
  }

  if (tasks.length === 0) {
    return <EmptyState onRefresh={fetchData} />
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">
          {completed} of {total} completed
        </span>
        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
          />
        </div>
      </div>
      <div className="space-y-1">
        {tasks.map((task: any) => (
          <div
            key={task.id}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50/80 cursor-pointer transition-all hover:shadow-sm hover:translate-x-0.5"
            onClick={() => toggleTask(task.id)}
          >
            <button className="shrink-0">
              {task.completed ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <Circle className="w-5 h-5 text-gray-400" />
              )}
            </button>
            <span
              className={`flex-1 text-sm ${
                task.completed ? 'line-through text-gray-400' : 'text-gray-800'
              }`}
            >
              {task.title}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                priorityColors[task.priority] || 'bg-gray-100 text-gray-600'
              }`}
            >
              {task.priority}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2 px-1">
        <span className="text-[10px] text-gray-400">
          {fetchedAt ? `Updated ${formatTimeAgo(fetchedAt)}` : ''}
        </span>
        <button onClick={fetchData} className="text-xs text-yellow-600 cursor-pointer hover:underline flex items-center gap-1">
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

export default TasksWidget
