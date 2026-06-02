import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import Canvas from '@/components/Canvas'
import ComponentLibrary from '@/components/ComponentLibrary'
import AIChatWidget from '@/components/AIChatWidget'
import DragPreview from '@/components/DragPreview'
import { useLayoutStore } from '@/stores/layoutStore'
import { useEffect, useState, useRef } from 'react'
import { Menu } from 'lucide-react'

function App() {
  const theme = useLayoutStore((s) => s.theme)
  const undo = useLayoutStore((s) => s.undo)
  const redo = useLayoutStore((s) => s.redo)
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen)
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar)
  const [isMobile, setIsMobile] = useState(false)
  const hasAutoClosed = useRef(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (isMobile && sidebarOpen && !hasAutoClosed.current) {
      hasAutoClosed.current = true
      toggleSidebar()
    }
  }, [isMobile, sidebarOpen, toggleSidebar])

  return (
    <DndProvider backend={HTML5Backend}>
      <div
        className="flex h-screen w-screen overflow-hidden"
        style={{ backgroundColor: theme.canvasBg }}
      >
        <div className="flex flex-col">
          <ComponentLibrary />
        </div>
        <main className="flex-1 relative">
          {/* Mobile hamburger menu */}
          {!sidebarOpen && isMobile && (
            <button
              onClick={toggleSidebar}
              className="absolute top-3 left-3 z-30 p-2 rounded-lg shadow-md backdrop-blur-sm"
              style={{ backgroundColor: theme.headerBg + 'ee', color: theme.sidebarText }}
              title="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <Canvas />
        </main>
        <AIChatWidget />
        <DragPreview />
      </div>
    </DndProvider>
  )
}

export default App
