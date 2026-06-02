import { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Loader2, Sparkles, Minimize2, Maximize2, Trash2, Plus, CheckCircle, FileText, ExternalLink, ChevronRight } from 'lucide-react'
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
