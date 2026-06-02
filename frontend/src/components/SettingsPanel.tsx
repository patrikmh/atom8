import { useState, useRef, useEffect } from 'react'
import { useLayoutStore } from '@/stores/layoutStore'
import { PREBUILT_THEMES, CanvasBackground } from '@/types'
import { Settings, Undo2, Redo2, RotateCcw, Palette, X, Check, Link, Unlink, RefreshCw } from 'lucide-react'
import { apiClient } from '@/services/api'

const SettingsPanel = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [authStatus, setAuthStatus] = useState<{ authenticated: boolean; has_token: boolean; is_expired?: boolean } | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const theme = useLayoutStore((s) => s.theme)
  const setThemeByName = useLayoutStore((s) => s.setThemeByName)
  const background = useLayoutStore((s) => s.background)
  const setBackground = useLayoutStore((s) => s.setBackground)
  const undo = useLayoutStore((s) => s.undo)
  const redo = useLayoutStore((s) => s.redo)
  const canUndo = useLayoutStore((s) => s.canUndo)
  const canRedo = useLayoutStore((s) => s.canRedo)
  const resetLayout = useLayoutStore((s) => s.resetLayout)
  const refreshTriggers = useLayoutStore((s) => s.refreshTriggers)
  const triggerRefresh = useLayoutStore((s) => s.triggerRefresh)

  const fetchAuthStatus = async () => {
    try {
      const status = await apiClient.getAuthStatus()
      setAuthStatus(status)
    } catch (e) {
      setAuthStatus({ authenticated: false, has_token: false })
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchAuthStatus()
    }
  }, [isOpen])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const bgModes: CanvasBackground['mode'][] = ['plain', 'grid', 'dark', 'image']

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-lg shadow-md p-2 backdrop-blur-sm transition-colors hover:opacity-90"
        style={{ backgroundColor: theme.headerBg + 'ee', color: theme.sidebarText }}
        title="Settings"
      >
        {isOpen ? <X className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div
          className="absolute top-10 right-0 z-20 rounded-xl shadow-xl border min-w-[220px] overflow-hidden"
          style={{ backgroundColor: theme.widgetBg, borderColor: theme.widgetBorder }}
        >
          {/* Background */}
          <div className="p-3 border-b" style={{ borderColor: theme.widgetBorder + '44' }}>
            <div className="flex items-center gap-2 mb-2">
              <Palette className="w-3.5 h-3.5" style={{ color: theme.accentColor }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.sidebarText + 'aa' }}>
                Background
              </span>
            </div>
            <div className="flex gap-1.5">
              {bgModes.map((mode) => (
                <button
                  key={mode}
                  onClick={() => setBackground({ mode })}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex-1 ${
                    background.mode === mode ? 'text-white' : 'hover:opacity-80'
                  }`}
                  style={
                    background.mode === mode
                      ? { backgroundColor: theme.accentColor }
                      : { backgroundColor: theme.widgetBorder + '44', color: theme.sidebarText }
                  }
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Theme */}
          <div className="p-3 border-b" style={{ borderColor: theme.widgetBorder + '44' }}>
            <div className="flex items-center gap-2 mb-2">
              <Palette className="w-3.5 h-3.5" style={{ color: theme.accentColor }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.sidebarText + 'aa' }}>
                Theme
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PREBUILT_THEMES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setThemeByName(t.name)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all border ${
                    theme.name === t.name ? 'shadow-sm' : 'hover:opacity-80'
                  }`}
                  style={
                    theme.name === t.name
                      ? { borderColor: theme.accentColor, backgroundColor: theme.accentColor + '22', color: theme.accentColor }
                      : { borderColor: theme.widgetBorder, backgroundColor: theme.widgetBg, color: theme.sidebarText }
                  }
                  title={t.name}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: t.accentColor }}
                  />
                  {t.name}
                  {theme.name === t.name && <Check className="w-3 h-3" />}
                </button>
              ))}
            </div>
          </div>

          {/* Auth */}
          <div className="p-3 border-b" style={{ borderColor: theme.widgetBorder + '44' }}>
            <div className="flex items-center gap-2 mb-2">
              <Link className="w-3.5 h-3.5" style={{ color: theme.accentColor }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.sidebarText + 'aa' }}>
                Google Account
              </span>
            </div>
            <div className="space-y-2">
              {authStatus === null ? (
                <div className="text-xs text-gray-400">Loading...</div>
              ) : authStatus.authenticated ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs text-green-600 font-medium">Connected</span>
                  <button
                    onClick={async () => {
                      if (confirm('Disconnect Google account?')) {
                        await apiClient.clearAuth()
                        fetchAuthStatus()
                        // Refresh all widgets to show mock data
                        Object.keys(refreshTriggers).forEach(triggerRefresh)
                      }
                    }}
                    className="ml-auto p-1 rounded hover:opacity-70 transition-opacity"
                    style={{ color: '#ef4444' }}
                    title="Disconnect"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-400" />
                    <span className="text-xs text-red-500 font-medium">
                      {authStatus.is_expired ? 'Session expired' : 'Not connected'}
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      setAuthLoading(true)
                      try {
                        const { url } = await apiClient.getAuthUrl()
                        window.open(url, '_blank')
                      } catch (e) {
                        alert('Failed to get auth URL')
                      } finally {
                        setAuthLoading(false)
                      }
                    }}
                    disabled={authLoading}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
                    style={{ backgroundColor: theme.accentColor, color: '#ffffff' }}
                  >
                    {authLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Link className="w-3.5 h-3.5" />}
                    Connect Google
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-3.5 h-3.5" style={{ color: theme.accentColor }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.sidebarText + 'aa' }}>
                Actions
              </span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={undo}
                disabled={!canUndo}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex-1 disabled:opacity-40"
                style={{ backgroundColor: theme.widgetBorder + '44', color: theme.sidebarText }}
                title="Undo"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Undo
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex-1 disabled:opacity-40"
                style={{ backgroundColor: theme.widgetBorder + '44', color: theme.sidebarText }}
                title="Redo"
              >
                <Redo2 className="w-3.5 h-3.5" />
                Redo
              </button>
              <button
                onClick={() => {
                  if (confirm('Reset layout to default?')) resetLayout()
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
                style={{ backgroundColor: '#ef4444' + '22', color: '#ef4444' }}
                title="Reset layout"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SettingsPanel
