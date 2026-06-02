import { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Loader2, Sparkles, Minimize2, Maximize2, Trash2, Plus, CheckCircle, FileText, ExternalLink, ChevronRight, Mail, Calendar, CheckSquare, HardDrive, AlertTriangle, Info, Bell, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { apiClient } from '@/services/api'
import { useLayoutStore } from '@/stores/layoutStore'

interface A2UIComponent {
  type: string
  [key: string]: any
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  isLoading?: boolean
  components?: A2UIComponent[]
  sources?: string[]
}

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content: 'Hi! I am connected to a headless pi session. I can help you with your dashboard data, create widgets, or answer questions about your project. What would you like to do?',
}

// ─── A2UI Component Renderers ───

const EmailListComponent = ({ emails }: { emails: any[] }) => {
  if (!emails?.length) return <div className="text-gray-500 text-sm">No emails found</div>
  return (
    <div className="space-y-2">
      {emails.map((email: any) => (
        <div key={email.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start gap-2">
            <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${email.is_read ? 'bg-gray-300' : 'bg-blue-500'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-gray-900 truncate">{email.from_name || email.from_email || 'Unknown'}</span>
                <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{email.date ? new Date(email.date).toLocaleDateString() : ''}</span>
              </div>
              <div className="text-sm text-gray-800 font-medium truncate mt-0.5">{email.subject}</div>
              <div className="text-xs text-gray-500 truncate mt-1">{email.preview}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const EventListComponent = ({ events }: { events: any[] }) => {
  if (!events?.length) return <div className="text-gray-500 text-sm">No events found</div>
  return (
    <div className="space-y-2">
      {events.map((event: any, idx: number) => {
        const startTime = event.start ? new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
        const endTime = event.end ? new Date(event.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
        return (
          <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-50 rounded-lg flex flex-col items-center justify-center">
                <span className="text-xs font-bold text-blue-600">{event.start ? new Date(event.start).toLocaleDateString('en-US', { weekday: 'short' }) : ''}</span>
                <span className="text-lg font-bold text-blue-700">{event.start ? new Date(event.start).getDate() : ''}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-gray-900">{event.summary || event.title || 'Event'}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {startTime && endTime ? `${startTime} – ${endTime}` : 'All day'}
                </div>
                {event.location && (
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" />
                    {event.location}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const TaskListComponent = ({ tasks }: { tasks: any[] }) => {
  if (!tasks?.length) return <div className="text-gray-500 text-sm">No tasks found</div>
  return (
    <div className="space-y-1">
      {tasks.map((task: any) => (
        <div key={task.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-2.5">
          <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${task.completed ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
            {task.completed && <CheckCircle className="w-3.5 h-3.5 text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm ${task.completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{task.title}</div>
            {task.due && (
              <div className="text-xs text-gray-500 mt-0.5">Due: {new Date(task.due).toLocaleDateString()}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

const FileListComponent = ({ files }: { files: any[] }) => {
  if (!files?.length) return <div className="text-gray-500 text-sm">No files found</div>
  return (
    <div className="space-y-2">
      {files.map((file: any) => (
        <a
          key={file.id}
          href={file.webViewLink || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow hover:border-blue-300"
        >
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{file.name}</div>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
              <span>{file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : ''}</span>
              {file.size && <span>• {(file.size / 1024).toFixed(1)} KB</span>}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        </a>
      ))}
    </div>
  )
}

const MetricCardComponent = ({ label, value, unit }: { label: string; value: number | string; unit?: string }) => (
  <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-4 text-center">
    <div className="text-3xl font-bold text-blue-700">{value}{unit ? <span className="text-lg text-blue-500">{unit}</span> : ''}</div>
    <div className="text-sm text-gray-600 mt-1">{label}</div>
  </div>
)

const TextCardComponent = ({ title, text }: { title?: string; text: string }) => (
  <div className="bg-white border border-gray-200 rounded-lg p-3">
    {title && <div className="font-semibold text-sm text-gray-900 mb-1">{title}</div>}
    <div className="text-sm text-gray-700 whitespace-pre-wrap">{text}</div>
  </div>
)

const LinkListComponent = ({ links }: { links: any[] }) => (
  <div className="space-y-1">
    {links.map((link: any, idx: number) => (
      <a
        key={idx}
        href={link.url || link.href || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline py-1"
      >
        <ExternalLink className="w-3 h-3" />
        {link.title || link.label || link.url || 'Link'}
      </a>
    ))}
  </div>
)

// ─── New Rich Component Types ───

const EmailSummaryComponent = ({ unread_count, total, latest_from, latest_subject }: any) => (
  <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm flex items-center gap-3">
    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
      <Mail className="w-5 h-5 text-blue-500" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm text-gray-900">{unread_count || 0} unread</span>
        <span className="text-xs text-gray-500">of {total || 0} total</span>
      </div>
      {latest_from && (
        <div className="text-xs text-gray-500 truncate mt-0.5">Latest: {latest_subject || '(no subject)'} from {latest_from}</div>
      )}
    </div>
    {unread_count > 0 && (
      <span className="flex-shrink-0 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">{unread_count}</span>
    )}
  </div>
)

const EventSummaryComponent = ({ next_event, today_count, upcoming_count }: any) => (
  <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm flex items-center gap-3">
    <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
      <Calendar className="w-5 h-5 text-purple-500" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold text-gray-900">{today_count || 0} today, {upcoming_count || 0} upcoming</div>
      {next_event && (
        <div className="text-xs text-gray-500 truncate mt-0.5">Next: {next_event}</div>
      )}
    </div>
  </div>
)

const TaskSummaryComponent = ({ completed, total, overdue }: any) => (
  <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm flex items-center gap-3">
    <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
      <CheckSquare className="w-5 h-5 text-green-500" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold text-gray-900">{completed || 0} of {total || 0} done</div>
      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
        <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
      </div>
    </div>
    {overdue > 0 && (
      <span className="flex-shrink-0 text-xs text-red-500 font-medium">{overdue} overdue</span>
    )}
  </div>
)

const FileSummaryComponent = ({ recent_count, total_size }: any) => (
  <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm flex items-center gap-3">
    <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0">
      <HardDrive className="w-5 h-5 text-orange-500" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold text-gray-900">{recent_count || 0} recent files</div>
      {total_size && <div className="text-xs text-gray-500 mt-0.5">{total_size}</div>}
    </div>
  </div>
)

const ChartCardComponent = ({ title, data }: any) => {
  const max = Math.max(...(data?.map((d: any) => d.value) || [1]))
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
      {title && <div className="font-semibold text-sm text-gray-900 mb-2">{title}</div>}
      <div className="space-y-2">
        {data?.map((item: any, idx: number) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-20 truncate flex-shrink-0">{item.label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full flex items-center justify-end pr-1"
                style={{ width: `${(item.value / max) * 100}%` }}
              >
                <span className="text-[10px] text-white font-medium">{item.value}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const TableCardComponent = ({ title, headers, rows }: any) => (
  <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm overflow-hidden">
    {title && <div className="font-semibold text-sm text-gray-900 mb-2">{title}</div>}
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200">
            {headers?.map((h: string, i: number) => (
              <th key={i} className="text-left py-1 px-2 font-medium text-gray-600">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows?.map((row: any[], i: number) => (
            <tr key={i} className="border-b border-gray-100 last:border-0">
              {row?.map((cell: any, j: number) => (
                <td key={j} className="py-1 px-2 text-gray-700">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)

const StatusCardComponent = ({ status, message, detail }: any) => {
  const statusConfig: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
    success: { color: 'text-green-600', bg: 'bg-green-50', icon: <CheckCircle className="w-5 h-5" /> },
    warning: { color: 'text-yellow-600', bg: 'bg-yellow-50', icon: <AlertTriangle className="w-5 h-5" /> },
    error: { color: 'text-red-600', bg: 'bg-red-50', icon: <AlertTriangle className="w-5 h-5" /> },
    info: { color: 'text-blue-600', bg: 'bg-blue-50', icon: <Info className="w-5 h-5" /> },
  }
  const config = statusConfig[status] || statusConfig.info
  return (
    <div className={`${config.bg} border border-gray-200 rounded-lg p-3 flex items-center gap-3`}>
      <div className={`${config.color} flex-shrink-0`}>{config.icon}</div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${config.color}`}>{message || status}</div>
        {detail && <div className="text-xs text-gray-500 mt-0.5">{detail}</div>}
      </div>
    </div>
  )
}

const NotificationCardComponent = ({ title, message, time, type = 'info' }: any) => {
  const typeColors: Record<string, string> = {
    info: 'border-blue-200 bg-blue-50',
    success: 'border-green-200 bg-green-50',
    warning: 'border-yellow-200 bg-yellow-50',
    error: 'border-red-200 bg-red-50',
  }
  return (
    <div className={`${typeColors[type] || typeColors.info} border rounded-lg p-3 flex items-start gap-3`}>
      <Bell className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        <div className="text-xs text-gray-600 mt-0.5">{message}</div>
        {time && <div className="text-[10px] text-gray-400 mt-1">{time}</div>}
      </div>
    </div>
  )
}

const TrendComponent = ({ label, value, previous, unit }: any) => {
  const diff = value - (previous || 0)
  const isUp = diff > 0
  const isDown = diff < 0
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm flex items-center gap-3">
      <div className="flex-1">
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-lg font-bold text-gray-900">
          {value}{unit ? <span className="text-sm text-gray-500">{unit}</span> : ''}
        </div>
      </div>
      <div className={`flex items-center gap-1 text-sm font-medium ${isUp ? 'text-green-600' : isDown ? 'text-red-600' : 'text-gray-500'}`}>
        {isUp ? <ArrowUpRight className="w-4 h-4" /> : isDown ? <ArrowDownRight className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
        {diff !== 0 ? Math.abs(diff) : '—'}
      </div>
    </div>
  )
}

const ComponentGrid = ({ components, columns = 2 }: { components: A2UIComponent[]; columns?: number }) => {
  if (!components?.length) return null
  return (
    <div className={`grid gap-2 mt-2`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {components.map((comp, idx) => (
        <div key={idx} className="min-w-0">
          <A2UIRenderer components={[comp]} />
        </div>
      ))}
    </div>
  )
}

const A2UIRenderer = ({ components }: { components: A2UIComponent[] }) => {
  if (!components?.length) return null
  return (
    <div className="space-y-3 mt-3">
      {components.map((comp, idx) => {
        switch (comp.type) {
          case 'email_list':
            return <EmailListComponent key={idx} emails={comp.emails} />
          case 'event_list':
            return <EventListComponent key={idx} events={comp.events} />
          case 'task_list':
            return <TaskListComponent key={idx} tasks={comp.tasks} />
          case 'file_list':
            return <FileListComponent key={idx} files={comp.files} />
          case 'metric_card':
            return <MetricCardComponent key={idx} label={comp.label} value={comp.value} unit={comp.unit} />
          case 'text_card':
            return <TextCardComponent key={idx} title={comp.title} text={comp.text} />
          case 'link_list':
            return <LinkListComponent key={idx} links={comp.links} />
          case 'email_summary':
            return <EmailSummaryComponent key={idx} {...comp} />
          case 'event_summary':
            return <EventSummaryComponent key={idx} {...comp} />
          case 'task_summary':
            return <TaskSummaryComponent key={idx} {...comp} />
          case 'file_summary':
            return <FileSummaryComponent key={idx} {...comp} />
          case 'chart_card':
            return <ChartCardComponent key={idx} {...comp} />
          case 'table_card':
            return <TableCardComponent key={idx} {...comp} />
          case 'status_card':
            return <StatusCardComponent key={idx} {...comp} />
          case 'notification_card':
            return <NotificationCardComponent key={idx} {...comp} />
          case 'trend':
            return <TrendComponent key={idx} {...comp} />
          case 'component_grid':
            return <ComponentGrid key={idx} components={comp.components} columns={comp.columns} />
          default:
            return null
        }
      })}
    </div>
  )
}

// ─── Main Chat Widget ───

const AIChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE])
  const [sessionId, setSessionId] = useState<string | undefined>(undefined)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const addWidget = useLayoutStore((s) => s.addWidget)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    const loadingId = `loading-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: loadingId, role: 'assistant', content: '', isLoading: true },
    ])

    try {
      const response = (await apiClient.sendChatMessage(userMessage.content, sessionId)) as any

      setMessages((prev) =>
        prev
          .filter((m) => m.id !== loadingId)
          .concat({
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: response?.content || 'I processed your request.',
            components: response?.components,
            sources: response?.sources,
          })
      )

      if (response?.session_id && response.session_id !== sessionId) {
        setSessionId(response.session_id)
      }

      if (response?.component) {
        addWidget({
          type: response.component.type,
          title: response.component.title,
          category: response.component.category,
          prompt: response.component.prompt,
        })
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== loadingId)
          .concat({
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: `Sorry, I encountered an error: ${err.message || 'Unknown error'}`,
          })
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = async () => {
    if (sessionId) {
      try {
        await apiClient.clearChatSession(sessionId)
      } catch (e) {
        console.warn('Failed to clear session:', e)
      }
    }
    setMessages([WELCOME_MESSAGE])
  }

  const handleNewSession = async () => {
    try {
      const res = await apiClient.newChatSession(sessionId) as any
      if (res?.session_id) {
        setSessionId(res.session_id)
      }
    } catch (e) {
      console.warn('Failed to create new session:', e)
    }
    setMessages([WELCOME_MESSAGE])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
      >
        <MessageSquare className="w-6 h-6" />
      </button>
    )
  }

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 bg-gray-50 rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden transition-all duration-300 ${
        isMinimized ? 'w-72 h-14' : 'w-[420px] h-[600px]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          <span className="font-semibold text-sm">AI Assistant</span>
          {sessionId && (
            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full text-white/80">
              #{sessionId}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {!isMinimized && (
            <>
              <button
                onClick={handleClear}
                title="Clear chat"
                className="p-1.5 rounded hover:bg-white/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleNewSession}
                title="New session"
                className="p-1.5 rounded hover:bg-white/20 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 rounded hover:bg-white/20 transition-colors"
          >
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[95%] rounded-2xl px-4 py-3 text-sm ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white rounded-br-sm'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
                  }`}
                >
                  {message.isLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-gray-500">Thinking...</span>
                    </div>
                  ) : (
                    <>
                      <div className="whitespace-pre-wrap">{message.content}</div>
                      {message.components && message.components.length > 0 && (
                        <A2UIRenderer components={message.components} />
                      )}
                    </>
                  )}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200/50">
                      <div className="text-xs text-gray-500 mb-1">Sources:</div>
                      {message.sources.map((source, idx) => (
                        <a
                          key={idx}
                          href={source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs text-blue-500 hover:underline truncate"
                        >
                          {source}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 p-3 bg-white">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="p-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default AIChatWidget
