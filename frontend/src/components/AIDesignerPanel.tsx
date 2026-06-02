import { useState } from 'react'
import { useLayoutStore, AILayoutSuggestion } from '@/stores/layoutStore'
import { apiClient } from '@/services/api'
import {
  Wand2,
  Undo2,
  Redo2,
  Check,
  X,
  AlertTriangle,
  Move,
  Plus,
  Trash2,
  Maximize2,
  Eye,
  EyeOff,
  Bot,
  Sparkles,
} from 'lucide-react'

const AIDesignerPanel = () => {
  const designerMode = useLayoutStore((s) => s.designerMode)
  const setDesignerMode = useLayoutStore((s) => s.setDesignerMode)
  const pendingSuggestion = useLayoutStore((s) => s.pendingSuggestion)
  const setPendingSuggestion = useLayoutStore((s) => s.setPendingSuggestion)
  const applySuggestion = useLayoutStore((s) => s.applySuggestion)
  const rejectSuggestion = useLayoutStore((s) => s.rejectSuggestion)
  const undo = useLayoutStore((s) => s.undo)
  const redo = useLayoutStore((s) => s.redo)
  const canUndo = useLayoutStore((s) => s.canUndo)
  const canRedo = useLayoutStore((s) => s.canRedo)
  const widgets = useLayoutStore((s) => s.widgets)
  const pushSnapshot = useLayoutStore((s) => s.pushSnapshot)
  const [isLoading, setIsLoading] = useState(false)

  const getModeDescription = (mode: string) => {
    switch (mode) {
      case 'suggest':
        return 'AI proposes changes, you approve each one'
      case 'auto':
        return 'AI applies changes automatically, you can undo'
      case 'full':
        return 'AI can freely rearrange and modify your dashboard'
      default:
        return 'AI Designer Mode is off'
    }
  }

  const requestSuggestion = async () => {
    if (designerMode === 'disabled') return
    setIsLoading(true)
    try {
      const response = (await apiClient.designSuggestion({
        layout: widgets.map((w) => ({ id: w.id, type: w.type, layout: w.layout })),
      })) as any

      const suggestion: AILayoutSuggestion = {
        id: `suggestion-${Date.now()}`,
        description: response?.suggestion?.description || 'AI suggested layout changes',
        changes: (response?.suggestion?.changes || []).map((c: any) => ({
          widgetId: c.widget_id,
          type: c.new_x !== undefined ? 'move' : 'resize',
          from: { x: c.x, y: c.y },
          to: { x: c.new_x, y: c.new_y },
        })),
        timestamp: Date.now(),
      }

      if (designerMode === 'auto') {
        // Auto-apply: push snapshot, apply, notify
        pushSnapshot()
        applySuggestion()
      } else {
        // Suggest or Full: set pending
        setPendingSuggestion(suggestion)
      }
    } catch (err: any) {
      console.error('AI Designer error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAutoOptimize = async () => {
    if (designerMode === 'disabled') {
      setDesignerMode('auto')
    }
    await requestSuggestion()
  }

  return (
    <div className="flex flex-col gap-2 p-3 bg-gradient-to-br from-purple-50 to-blue-50 border-b border-purple-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-purple-600" />
          <span className="font-semibold text-sm text-purple-900">AI Designer</span>
        </div>
        <div className="flex items-center gap-1">
          {canUndo && (
            <button
              onClick={undo}
              className="p-1.5 rounded-lg bg-white hover:bg-purple-50 text-purple-600 shadow-sm border border-purple-100 transition-colors"
              title="Undo"
            >
              <Undo2 className="w-4 h-4" />
            </button>
          )}
          {canRedo && (
            <button
              onClick={redo}
              className="p-1.5 rounded-lg bg-white hover:bg-purple-50 text-purple-600 shadow-sm border border-purple-100 transition-colors"
              title="Redo"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Mode Selector */}
      <div className="grid grid-cols-2 gap-1.5">
        {(
          [
            { value: 'disabled', icon: EyeOff, label: 'Off' },
            { value: 'suggest', icon: Eye, label: 'Suggest' },
            { value: 'auto', icon: Wand2, label: 'Auto' },
            { value: 'full', icon: Sparkles, label: 'Full' },
          ] as const
        ).map((mode) => {
          const Icon = mode.icon
          const isActive = designerMode === mode.value
          return (
            <button
              key={mode.value}
              onClick={() => setDesignerMode(mode.value)}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-white text-purple-700 hover:bg-purple-50 border border-purple-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {mode.label}
            </button>
          )
        })}
      </div>

      {/* Mode Description */}
      <p className="text-xs text-purple-600/70">{getModeDescription(designerMode)}</p>

      {/* Quick Actions */}
      {designerMode !== 'disabled' && (
        <div className="flex gap-2">
          <button
            onClick={handleAutoOptimize}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-medium hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 transition-all shadow-sm"
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Thinking...
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" />
                Auto-Optimize
              </>
            )}
          </button>
        </div>
      )}

      {/* Pending Suggestion */}
      {pendingSuggestion && designerMode === 'suggest' && (
        <div className="mt-1 p-3 bg-white rounded-xl border border-purple-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-gray-800">AI Suggestion</span>
          </div>
          <p className="text-xs text-gray-600 mb-3">{pendingSuggestion.description}</p>
          <div className="space-y-1.5 mb-3">
            {pendingSuggestion.changes.map((change, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-xs bg-gray-50 px-2 py-1.5 rounded-lg"
              >
                {change.type === 'move' && <Move className="w-3.5 h-3.5 text-blue-500" />}
                {change.type === 'resize' && <Maximize2 className="w-3.5 h-3.5 text-green-500" />}
                {change.type === 'add' && <Plus className="w-3.5 h-3.5 text-purple-500" />}
                {change.type === 'remove' && <Trash2 className="w-3.5 h-3.5 text-red-500" />}
                <span className="text-gray-700">
                  {change.type === 'move' && `Move widget to (${change.to.x}, ${change.to.y})`}
                  {change.type === 'resize' && `Resize widget to ${change.to.w}x${change.to.h}`}
                  {change.type === 'add' && `Add ${change.to.type} widget`}
                  {change.type === 'remove' && `Remove widget`}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={applySuggestion}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Apply
            </button>
            <button
              onClick={rejectSuggestion}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AIDesignerPanel
