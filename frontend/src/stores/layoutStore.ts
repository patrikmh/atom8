import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  WidgetConfig,
  LayoutItem,
  DEFAULT_LAYOUT,
  DEFAULT_WIDGET_STYLE,
  DEFAULT_CANVAS_BACKGROUND,
  COMPONENT_LIBRARY_ITEMS,
  Category,
  ThemeConfig,
  PREBUILT_THEMES,
  DEFAULT_THEME,
} from '@/types';

interface LayoutState {
  widgets: WidgetConfig[];
  background: typeof DEFAULT_CANVAS_BACKGROUND;
  sidebarOpen: boolean;
  searchQuery: string;
  selectedCategory: Category | 'All';
  activeDrags: Set<string>;

  // New widget animation tracking
  newWidgetIds: Set<string>;
  clearNewWidget: (id: string) => void;

  // Theme
  theme: ThemeConfig;
  setTheme: (theme: ThemeConfig) => void;
  setThemeByName: (name: string) => void;

  // AI Designer Mode
  designerMode: 'disabled' | 'suggest' | 'auto' | 'full';
  setDesignerMode: (mode: 'disabled' | 'suggest' | 'auto' | 'full') => void;

  // Undo/Redo
  undoStack: LayoutSnapshot[];
  redoStack: LayoutSnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  pushSnapshot: () => void;

  // AI Suggestions
  pendingSuggestion: AILayoutSuggestion | null;
  setPendingSuggestion: (suggestion: AILayoutSuggestion | null) => void;
  applySuggestion: () => void;
  rejectSuggestion: () => void;

  // Actions
  addWidget: (widget: Omit<WidgetConfig, 'id' | 'layout' | 'style'>, position?: Partial<WidgetConfig['layout']>) => string;
  removeWidget: (id: string) => void;
  updateLayout: (layout: LayoutItem[]) => void;
  updateWidgetStyle: (id: string, style: Partial<WidgetConfig['style']>) => void;
  updateWidgetPrompt: (id: string, prompt: string) => void;
  updateWidgetTitle: (id: string, title: string) => void;
  setWidgetRefreshInterval: (id: string, interval: number | undefined) => void;
  setWidgetLoading: (id: string, isLoading: boolean) => void;
  setWidgetError: (id: string, error: string | null) => void;
  setWidgetData: (id: string, data: unknown) => void;
  setBackground: (background: Partial<typeof DEFAULT_CANVAS_BACKGROUND>) => void;
  toggleSidebar: () => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: Category | 'All') => void;
  refreshWidget: (id: string) => void;
  refreshTriggers: Record<string, number>;
  triggerRefresh: (id: string) => void;
  resetLayout: () => void;
}

interface LayoutSnapshot {
  widgets: WidgetConfig[];
  background: typeof DEFAULT_CANVAS_BACKGROUND;
  timestamp: number;
}

export interface AILayoutSuggestion {
  id: string;
  description: string;
  changes: WidgetChange[];
  timestamp: number;
}

interface WidgetChange {
  widgetId: string;
  type: 'move' | 'resize' | 'add' | 'remove';
  from: any;
  to: any;
}

const STORAGE_KEY = 'living-canvas-layout';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const cloneState = (widgets: WidgetConfig[], background: typeof DEFAULT_CANVAS_BACKGROUND): LayoutSnapshot => ({
  widgets: JSON.parse(JSON.stringify(widgets)),
  background: JSON.parse(JSON.stringify(background)),
  timestamp: Date.now(),
});

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      widgets: DEFAULT_LAYOUT,
      background: DEFAULT_CANVAS_BACKGROUND,
      sidebarOpen: true,
      searchQuery: '',
      selectedCategory: 'All',
      activeDrags: new Set(),
      newWidgetIds: new Set(),
      clearNewWidget: (id) => {
        set((s) => {
          const next = new Set(s.newWidgetIds);
          next.delete(id);
          return { newWidgetIds: next };
        });
      },

      // Theme
      theme: DEFAULT_THEME,
      setTheme: (theme) => set({ theme }),
      setThemeByName: (name) => {
        const theme = PREBUILT_THEMES.find((t) => t.name === name) || DEFAULT_THEME;
        set({ theme });
      },

      // AI Designer Mode
      designerMode: 'disabled',
      setDesignerMode: (mode) => {
        set({ designerMode: mode });
      },

      // Undo/Redo
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,

      pushSnapshot: () => {
        const state = get();
        const snapshot = cloneState(state.widgets, state.background);
        set((state) => ({
          undoStack: [...state.undoStack.slice(-19), snapshot],
          redoStack: [],
          canUndo: true,
          canRedo: false,
        }));
      },

      undo: () => {
        const state = get();
        if (state.undoStack.length === 0) return;
        const current = cloneState(state.widgets, state.background);
        const previous = state.undoStack[state.undoStack.length - 1];
        set({
          widgets: previous.widgets,
          background: previous.background,
          undoStack: state.undoStack.slice(0, -1),
          redoStack: [...state.redoStack, current],
          canUndo: state.undoStack.length > 1,
          canRedo: true,
        });
      },

      redo: () => {
        const state = get();
        if (state.redoStack.length === 0) return;
        const current = cloneState(state.widgets, state.background);
        const next = state.redoStack[state.redoStack.length - 1];
        set({
          widgets: next.widgets,
          background: next.background,
          undoStack: [...state.undoStack, current],
          redoStack: state.redoStack.slice(0, -1),
          canUndo: true,
          canRedo: state.redoStack.length > 1,
        });
      },

      // AI Suggestions
      pendingSuggestion: null,
      setPendingSuggestion: (suggestion) => set({ pendingSuggestion: suggestion }),

      applySuggestion: () => {
        const state = get();
        if (!state.pendingSuggestion) return;
        state.pushSnapshot();
        const changes = state.pendingSuggestion.changes;
        set((s) => {
          let newWidgets = [...s.widgets];
          for (const change of changes) {
            if (change.type === 'move' || change.type === 'resize') {
              newWidgets = newWidgets.map((w) =>
                w.id === change.widgetId
                  ? { ...w, layout: { ...w.layout, ...change.to } }
                  : w
              );
            } else if (change.type === 'add') {
              newWidgets.push(change.to);
            } else if (change.type === 'remove') {
              newWidgets = newWidgets.filter((w) => w.id !== change.widgetId);
            }
          }
          return {
            widgets: newWidgets,
            pendingSuggestion: null,
          };
        });
      },

      rejectSuggestion: () => {
        set({ pendingSuggestion: null });
      },

      addWidget: (widgetConfig, position) => {
        const state = get();
        state.pushSnapshot();
        const id = generateId();
        const maxY = Math.max(0, ...state.widgets.map((w) => w.layout.y + w.layout.h));
        const newWidget: WidgetConfig = {
          ...widgetConfig,
          id,
          layout: {
            i: id,
            x: position?.x ?? 0,
            y: position?.y ?? maxY,
            w: position?.w ?? 4,
            h: position?.h ?? 3,
            static: false,
          },
          style: { ...DEFAULT_WIDGET_STYLE },
          data: null,
          isLoading: false,
          error: null,
        };
        set((s) => ({
          widgets: [...s.widgets, newWidget],
          newWidgetIds: new Set(s.newWidgetIds).add(id),
        }));
        return id;
      },

      removeWidget: (id) => {
        const state = get();
        state.pushSnapshot();
        set((s) => ({
          widgets: s.widgets.filter((w) => w.id !== id),
        }));
      },

      updateLayout: (layout) => {
        set((state) => {
          const layoutMap = new Map(layout.map((l) => [l.i, l]));
          return {
            widgets: state.widgets.map((w) => {
              const newLayout = layoutMap.get(w.id);
              return newLayout ? { ...w, layout: newLayout } : w;
            }),
          };
        });
      },

      updateWidgetStyle: (id, style) => {
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, style: { ...w.style, ...style } } : w
          ),
        }));
      },

      updateWidgetPrompt: (id, prompt) => {
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, prompt } : w
          ),
        }));
      },

      updateWidgetTitle: (id, title) => {
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, title } : w
          ),
        }));
      },

      setWidgetRefreshInterval: (id, interval) => {
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, refreshInterval: interval } : w
          ),
        }));
      },

      setWidgetLoading: (id, isLoading) => {
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, isLoading } : w
          ),
        }));
      },

      setWidgetError: (id, error) => {
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, error } : w
          ),
        }));
      },

      setWidgetData: (id, data) => {
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, data } : w
          ),
        }));
      },

      setBackground: (background) => {
        set((state) => ({
          background: { ...state.background, ...background },
        }));
      },

      toggleSidebar: () => {
        set((state) => ({ sidebarOpen: !state.sidebarOpen }));
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },

      setSelectedCategory: (category) => {
        set({ selectedCategory: category });
      },

      refreshTriggers: {},
      triggerRefresh: (id) => {
        set((state) => ({
          refreshTriggers: { ...state.refreshTriggers, [id]: (state.refreshTriggers[id] || 0) + 1 },
        }));
      },
      refreshWidget: (id) => {
        // Mark as loading and clear error; actual fetching is done by each widget's useEffect
        // triggered by the refreshTrigger increment below.
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, isLoading: true, error: null } : w
          ),
        }));
        get().triggerRefresh(id);
      },

      resetLayout: () => {
        const state = get();
        state.pushSnapshot();
        set({
          widgets: DEFAULT_LAYOUT,
          background: DEFAULT_CANVAS_BACKGROUND,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        widgets: state.widgets,
        background: state.background,
        designerMode: state.designerMode,
        theme: state.theme,
      }),
    }
  )
);

export const getFilteredComponents = (
  searchQuery: string,
  selectedCategory: Category | 'All'
) => {
  return COMPONENT_LIBRARY_ITEMS.filter((item) => {
    const matchesSearch =
      !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === 'All' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
};

export const getCategoryIcon = (category: Category) => {
  const icons: Record<Category, string> = {
    Gmail: 'Mail',
    Calendar: 'Calendar',
    Tasks: 'CheckSquare',
    Drive: 'HardDrive',
    Docs: 'FileText',
    Notion: 'BookOpen',
    AI: 'Sparkles',
    Custom: 'Puzzle',
    Markdown: 'FileText',
  };
  return icons[category] || 'Puzzle';
};

export const categories: Category[] = ['Gmail', 'Calendar', 'Tasks', 'Drive', 'Docs', 'Notion', 'AI', 'Markdown', 'Custom'];
