import { useCallback, useRef, useEffect } from 'react'
import { WidthProvider } from 'react-grid-layout'
import GridLayoutBase from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const GridLayout = WidthProvider(GridLayoutBase)
import { useDrop } from 'react-dnd'
import { useLayoutStore } from '@/stores/layoutStore'
import { CanvasBackground } from '@/types'
import GridWidget from './GridWidget'
import SettingsPanel from './SettingsPanel'

const Canvas = () => {
  const widgets = useLayoutStore((state) => state.widgets)
  const background = useLayoutStore((state) => state.background)
  const theme = useLayoutStore((state) => state.theme)
  const updateLayout = useLayoutStore((state) => state.updateLayout)
  const addWidget = useLayoutStore((state) => state.addWidget)
  const newWidgetIds = useLayoutStore((state) => state.newWidgetIds)
  const clearNewWidget = useLayoutStore((state) => state.clearNewWidget)
  const canvasRef = useRef<HTMLDivElement>(null)

  const handleLayoutChange = useCallback(
    (layout: GridLayoutBase.Layout[]) => {
      updateLayout(layout)
    },
    [updateLayout]
  )

  const [{ isOver, canDrop, itemType }, dropRef] = useDrop(() => ({
    accept: 'WIDGET',
    canDrop: (_item, monitor) => {
      const offset = monitor.getClientOffset()
      if (!offset || !canvasRef.current) return false
      const gridEl = canvasRef.current.querySelector('.react-grid-layout') as HTMLElement
      if (!gridEl) return false
      const gridRect = gridEl.getBoundingClientRect()
      const mouseX = offset.x - gridRect.left
      const mouseY = offset.y - gridRect.top
      return (
        mouseX >= 0 && mouseX <= gridRect.width && mouseY >= 0 && mouseY <= gridRect.height
      )
    },
    drop: (item: any, monitor) => {
      const offset = monitor.getClientOffset()
      if (!offset || !canvasRef.current) return

      const gridEl = canvasRef.current.querySelector('.react-grid-layout') as HTMLElement
      if (!gridEl) return

      const gridRect = gridEl.getBoundingClientRect()
      const mouseX = offset.x - gridRect.left
      const mouseY = offset.y - gridRect.top

      const cols = 12
      const rowHeight = 60
      const marginX = 16
      const marginY = 16
      const width = gridRect.width

      const colWidth = (width - (cols - 1) * marginX) / cols
      const x = Math.max(0, Math.min(cols - 4, Math.round(mouseX / (colWidth + marginX))))
      const y = Math.max(0, Math.round(mouseY / (rowHeight + marginY)))

      addWidget(item, { x, y, w: 4, h: 3 })
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
      itemType: (monitor.getItem() as any)?.type || null,
    }),
  }))

  // Clear new widget animation flags after animation completes
  useEffect(() => {
    if (newWidgetIds.size === 0) return
    const timers = Array.from(newWidgetIds).map((id) =>
      setTimeout(() => clearNewWidget(id), 350)
    )
    return () => timers.forEach(clearTimeout)
  }, [newWidgetIds, clearNewWidget])

  const getBackgroundStyle = (bg: CanvasBackground): React.CSSProperties => {
    const base: React.CSSProperties = {
      width: '100%',
      height: '100%',
      overflow: 'auto',
      transition: 'background 0.3s ease',
    }

    switch (bg.mode) {
      case 'plain':
        return { ...base, backgroundColor: theme.canvasBg }
      case 'grid':
        return {
          ...base,
          backgroundColor: theme.canvasBg,
          backgroundImage: `linear-gradient(${bg.gridColor} 1px, transparent 1px),
                            linear-gradient(90deg, ${bg.gridColor} 1px, transparent 1px)`,
          backgroundSize: '20px 20px',
        }
      case 'image':
        return {
          ...base,
          backgroundColor: theme.canvasBg,
          backgroundImage: bg.imageUrl ? `url(${bg.imageUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }
      case 'dark':
        return {
          ...base,
          backgroundColor: theme.canvasBg,
          backgroundImage: `radial-gradient(${theme.widgetBorder} 1px, transparent 1px)`,
          backgroundSize: '20px 20px',
        }
      default:
        return { ...base, backgroundColor: theme.canvasBg }
    }
  }

  return (
    <div
      ref={(node) => {
        (canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = node
        dropRef(node)
      }}
      style={getBackgroundStyle(background)}
      className={`relative ${isOver && canDrop ? 'ring-2 ring-blue-400 ring-opacity-50' : ''}`}
    >
      {/* Drop zone indicator */}
      {isOver && canDrop && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
          <div className="border-2 border-dashed border-blue-400 rounded-xl bg-blue-50/50 px-8 py-4 text-blue-600 font-medium text-sm flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0 0l-4-4m4 4l4-4" />
            </svg>
            {itemType === 'WIDGET' ? 'Drop widget here' : 'Move widget here'}
          </div>
        </div>
      )}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <SettingsPanel />
      </div>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isOver && canDrop ? 'Drop zone active' : ''}
      </div>
      <GridLayout
        className="layout"
        cols={12}
        rowHeight={60}
        margin={[16, 16]}
        draggableHandle=".drag-handle"
        layout={widgets.map((w) => w.layout)}
        onLayoutChange={handleLayoutChange}
        useCSSTransforms={true}
        isResizable={true}
        isDraggable={true}
        compactType={null}
        resizeHandles={['se']}
        preventCollision={false}
      >
        {widgets.map((widget) => (
          <div
            key={widget.id}
            className={newWidgetIds.has(widget.id) ? 'widget-appear' : ''}
          >
            <GridWidget widget={widget} />
          </div>
        ))}
      </GridLayout>
    </div>
  )
}

export default Canvas
