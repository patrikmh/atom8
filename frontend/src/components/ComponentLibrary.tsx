import React, { useState, useEffect } from 'react'
import { useDrag } from 'react-dnd'
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Search,
  Mail,
  Calendar,
  CheckSquare,
  HardDrive,
  FileText,
  BookOpen,
  Sparkles,
  Puzzle,
  X,
  Bot,
  Palette,
  GripVertical,
} from 'lucide-react'
import AIDesignerPanel from '@/components/AIDesignerPanel'
import ThemePicker from '@/components/ThemePicker'
import {
  useLayoutStore,
  getFilteredComponents,
  categories,
} from '@/stores/layoutStore'
import { WidgetConfig, Category } from '@/types'

const categoryIcons: Record<Category, React.ReactNode> = {
  Gmail: <Mail className="w-4 h-4" />,
  Calendar: <Calendar className="w-4 h-4" />,
  Tasks: <CheckSquare className="w-4 h-4" />,
  Drive: <HardDrive className="w-4 h-4" />,
  Docs: <FileText className="w-4 h-4" />,
  Notion: <BookOpen className="w-4 h-4" />,
  AI: <Sparkles className="w-4 h-4" />,
  Markdown: <FileText className="w-4 h-4" />,
  Custom: <Puzzle className="w-4 h-4" />,
}

const categoryColors: Record<Category, string> = {
  Gmail: '#ef4444',
  Calendar: '#8b5cf6',
  Tasks: '#22c55e',
  Drive: '#3b82f6',
  Docs: '#6366f1',
  Notion: '#0ea5e9',
  AI: '#f59e0b',
  Markdown: '#8b5cf6',
  Custom: '#6b7280',
}

const DraggableComponentItem = ({
  item,
  isCollapsed,
}: {
  item: Omit<WidgetConfig, 'id' | 'layout' | 'style' | 'data'>
  isCollapsed: boolean
}) => {
  const theme = useLayoutStore((state) => state.theme)
  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: 'WIDGET',
    item: { type: item.type, title: item.title, category: item.category, prompt: item.prompt },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }))

  // Hide default drag preview — our custom DragPreview layer renders it
  useEffect(() => {
    if (typeof preview === 'function') {
      preview(null, { captureDraggingState: true })
    }
  }, [preview])

  const catColor = categoryColors[item.category as Category]

  return (
    <div
      ref={drag}
      className={`cursor-grab active:cursor-grabbing transition-all ${
        isDragging ? 'opacity-50' : 'opacity-100'
      } ${
        isCollapsed
          ? 'p-2 rounded-lg flex items-center justify-center hover:scale-105 hover:shadow-md transition-transform'
          : 'group rounded-lg border hover:shadow-md hover:scale-[1.02] hover:border-blue-300 transition-all flex items-stretch overflow-hidden'
      }`}
      style={
        isCollapsed
          ? { backgroundColor: 'transparent' }
          : { backgroundColor: theme.widgetBg, borderColor: theme.widgetBorder }
      }
      title={isCollapsed ? item.title : undefined}
    >
      {isCollapsed ? (
        categoryIcons[item.category as Category]
      ) : (
        <>
          {/* Category color accent bar */}
          <div className="w-1 shrink-0 self-stretch" style={{ backgroundColor: catColor }} />
          {/* Drag grip handle */}
          <div className="flex items-center px-1.5 shrink-0" style={{ color: theme.sidebarText + '44' }}>
            <GripVertical className="w-4 h-4 group-hover:text-blue-400 transition-colors" />
          </div>
          <div className="flex-1 py-2.5 pr-3 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span style={{ color: catColor }}>{categoryIcons[item.category as Category]}</span>
              <span className="font-medium text-sm" style={{ color: theme.widgetText }}>{item.title}</span>
            </div>
            <p className="text-xs truncate" style={{ color: theme.sidebarText + 'aa' }}>{item.prompt}</p>
          </div>
        </>
      )}
    </div>
  )
}

const ComponentLibrary = () => {
  const sidebarOpen = useLayoutStore((state) => state.sidebarOpen)
  const toggleSidebar = useLayoutStore((state) => state.toggleSidebar)
  const searchQuery = useLayoutStore((state) => state.searchQuery)
  const setSearchQuery = useLayoutStore((state) => state.setSearchQuery)
  const selectedCategory = useLayoutStore((state) => state.selectedCategory)
  const setSelectedCategory = useLayoutStore((state) => state.setSelectedCategory)
  const theme = useLayoutStore((state) => state.theme)
  const filteredComponents = getFilteredComponents(searchQuery, selectedCategory)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [themePanelOpen, setThemePanelOpen] = useState(false)

  const groupedByCategory = filteredComponents.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {} as Record<string, typeof filteredComponents>)

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={toggleSidebar}
        />
      )}
      <aside
        className={`flex flex-col border-r shadow-sm transition-all duration-300 md:relative fixed inset-y-0 left-0 z-50 ${
          sidebarOpen ? 'w-72' : 'w-14'
        } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{ backgroundColor: theme.sidebarBg, borderColor: theme.widgetBorder }}
      >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: theme.widgetBorder }}>
        {sidebarOpen ? (
          <>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.accentColor + '22' }}>
                <Puzzle className="w-4 h-4" style={{ color: theme.accentColor }} />
              </div>
              <div>
                <h2 className="font-semibold text-sm leading-tight" style={{ color: theme.sidebarText }}>Components</h2>
                <p className="text-[10px] leading-tight" style={{ color: theme.sidebarText + '88' }}>Drag to canvas</p>
              </div>
            </div>
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
              style={{ color: theme.sidebarText }}
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-black/5 transition-colors mx-auto"
            style={{ color: theme.sidebarText }}
            title="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* AI Designer — Collapsible */}
      {sidebarOpen && (
        <div style={{ borderColor: theme.widgetBorder }}>
          <button
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/50 transition-colors"
            title={aiPanelOpen ? 'Collapse AI Designer' : 'Expand AI Designer'}
          >
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-900">AI Designer</span>
            </div>
            {aiPanelOpen ? (
              <ChevronUp className="w-4 h-4 text-purple-600" />
            ) : (
              <ChevronDown className="w-4 h-4 text-purple-600" />
            )}
          </button>
          {aiPanelOpen && <AIDesignerPanel />}
        </div>
      )}

      {/* Theme — Collapsible */}
      {sidebarOpen && (
        <div style={{ borderColor: theme.widgetBorder }}>
          <button
            onClick={() => setThemePanelOpen(!themePanelOpen)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/50 transition-colors"
            title={themePanelOpen ? 'Collapse Theme' : 'Expand Theme'}
          >
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4" style={{ color: theme.accentColor }} />
              <span className="text-sm font-medium" style={{ color: theme.sidebarText }}>Theme</span>
            </div>
            {themePanelOpen ? (
              <ChevronUp className="w-4 h-4" style={{ color: theme.sidebarText }} />
            ) : (
              <ChevronDown className="w-4 h-4" style={{ color: theme.sidebarText }} />
            )}
          </button>
          {themePanelOpen && <ThemePicker />}
        </div>
      )}

      {!sidebarOpen && (
        <div className="flex flex-col gap-2 p-2 items-center">
          <button
            className="p-2 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: theme.sidebarText }}
            onClick={() => {
              setAiPanelOpen(true)
              toggleSidebar()
            }}
            title="AI Designer"
          >
            <Bot className="w-4 h-4" />
          </button>
          <button
            className="p-2 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: theme.sidebarText }}
            onClick={() => {
              setThemePanelOpen(true)
              toggleSidebar()
            }}
            title="Theme"
          >
            <Palette className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search */}
      {sidebarOpen && (
        <div className="p-3 border-b" style={{ borderColor: theme.widgetBorder }}>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: theme.sidebarText + 'aa' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search components..."
              className="w-full pl-8 pr-8 py-2 text-sm border rounded-lg focus:outline-none"
              style={{ borderColor: theme.widgetBorder, backgroundColor: theme.widgetBg, color: theme.widgetText }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Category Filter */}
      {sidebarOpen && (
        <div className="p-3 border-b" style={{ borderColor: theme.widgetBorder }}>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setSelectedCategory('All')}
              className="px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors"
              style={
                selectedCategory === 'All'
                  ? { backgroundColor: theme.accentColor, color: '#ffffff' }
                  : { backgroundColor: theme.widgetBorder + '44', color: theme.sidebarText }
              }
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className="px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors"
                style={
                  selectedCategory === cat
                    ? { backgroundColor: theme.accentColor, color: '#ffffff' }
                    : { backgroundColor: theme.widgetBorder + '44', color: theme.sidebarText }
                }
              >
                {categoryIcons[cat]}
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Collapsed category icons */}
      {!sidebarOpen && (
        <div className="flex flex-col gap-2 p-2 items-center">
          {categories.map((cat) => (
            <button
              key={cat}
              className="p-2 rounded-lg flex items-center justify-center transition-colors"
              style={
                selectedCategory === cat
                  ? { backgroundColor: theme.accentColor + '22', color: theme.accentColor }
                  : { color: theme.sidebarText }
              }
              onClick={() => {
                setSelectedCategory(selectedCategory === cat ? 'All' : cat)
                if (!sidebarOpen) toggleSidebar()
              }}
              title={cat}
            >
              {categoryIcons[cat]}
            </button>
          ))}
        </div>
      )}

      {/* Component List */}
      {sidebarOpen && (
        <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-hide">
          {Object.entries(groupedByCategory).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: theme.sidebarText + 'aa' }}>
                {category}
              </h3>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <DraggableComponentItem
                    key={`${category}-${idx}`}
                    item={item}
                    isCollapsed={false}
                  />
                ))}
              </div>
              {/* Category hint with dot */}
              <div className="flex items-center gap-1.5 mt-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: categoryColors[category as Category] }} />
                <span className="text-[10px] uppercase tracking-wider" style={{ color: categoryColors[category as Category] + 'aa' }}>
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </span>
              </div>
            </div>
          ))}

          {filteredComponents.length === 0 && (
            <div className="text-center py-8 text-sm" style={{ color: theme.sidebarText + '88' }}>
              No components found
            </div>
          )}
        </div>
      )}
    </aside>
    </>
  )
}

export default ComponentLibrary
