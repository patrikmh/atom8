import { useDragLayer } from 'react-dnd'
import {
  Mail,
  Calendar,
  CheckSquare,
  HardDrive,
  Sparkles,
  Puzzle,
} from 'lucide-react'

const typeIcons: Record<string, React.ReactNode> = {
  gmail: <Mail className="w-5 h-5" />,
  calendar: <Calendar className="w-5 h-5" />,
  tasks: <CheckSquare className="w-5 h-5" />,
  drive: <HardDrive className="w-5 h-5" />,
  ai: <Sparkles className="w-5 h-5" />,
  custom: <Puzzle className="w-5 h-5" />,
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

  if (!isDragging || !item || !currentOffset) return null

  const icon = typeIcons[item.type] || <Puzzle className="w-5 h-5" />

  return (
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{
        left: currentOffset.x,
        top: currentOffset.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="bg-white border border-blue-400 rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 min-w-[200px]">
        <div className="text-blue-500">{icon}</div>
        <div>
          <div className="font-semibold text-sm text-gray-900">{item.title}</div>
          <div className="text-xs text-gray-500 truncate max-w-[180px]">{item.prompt}</div>
        </div>
      </div>
    </div>
  )
}

export default DragPreview
