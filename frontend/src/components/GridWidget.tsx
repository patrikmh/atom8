import { useState, useRef, useEffect } from 'react'
import { useLayoutStore } from '@/stores/layoutStore'
import { WidgetConfig } from '@/types'
import {
  Mail,
  Calendar,
  CheckSquare,
  HardDrive,
  FileText,
  BookOpen,
  Sparkles,
  Puzzle,
  GripVertical,
  X,
  Settings,
  Check,
  Edit3,
  RefreshCw,
  Clock,
} from 'lucide-react'
import GmailWidget from './widgets/GmailWidget'
import CalendarWidget from './widgets/CalendarWidget'
import TasksWidget from './widgets/TasksWidget'
import DriveWidget from './widgets/DriveWidget'
import DocsWidget from './widgets/DocsWidget'
import NotionWidget from './widgets/NotionWidget'
import AIWidget from './widgets/AIWidget'
import MarkdownWidget from './widgets/MarkdownWidget'
import CustomWidget from './widgets/CustomWidget'
import ErrorBoundary from './ErrorBoundary'

const widgetIcons: Record<string, React.ReactNode> = {
  gmail: <Mail className="w-4 h-4" />,
  calendar: <Calendar className="w-4 h-4" />,
  tasks: <CheckSquare className="w-4 h-4" />,
  drive: <HardDrive className="w-4 h-4" />,
  docs: <FileText className="w-4 h-4" />,
  notion: <BookOpen className="w-4 h-4" />,
  ai: <Sparkles className="w-4 h-4" />,
  markdown: <FileText className="w-4 h-4" />,
  custom: <Puzzle className="w-4 h-4" />,
}

const widgetComponents: Record<string, React.FC<{ widget: WidgetConfig }>> = {
  gmail: GmailWidget,
  calendar: CalendarWidget,
  tasks: TasksWidget,
  drive: DriveWidget,
  docs: DocsWidget,
  notion: NotionWidget,
  ai: AIWidget,
  markdown: MarkdownWidget,
  custom: CustomWidget,
}

const GridWidget = ({ widget }: { widget: WidgetConfig }) => {
  const removeWidget = useLayoutStore((state) => state.removeWidget)
  const updateWidgetPrompt = useLayoutStore((state) => state.updateWidgetPrompt)
  const updateWidgetTitle = useLayoutStore((state) => state.updateWidgetTitle)
  const setWidgetRefreshInterval = useLayoutStore((state) => state.setWidgetRefreshInterval)
  const setWidgetData = useLayoutStore((state) => state.setWidgetData)
  const refreshWidget = useLayoutStore((state) => state.refreshWidget)
  const theme = useLayoutStore((state) => state.theme)
  const [isEditingPrompt, setIsEditingPrompt] = useState(false)
  const [promptDraft, setPromptDraft] = useState(widget.prompt)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(widget.title)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const promptInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  useEffect(() => {
    if (isEditingPrompt && promptInputRef.current) {
      promptInputRef.current.select()
    }
  }, [isEditingPrompt])

  const WidgetComponent = widgetComponents[widget.type] || AIWidget

  const savePrompt = () => {
    updateWidgetPrompt(widget.id, promptDraft)
    setIsEditingPrompt(false)
    // Clear existing data so the widget re-fetches with the new prompt
    setWidgetData(widget.id, null)
    // Trigger a refresh after a small delay to let the store update
    setTimeout(() => refreshWidget(widget.id), 50)
  }

  const cancelPromptEdit = () => {
    setPromptDraft(widget.prompt)
    setIsEditingPrompt(false)
  }

  const saveTitle = () => {
    updateWidgetTitle(widget.id, titleDraft)
    setIsEditingTitle(false)
  }

  const cancelTitleEdit = () => {
    setTitleDraft(widget.title)
    setIsEditingTitle(false)
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false)
      }
    }
    if (isSettingsOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isSettingsOpen])

  const intervalOptions = [
    { value: 0, label: 'Manual' },
    { value: 30, label: '30 sec' },
    { value: 60, label: '1 min' },
    { value: 300, label: '5 min' },
    { value: 600, label: '10 min' },
    { value: 1800, label: '30 min' },
    { value: 3600, label: '1 hour' },
  ]

  const updateLayout = useLayoutStore((state) => state.updateLayout)
  const widgets = useLayoutStore((state) => state.widgets)
  const moveWidget = (dx: number, dy: number) => {
    const target = widgets.find((w) => w.id === widget.id)
    if (!target) return
    const newLayout = widgets.map((w) =>
      w.id === widget.id
        ? { ...w.layout, x: Math.max(0, w.layout.x + dx), y: Math.max(0, w.layout.y + dy) }
        : w.layout
    )
    updateLayout(newLayout)
  }

  return (
    <div
      className="h-full w-full flex flex-col rounded-lg overflow-hidden shadow-sm"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.shiftKey) {
          if (e.key === 'ArrowUp') { e.preventDefault(); moveWidget(0, -1) }
          if (e.key === 'ArrowDown') { e.preventDefault(); moveWidget(0, 1) }
          if (e.key === 'ArrowLeft') { e.preventDefault(); moveWidget(-1, 0) }
          if (e.key === 'ArrowRight') { e.preventDefault(); moveWidget(1, 0) }
        }
      }}
      style={{
        backgroundColor: widget.style.backgroundColor || theme.widgetBg,
        borderColor: widget.style.borderColor || theme.widgetBorder,
        borderRadius: `${widget.style.borderRadius}px`,
        borderWidth: `${widget.style.borderWidth}px`,
        boxShadow: widget.style.shadow || theme.shadow,
        fontFamily: widget.style.fontFamily,
        fontSize: `${widget.style.fontSize}px`,
        color: widget.style.fontColor || theme.widgetText,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: theme.widgetBorder + '44', backgroundColor: theme.headerBg + '88' }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="drag-handle cursor-grab active:cursor-grabbing p-2 rounded hover:bg-black/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" title="Drag to move widget (Shift+Arrows to nudge)">
            <GripVertical className="w-4 h-4" style={{ color: theme.sidebarText + 'aa' }} />
          </div>
          {isEditingTitle ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <input
                ref={titleInputRef}
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle()
                  if (e.key === 'Escape') cancelTitleEdit()
                }}
                className="flex-1 min-w-0 px-2 py-0.5 text-sm border rounded focus:outline-none"
                style={{ borderColor: theme.widgetBorder, backgroundColor: theme.widgetBg, color: theme.widgetText }}
                autoFocus
              />
              <button onClick={saveTitle} className="p-0.5 rounded hover:opacity-70" style={{ color: '#22c55e' }}>
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={cancelTitleEdit} className="p-0.5 rounded hover:opacity-70" style={{ color: '#ef4444' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span style={{ color: theme.accentColor }}>{widgetIcons[widget.type]}</span>
              <span className="font-medium text-sm truncate" style={{ color: theme.widgetText }}>{widget.title}</span>
              <button
                onClick={() => setIsEditingTitle(true)}
                className="p-0.5 rounded hover:opacity-70 shrink-0"
                style={{ color: theme.sidebarText + '88' }}
                title="Edit title"
              >
                <Edit3 className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Data status dot */}
          <div
            className={`w-1.5 h-1.5 rounded-full transition-all ${
              widget.isLoading ? 'bg-blue-400 animate-pulse' : widget.error ? 'bg-red-400' : 'bg-green-400'
            }`}
            title={widget.isLoading ? 'Loading...' : widget.error ? 'Error' : 'Live data'}
          />
          <button
            onClick={() => refreshWidget(widget.id)}
            className="p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: theme.sidebarText + 'aa' }}
            title="Refresh data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${widget.isLoading ? 'animate-spin' : ''}`} />
          </button>
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="p-1 rounded hover:opacity-70 transition-opacity"
              style={{ color: theme.sidebarText + 'aa' }}
              title="Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            {isSettingsOpen && (
              <div
                className="absolute right-0 top-8 z-20 rounded-lg shadow-lg border py-2 min-w-[160px]"
                style={{ backgroundColor: theme.widgetBg, borderColor: theme.widgetBorder }}
              >
                <div className="px-3 py-1 text-xs font-medium" style={{ color: theme.sidebarText + 'aa' }}>
                  Auto Refresh
                </div>
                {intervalOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setWidgetRefreshInterval(widget.id, opt.value === 0 ? undefined : opt.value)
                      setIsSettingsOpen(false)
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-opacity-10 transition-colors"
                    style={{
                      backgroundColor: (widget.refreshInterval === opt.value || (opt.value === 0 && !widget.refreshInterval)) ? theme.accentColor + '22' : 'transparent',
                      color: theme.widgetText,
                    }}
                  >
                    <Clock className="w-3 h-3" style={{ color: theme.sidebarText + 'aa' }} />
                    <span>{opt.label}</span>
                    {(widget.refreshInterval === opt.value || (opt.value === 0 && !widget.refreshInterval)) && (
                      <Check className="w-3 h-3 ml-auto" style={{ color: theme.accentColor }} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => removeWidget(widget.id)}
            className="p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: theme.sidebarText + 'aa' }}
            title="Remove"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3" style={{ padding: `${widget.style.padding}px` }}>
        <ErrorBoundary>
          <WidgetComponent widget={widget} />
        </ErrorBoundary>
      </div>

      {/* Footer / Prompt */}
      <div
        className="px-3 py-1.5 border-t text-xs"
        style={{ borderColor: theme.widgetBorder + '44', color: theme.sidebarText + 'aa' }}
      >
        {widget.type === 'custom' ? (
          isEditingPrompt ? (
            <div className="flex items-center gap-2">
              <input
                ref={promptInputRef}
                type="text"
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') savePrompt()
                  if (e.key === 'Escape') cancelPromptEdit()
                }}
                className="flex-1 px-2 py-1 text-xs border rounded focus:outline-none"
                style={{ borderColor: theme.widgetBorder, backgroundColor: theme.widgetBg, color: theme.widgetText }}
                autoFocus
              />
              <button onClick={savePrompt} className="p-0.5 rounded hover:opacity-70" style={{ color: '#22c55e' }}>
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={cancelPromptEdit} className="p-0.5 rounded hover:opacity-70" style={{ color: '#ef4444' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="truncate flex-1">{widget.prompt}</span>
              <button
                onClick={() => setIsEditingPrompt(true)}
                className="p-0.5 rounded hover:opacity-70 shrink-0"
                style={{ color: theme.sidebarText + '88' }}
                title="Edit prompt"
              >
                <Edit3 className="w-3 h-3" />
              </button>
            </div>
          )
        ) : (
          <div className="flex items-center gap-2">
            <span className="truncate flex-1">{widget.prompt}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default GridWidget
