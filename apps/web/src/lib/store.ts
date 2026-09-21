import { create } from "zustand";
import { api, setCsrfToken, type Snapshot } from "./api";

type DataState = {
  snapshot: Snapshot | null;
  error: string | null;
  loading: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
};

export const useStudioData = create<DataState>((set, get) => ({
  snapshot: null,
  error: null,
  loading: false,
  load: async () => {
    if (get().snapshot || get().loading) return;
    set({ loading: true, error: null });
    try {
      const snapshot = await api.bootstrap();
      if (snapshot.csrfToken) setCsrfToken(snapshot.csrfToken);
      set({ snapshot, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "load-failed", loading: false });
    }
  },
  refresh: async () => {
    const snapshot = await api.bootstrap();
    if (snapshot.csrfToken) setCsrfToken(snapshot.csrfToken);
    set({ snapshot, error: null });
  },
}));
