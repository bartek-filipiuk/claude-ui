import { create } from 'zustand';

interface UiState {
  selectedProjectSlug: string | null;
  selectedSessionId: string | null;
  search: string;
  setSelectedProject: (slug: string | null) => void;
  setSelectedSession: (id: string | null) => void;
  setSearch: (q: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedProjectSlug: null,
  selectedSessionId: null,
  search: '',
  setSelectedProject: (slug) =>
    set(() => ({
      selectedProjectSlug: slug,
      selectedSessionId: null,
    })),
  setSelectedSession: (id) => set({ selectedSessionId: id }),
  setSearch: (q) => set({ search: q }),
}));
