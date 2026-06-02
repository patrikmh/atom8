import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import GmailWidget from './GmailWidget'
import { WidgetConfig, DEFAULT_WIDGET_STYLE } from '@/types'

const mockWidget: WidgetConfig = {
  id: 'test',
  type: 'gmail',
  title: 'Test',
  category: 'Gmail',
  prompt: 'Test',
  layout: { i: 'test', x: 0, y: 0, w: 4, h: 3 },
  style: DEFAULT_WIDGET_STYLE,
}

vi.mock('@/services/api', () => ({
  apiClient: {
    getGmail: vi.fn(() => Promise.resolve({
      emails: [
        { id: '1', from_name: 'Alice Smith', subject: 'Project Update', preview: 'Here are the latest updates...', date: '10:30 AM', is_read: true },
      ],
      status: 'ok'
    })),
  },
}))

const mockRefreshTriggers = {}
const mockSetWidgetData = vi.fn()
const mockSetWidgetLoading = vi.fn()
const mockSetWidgetError = vi.fn()

vi.mock('@/stores/layoutStore', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    refreshTriggers: mockRefreshTriggers,
    setWidgetData: mockSetWidgetData,
    setWidgetLoading: mockSetWidgetLoading,
    setWidgetError: mockSetWidgetError,
  })),
}))

describe('GmailWidget', () => {
  it('renders with placeholder email data after loading', async () => {
    render(<GmailWidget widget={mockWidget} />)
    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    })
    expect(screen.getByText('Project Update')).toBeInTheDocument()
  })

  it('renders with custom data if provided', async () => {
    const widgetWithData: WidgetConfig = {
      ...mockWidget,
      data: {
        emails: [
          { id: '99', from_name: 'Test User', from_email: '', subject: 'Test Subject', preview: 'Test preview', date: 'Now', is_read: true },
        ],
      },
    }
    render(<GmailWidget widget={widgetWithData} />)
    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument()
    })
    expect(screen.getByText('Test Subject')).toBeInTheDocument()
  })
})
