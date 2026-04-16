import { create } from 'zustand';
import { isSortMode, loadLayout, patchLayout, type SortMode } from '@/lib/ui/layout-storage';

export type { SortMode };

interface UiState {
  selectedProjectSlug: string | null;
  selectedSessionId: string | null;
  search: string;
  terminalOpen: boolean;
  terminalCwd: string | null;
  editorOpen: boolean;
  sortMode: SortMode;
  setSelectedProject: (slug: string | null) => void;
  setSelectedSession: (id: string | null) => void;
  setSearch: (q: string) => void;
  openTerminal: (cwd: string) => void;
  closeTerminal: () => void;
  openEditor: () => void;
  closeEditor: () => void;
  setSortMode: (mode: SortMode) => void;
}

const DEFAULT_SORT: SortMode = 'activity';

function initialSortMode(): SortMode {
  if (typeof window === 'undefined') return DEFAULT_SORT;
  const stored = loadLayout().sortMode;
  return isSortMode(stored) ? stored : DEFAULT_SORT;
}

export const useUiStore = create<UiState>((set) => ({
  selectedProjectSlug: null,
  selectedSessionId: null,
  search: '',
  terminalOpen: false,
  terminalCwd: null,
  editorOpen: false,
  sortMode: initialSortMode(),
  setSelectedProject: (slug) =>
    set(() => ({
      selectedProjectSlug: slug,
      selectedSessionId: null,
      terminalOpen: false,
      editorOpen: false,
    })),
  setSelectedSession: (id) => set({ selectedSessionId: id }),
  setSearch: (q) => set({ search: q }),
  openTerminal: (cwd) => set({ terminalOpen: true, terminalCwd: cwd, editorOpen: false }),
  closeTerminal: () => set({ terminalOpen: false, terminalCwd: null }),
  openEditor: () => set({ editorOpen: true, terminalOpen: false }),
  closeEditor: () => set({ editorOpen: false }),
  setSortMode: (mode) => {
    patchLayout({ sortMode: mode });
    set({ sortMode: mode });
  },
}));
