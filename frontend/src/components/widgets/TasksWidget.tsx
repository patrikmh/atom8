import { useCallback } from 'react'
import { WidgetConfig } from '@/types'
import { CheckCircle2, Circle, ListTodo } from 'lucide-react'
import { apiClient } from '@/services/api'
import { useWidgetData } from '@/hooks/useWidgetData'
import { WidgetLoading, WidgetEmpty, WidgetError, WidgetRefreshBar } from './WidgetUI'

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

const stripReviewPrefix = (title: string): string => {
  return title.replace(/^Review:\s*/i, '').trim()
}

const formatDueDate = (dueDate: string | null | undefined): string | null => {
  if (!dueDate) return null
  const date = new Date(dueDate)
  if (isNaN(date.getTime())) return null
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const isOverdue = date < now && !isToday
  if (isToday) return 'Today'
  if (isOverdue) return `Overdue ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const TasksWidget = ({ widget }: { widget: WidgetConfig }) => {
  const fetcher = useCallback((prompt: string) => apiClient.getTasks('default', prompt), [])
  const { data, isLoading, error, fetchedAt, fetchData } = useWidgetData<TasksData>(
    widget,
    fetcher,
    'Failed to load tasks',
  )

  const rawTasks = data?.tasks || []
  const tasks = error ? [] : rawTasks

  if (isLoading) return <WidgetLoading />

  if (error) {
    return <WidgetError message={error} onRetry={fetchData} />
  }

  if (tasks.length === 0) {
    return <WidgetEmpty message="No tasks" subtext="All caught up! Add tasks in Google Tasks to see them here." onRefresh={fetchData} />
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-2 pb-1 border-b border-gray-100">
        <ListTodo className="w-4 h-4 text-yellow-500" />
        <span className="text-xs font-medium text-gray-500">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </span>
      </div>
      {tasks.slice(0, 10).map((task: any) => {
        const priority = task.priority || 'medium'
        const colorClass = priorityColors[priority] || priorityColors.medium
        const dueDate = formatDueDate(task.due_date || task.due)
        return (
          <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50/80 transition-colors">
            {task.completed ? (
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
            ) : (
              <Circle className="w-5 h-5 text-gray-300 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className={`text-sm truncate ${task.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                {stripReviewPrefix(task.title)}
              </div>
              {dueDate && (
                <div className="text-xs text-gray-400 mt-0.5">{dueDate}</div>
              )}
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${colorClass}`}>
              {priority}
            </span>
          </div>
        )
      })}
      <WidgetRefreshBar fetchedAt={fetchedAt} onRefresh={fetchData} />
    </div>
  )
}

export default TasksWidget
