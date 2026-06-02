import { useDragLayer } from 'react-dnd'
import {
  Mail,
  Calendar,
  CheckSquare,
  HardDrive,
  Sparkles,
  Puzzle,
} from 'lucide-react'
import { useLayoutStore } from '@/stores/layoutStore'

const typeIcons: Record<string, React.ReactNode> = {
  gmail: <Mail className="w-5 h-5" />,
  calendar: <Calendar className="w-5 h-5" />,
  tasks: <CheckSquare className="w-5 h-5" />,
  drive: <HardDrive className="w-5 h-5" />,
  ai: <Sparkles className="w-5 h-5" />,
  custom: <Puzzle className="w-5 h-5" />,
}

const categoryColors: Record<string, string> = {
  Gmail: '#ef4444',
  Calendar: '#8b5cf6',
  Tasks: '#22c55e',
  Drive: '#f59e0b',
  AI: '#3b82f6',
  Custom: '#6b7280',
}

interface DragItem {
  type: string
  title: string
  category: string
  prompt: string
}

const DragPreview = () => {
  const { isDragging, item, currentOffset } = useDragLayer((monitor) => ({
    isDragging: monitor.isDragging(),
    item: monitor.getItem() as DragItem | null,
    currentOffset: monitor.getClientOffset(),
  }))
  const theme = useLayoutStore((state) => state.theme)

  if (!isDragging || !item || !currentOffset) return null

  const icon = typeIcons[item.type] || <Puzzle className="w-5 h-5" />
  const accentColor = categoryColors[item.category] || theme.accentColor

  return (
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{
        left: currentOffset.x,
        top: currentOffset.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div
        className="rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 min-w-[200px]"
        style={{
          backgroundColor: theme.widgetBg,
          border: `2px solid ${accentColor}`,
          boxShadow: `0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 0 0 2px ${accentColor}33`,
        }}
      >
        <div style={{ color: accentColor }}>{icon}</div>
        <div>
          <div className="font-semibold text-sm" style={{ color: theme.widgetText }}>{item.title}</div>
          <div className="text-xs truncate max-w-[180px]" style={{ color: theme.sidebarText + 'aa' }}>{item.prompt}</div>
        </div>
      </div>
    </div>
  )
}

export default DragPreview
