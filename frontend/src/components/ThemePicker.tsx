import { useLayoutStore } from '@/stores/layoutStore'
import { PREBUILT_THEMES } from '@/types'
import { Check } from 'lucide-react'

const ThemePicker = () => {
  const theme = useLayoutStore((s) => s.theme)
  const setThemeByName = useLayoutStore((s) => s.setThemeByName)

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap gap-1.5">
        {PREBUILT_THEMES.map((t) => (
          <button
            key={t.name}
            onClick={() => setThemeByName(t.name)}
            className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              theme.name === t.name
                ? 'shadow-sm'
                : 'hover:opacity-80'
            }`}
            style={
              theme.name === t.name
                ? {
                    borderColor: theme.accentColor,
                    backgroundColor: theme.accentColor + '22',
                    color: theme.accentColor,
                  }
                : {
                    borderColor: theme.widgetBorder,
                    backgroundColor: theme.widgetBg,
                    color: theme.sidebarText,
                  }
            }
            title={t.name}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: t.accentColor, border: `1px solid ${theme.widgetBorder}` }}
            />
            {t.name}
            {theme.name === t.name && (
              <Check className="w-3 h-3" style={{ color: theme.accentColor }} />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export default ThemePicker
