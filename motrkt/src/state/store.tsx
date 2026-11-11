import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Holding, PriceAlert } from "../data/types";
import { DEFAULT_VARIANT_ID, hiddenVariantIds, resolveVariantId, variantById } from "../data/db";

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; source?: "claude" | "local" };
export type Toast = { id: string; message: string; tone: "info" | "success" | "error" };

type Persisted = {
  watchlist: string[];
  alerts: PriceAlert[];
  portfolio: Holding[];
  savedListings: string[];
  readNotifications: string[];
  lastVariantId: string;
  chat: ChatMessage[];
};

const STORAGE_KEY = "mip:v1";
export const DEFAULT_STATE: Persisted = {
  watchlist: [],
  alerts: [],
  portfolio: [],
  savedListings: [],
  readNotifications: [],
  lastVariantId: DEFAULT_VARIANT_ID,
  chat: [],
};

type HiddenItems = Pick<Persisted, "watchlist" | "portfolio" | "alerts">;

/**
 * Split stored data into what the current catalog shows and items of brands switched off in src/config.ts.
 * Hidden items are written back unchanged on every save, so nothing is lost when a brand is re-enabled.
 */
function partition(stored: Persisted): { visible: Persisted; hidden: HiddenItems } {
  // Former variants (e.g. GT3 Touring) live on as an option of another variant.
  const state: Persisted = {
    ...stored,
    watchlist: [...new Set(stored.watchlist.map(resolveVariantId))],
    portfolio: stored.portfolio.map((h) => ({ ...h, variantId: resolveVariantId(h.variantId) })),
    alerts: stored.alerts.map((a) => ({ ...a, variantId: resolveVariantId(a.variantId) })),
    lastVariantId: resolveVariantId(stored.lastVariantId),
  };
  const visible = { ...state };
  const hidden: HiddenItems = { watchlist: [], portfolio: [], alerts: [] };
  visible.watchlist = state.watchlist.filter((id) => (hiddenVariantIds.has(id) ? !hidden.watchlist.push(id) : variantById.has(id)));
  visible.portfolio = state.portfolio.filter((h) => (hiddenVariantIds.has(h.variantId) ? !hidden.portfolio.push(h) : variantById.has(h.variantId)));
  visible.alerts = state.alerts.filter((a) => (hiddenVariantIds.has(a.variantId) ? !hidden.alerts.push(a) : variantById.has(a.variantId)));
  if (!variantById.has(visible.lastVariantId)) visible.lastVariantId = DEFAULT_VARIANT_ID;
  return { visible, hidden };
}

let hiddenItems: HiddenItems = { watchlist: [], portfolio: [], alerts: [] };

function load(): Persisted {
  let stored: Persisted = DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) stored = { ...DEFAULT_STATE, ...JSON.parse(raw) } as Persisted;
  } catch {
    /* corrupt or unavailable storage – start empty */
  }
  const { visible, hidden } = partition(stored);
  hiddenItems = hidden;
  return visible;
}

const uid = () => Math.random().toString(36).slice(2, 10);

function useStoreValue() {
  const [state, setState] = useState<Persisted>(load);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...state,
          watchlist: [...state.watchlist, ...hiddenItems.watchlist],
          portfolio: [...state.portfolio, ...hiddenItems.portfolio],
          alerts: [...state.alerts, ...hiddenItems.alerts],
        }),
      );
    } catch {
      /* storage full or unavailable – keep working in memory */
    }
  }, [state]);

  const toast = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = uid();
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    timers.current.set(id, window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200));
  }, []);
  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const actions = useMemo(
    () => ({
      toggleWatch(variantId: string) {
        setState((s) => ({
          ...s,
          watchlist: s.watchlist.includes(variantId) ? s.watchlist.filter((id) => id !== variantId) : [...s.watchlist, variantId],
        }));
      },
      addAlert(alert: Omit<PriceAlert, "id" | "createdAt">) {
        setState((s) => ({ ...s, alerts: [...s.alerts, { ...alert, id: uid(), createdAt: Date.now() }] }));
      },
      removeAlert(id: string) {
        setState((s) => ({ ...s, alerts: s.alerts.filter((a) => a.id !== id) }));
      },
      addHolding(h: Omit<Holding, "id">) {
        setState((s) => ({ ...s, portfolio: [...s.portfolio, { ...h, id: uid() }] }));
      },
      updateHolding(id: string, patch: Partial<Holding>) {
        setState((s) => ({ ...s, portfolio: s.portfolio.map((h) => (h.id === id ? { ...h, ...patch } : h)) }));
      },
      removeHolding(id: string) {
        setState((s) => ({ ...s, portfolio: s.portfolio.filter((h) => h.id !== id) }));
      },
      toggleSavedListing(id: string) {
        setState((s) => ({
          ...s,
          savedListings: s.savedListings.includes(id) ? s.savedListings.filter((x) => x !== id) : [...s.savedListings, id],
        }));
      },
      markNotificationsRead(ids: string[]) {
        setState((s) => ({ ...s, readNotifications: [...new Set([...s.readNotifications, ...ids])] }));
      },
      setLastVariant(variantId: string) {
        setState((s) => (s.lastVariantId === variantId ? s : { ...s, lastVariantId: variantId }));
      },
      setChat(update: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) {
        setState((s) => ({ ...s, chat: typeof update === "function" ? update(s.chat) : update }));
      },
    }),
    [],
  );

  return { ...state, ...actions, toasts, toast, dismissToast };
}

type Store = ReturnType<typeof useStoreValue>;
const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const value = useStoreValue();
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

export { uid };
