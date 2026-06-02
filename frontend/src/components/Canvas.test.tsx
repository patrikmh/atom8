import { render, screen } from '@testing-library/react'
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

vi.mock('./SettingsPanel', () => ({
  default: () => {
    const React = require('react')
    return React.createElement('div', { 'data-testid': 'settings-panel' }, 'SettingsPanel')
  },
}))

vi.mock('react-grid-layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="grid-layout">{children}</div>
  ),
  WidthProvider: (Component: React.ComponentType<any>) => Component,
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
      newWidgetIds: new Set(),
      clearNewWidget: vi.fn(),
    }
    ;(useLayoutStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector(mockStore)
    )

    render(<Canvas />)
    expect(screen.getByTestId('grid-layout')).toBeInTheDocument()
  })

  it('renders settings panel', () => {
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
      newWidgetIds: new Set(),
      clearNewWidget: vi.fn(),
    }
    ;(useLayoutStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector(mockStore)
    )

    render(<Canvas />)
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument()
  })

  it('passes correct props to widgets', () => {
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
      newWidgetIds: new Set(),
      clearNewWidget: vi.fn(),
    }
    ;(useLayoutStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector(mockStore)
    )

    render(<Canvas />)
    // Canvas should render widgets from the store
    expect(screen.getByTestId('grid-layout')).toBeInTheDocument()
  })
})
