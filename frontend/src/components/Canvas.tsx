import { useCallback, useRef } from 'react'
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
  const canvasRef = useRef<HTMLDivElement>(null)

  const handleLayoutChange = useCallback(
    (layout: GridLayoutBase.Layout[]) => {
      updateLayout(layout)
    },
    [updateLayout]
  )

  const [{ isOver, canDrop }, dropRef] = useDrop(() => ({
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
    }),
  }))

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
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <SettingsPanel />
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
          <div key={widget.id}>
            <GridWidget widget={widget} />
          </div>
        ))}
      </GridLayout>
    </div>
  )
}

export default Canvas
