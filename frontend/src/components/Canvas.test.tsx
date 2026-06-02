import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Canvas from './Canvas'
import { useLayoutStore } from '@/stores/layoutStore'
import { DEFAULT_LAYOUT, DEFAULT_CANVAS_BACKGROUND, DEFAULT_THEME } from '@/types'

vi.mock('@/stores/layoutStore', () => ({
  useLayoutStore: vi.fn(),
}))

vi.mock('react-dnd', () => ({
  useDrag: vi.fn(() => [{ isDragging: false }, vi.fn()]),
  useDrop: vi.fn(() => [{ isOver: false }, vi.fn()]),
  DndProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('react-dnd-html5-backend', () => ({
  HTML5Backend: {},
}))

vi.mock('react-grid-layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="grid-layout">{children}</div>
  ),
}))

describe('Canvas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders grid layout with widgets', () => {
    const mockStore = {
      widgets: DEFAULT_LAYOUT,
      background: DEFAULT_CANVAS_BACKGROUND,
      theme: DEFAULT_THEME,
      updateLayout: vi.fn(),
      setWidgetLoading: vi.fn(),
      setWidgetError: vi.fn(),
      setWidgetData: vi.fn(),
      refreshTriggers: {},
      triggerRefresh: vi.fn(),
    }
    ;(useLayoutStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector(mockStore)
    )

    render(<Canvas />)
    expect(screen.getByTestId('grid-layout')).toBeInTheDocument()
  })

  it('displays background controls', () => {
    const mockStore = {
      widgets: DEFAULT_LAYOUT,
      background: DEFAULT_CANVAS_BACKGROUND,
      theme: DEFAULT_THEME,
      updateLayout: vi.fn(),
      setWidgetLoading: vi.fn(),
      setWidgetError: vi.fn(),
      setWidgetData: vi.fn(),
      refreshTriggers: {},
      triggerRefresh: vi.fn(),
    }
    ;(useLayoutStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector(mockStore)
    )

    render(<Canvas />)
    expect(screen.getByText('Plain')).toBeInTheDocument()
    expect(screen.getByText('Grid')).toBeInTheDocument()
    expect(screen.getByText('Dark')).toBeInTheDocument()
    expect(screen.getByText('Image')).toBeInTheDocument()
  })

  it('changes background mode on button click', () => {
    const setBackground = vi.fn()
    const mockStore = {
      widgets: DEFAULT_LAYOUT,
      background: DEFAULT_CANVAS_BACKGROUND,
      theme: DEFAULT_THEME,
      updateLayout: vi.fn(),
      setBackground,
      setWidgetLoading: vi.fn(),
      setWidgetError: vi.fn(),
      setWidgetData: vi.fn(),
      refreshTriggers: {},
      triggerRefresh: vi.fn(),
    }
    ;(useLayoutStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector(mockStore)
    )

    render(<Canvas />)
    fireEvent.click(screen.getByText('Dark'))
    expect(setBackground).toHaveBeenCalledWith({ mode: 'dark' })
  })
})
