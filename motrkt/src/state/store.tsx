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

const STORAGE_KEY = "motrkt:v1";
const d = (y: number, m: number, day = 1) => Date.UTC(y, m - 1, day);

export const DEFAULT_STATE: Persisted = {
  watchlist: [
    "porsche-911-993-carrera-rs",
    "porsche-918-918-spyder",
    "porsche-911-991-1-r",
    "porsche-911-993-gt2",
    "porsche-911-964-turbo",
    "porsche-911-997-2-gt2-rs",
    "porsche-959-959-komfort",
    "porsche-carrera-gt-carrera-gt",
    "porsche-911-992-1-s-t",
  ],
  alerts: [
    { id: "a1", variantId: "porsche-911-964-carrera-rs", direction: "above", threshold: 375_000, createdAt: d(2026, 6, 2) },
    { id: "a2", variantId: "porsche-carrera-gt-carrera-gt", direction: "below", threshold: 2_500_000, createdAt: d(2026, 8, 14) },
  ],
  portfolio: [
    { id: "h1", variantId: "porsche-911-964-carrera-rs", purchasePrice: 245_000, purchaseDate: d(2019, 3, 12), mileage: 41_200, condition: "2+", color: "Rubinstern", note: "Deutsche Auslieferung, 2. Hand" },
    { id: "h2", variantId: "porsche-911-993-turbo-s", purchasePrice: 465_000, purchaseDate: d(2018, 6, 4), mileage: 28_900, condition: "1-", color: "Speedgelb", note: "Werksgarantie-Historie, Porsche-Zertifikat" },
    { id: "h3", variantId: "porsche-911-997-2-gt3-rs-4-0", purchasePrice: 360_000, purchaseDate: d(2020, 9, 21), mileage: 9_800, condition: "1-", color: "Grand-Prix-Weiß", note: "Clubsport, keine Rennstrecke" },
    { id: "h4", variantId: "porsche-930-turbo-3-0", purchasePrice: 145_000, purchaseDate: d(2017, 5, 8), mileage: 72_400, condition: "2", color: "Arenarot", note: "Matching Numbers" },
    { id: "h5", variantId: "porsche-356-356-speedster", purchasePrice: 310_000, purchaseDate: d(2016, 4, 18), mileage: 86_000, condition: "2+", color: "Grand-Prix-Weiß", note: "Restauriert 2014 (Dokumentation)" },
    { id: "h6", variantId: "porsche-911-996-1-gt3", purchasePrice: 98_000, purchaseDate: d(2021, 2, 9), mileage: 36_500, condition: "2", color: "Arktissilber", note: "Deutsche Auslieferung, Inspektion 2024" },
    { id: "h7", variantId: "porsche-912-912-coupe", purchasePrice: 58_000, purchaseDate: d(2019, 11, 28), mileage: 54_300, condition: "2+", color: "Elfenbein", note: "" },
  ],
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
    /* corrupt or unavailable storage – fall back to the demo state */
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
      resetAll() {
        const { visible, hidden } = partition(DEFAULT_STATE);
        hiddenItems = hidden;
        setState(visible);
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
