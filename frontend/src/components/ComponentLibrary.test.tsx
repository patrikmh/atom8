import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ComponentLibrary from './ComponentLibrary'
import { useLayoutStore } from '@/stores/layoutStore'
import { DEFAULT_THEME } from '@/types'

vi.mock('@/stores/layoutStore', () => ({
  useLayoutStore: vi.fn(),
  getFilteredComponents: vi.fn(() => [
    { type: 'gmail', title: 'Last N Emails', category: 'Gmail', prompt: 'Get last {{count}} emails' },
    { type: 'calendar', title: 'Today\'s Events', category: 'Calendar', prompt: 'Get today\'s events' },
  ]),
  getCategoryIcon: vi.fn(() => 'Mail'),
  categories: ['Gmail', 'Calendar', 'Tasks', 'Drive', 'AI', 'Custom'],
}))

vi.mock('react-dnd', () => ({
  useDrag: vi.fn(() => [{ isDragging: false }, vi.fn()]),
}))

describe('ComponentLibrary', () => {
  it('renders with all 6 categories', () => {
    const mockStore = {
      sidebarOpen: true,
      toggleSidebar: vi.fn(),
      searchQuery: '',
      setSearchQuery: vi.fn(),
      selectedCategory: 'All',
      setSelectedCategory: vi.fn(),
      theme: DEFAULT_THEME,
    }
    ;(useLayoutStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector(mockStore)
    )

    render(<ComponentLibrary />)
    // Use getAllByText since 'Gmail' appears in both category button and group header
    expect(screen.getAllByText('Gmail').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Calendar').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Tasks').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Drive').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('AI').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Custom').length).toBeGreaterThanOrEqual(1)
    // Verify category filter buttons exist (by role)
    const buttons = screen.getAllByRole('button')
    const categoryLabels = ['Gmail', 'Calendar', 'Tasks', 'Drive', 'AI', 'Custom']
    categoryLabels.forEach(label => {
      expect(buttons.some(btn => btn.textContent?.includes(label))).toBe(true)
    })
  })

  it('can be collapsed', () => {
    const toggleSidebar = vi.fn()
    const mockStore = {
      sidebarOpen: true,
      toggleSidebar,
      searchQuery: '',
      setSearchQuery: vi.fn(),
      selectedCategory: 'All',
      setSelectedCategory: vi.fn(),
      theme: DEFAULT_THEME,
    }
    ;(useLayoutStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector(mockStore)
    )

    render(<ComponentLibrary />)
    const collapseBtn = screen.getByTitle('Collapse sidebar')
    fireEvent.click(collapseBtn)
    expect(toggleSidebar).toHaveBeenCalled()
  })

  it('filters by search query', () => {
    const setSearchQuery = vi.fn()
    const mockStore = {
      sidebarOpen: true,
      toggleSidebar: vi.fn(),
      searchQuery: '',
      setSearchQuery,
      selectedCategory: 'All',
      setSelectedCategory: vi.fn(),
      theme: DEFAULT_THEME,
    }
    ;(useLayoutStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector(mockStore)
    )

    render(<ComponentLibrary />)
    const input = screen.getByPlaceholderText('Search components...')
    fireEvent.change(input, { target: { value: 'email' } })
    expect(setSearchQuery).toHaveBeenCalledWith('email')
  })
})
