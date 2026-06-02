import { useEffect, useState } from 'react'
import { WidgetConfig } from '@/types'
import { CheckCircle2, Circle, Loader2, ListTodo } from 'lucide-react'
import { apiClient } from '@/services/api'
import { useLayoutStore } from '@/stores/layoutStore'

const MOCK_TASKS = [
  { id: '1', title: 'Review PR #234', completed: false, priority: 'high' },
  { id: '2', title: 'Update documentation', completed: false, priority: 'medium' },
  { id: '3', title: 'Fix login bug', completed: true, priority: 'high' },
  { id: '4', title: 'Prepare demo', completed: false, priority: 'high' },
  { id: '5', title: 'Email stakeholders', completed: true, priority: 'low' },
  { id: '6', title: 'Deploy to staging', completed: false, priority: 'medium' },
]

const priorityColors: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
}

const TasksWidget = ({ widget }: { widget: WidgetConfig }) => {
  const setWidgetData = useLayoutStore((s) => s.setWidgetData)
  const setWidgetLoading = useLayoutStore((s) => s.setWidgetLoading)
  const setWidgetError = useLayoutStore((s) => s.setWidgetError)
  const [localData, setLocalData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rawTasks = (widget.data as any)?.tasks || localData?.tasks || []
  const [tasks, setTasks] = useState(rawTasks.length > 0 ? rawTasks : MOCK_TASKS)
  const refreshTrigger = useLayoutStore((s) => s.refreshTriggers[widget.id])

  const fetchData = async () => {
    setIsLoading(true)
    setError(null)
    setWidgetLoading(widget.id, true)
    setWidgetError(widget.id, null)
    try {
      const data = await apiClient.getTasks('default', widget.prompt) as any
      setLocalData(data)
      setWidgetData(widget.id, data)
      if (data?.tasks) {
        setTasks(data.tasks)
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to load tasks'
      console.error(`[TasksWidget] fetch failed:`, msg)
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
    setTasks(newTasks.length > 0 ? newTasks : MOCK_TASKS)
  }, [widget.data, localData])

  const toggleTask = (taskId: string) => {
    setTasks((prev: any[]) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
    )
  }

  const completed = tasks.filter((t: any) => t.completed).length
  const total = tasks.length
  const displayError = widget.error || error
  const displayLoading = widget.isLoading || isLoading

  if (displayLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-yellow-500 animate-spin" />
        <span className="ml-2 text-sm text-gray-500">Loading tasks...</span>
      </div>
    )
  }

  if (displayError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <ListTodo className="w-8 h-8 text-red-300 mb-2" />
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
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50/80 cursor-pointer transition-colors"
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
      {tasks.length === 0 && (
        <div className="text-center py-4 text-gray-400 text-sm">
          No tasks for today
        </div>
      )}
      <div className="text-center pt-2">
        <button onClick={fetchData} className="text-xs text-yellow-500 cursor-pointer hover:underline">
          Refresh
        </button>
      </div>
    </div>
  )
}

export default TasksWidget
