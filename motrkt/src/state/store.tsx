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
function partition(raw: Persisted): { visible: Persisted; hidden: HiddenItems } {
  // a hand-edited or older copy (browser or server) may hold null or another type where a list belongs
  const list = <T,>(v: T[] | unknown): T[] => (Array.isArray(v) ? v : []);
  const stored: Persisted = {
    ...raw,
    watchlist: list<string>(raw.watchlist),
    alerts: list<PriceAlert>(raw.alerts),
    portfolio: list<Holding>(raw.portfolio),
    savedListings: list<string>(raw.savedListings),
    readNotifications: list<string>(raw.readNotifications),
    chat: list<ChatMessage>(raw.chat),
    lastVariantId: typeof raw.lastVariantId === "string" ? raw.lastVariantId : DEFAULT_VARIANT_ID,
  };
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

/** Everything that is stored, with the items of switched-off brands put back. */
function toStored(state: Persisted): Persisted {
  return {
    ...state,
    watchlist: [...state.watchlist, ...hiddenItems.watchlist],
    portfolio: [...state.portfolio, ...hiddenItems.portfolio],
    alerts: [...state.alerts, ...hiddenItems.alerts],
  };
}

const SYNC_URL = "/api/zustand";
const OWNER_KEY = "mip:owner";

/**
 * Notes whose account the browser's copy belongs to (the tag from /api/zustand). True when the copy was left by
 * another account, e.g. a session that ran out without signing out: it must then be neither shown nor uploaded.
 * A copy from before the tag existed counts as the current account's.
 */
function leftByAnotherAccount(owner: unknown): boolean {
  if (typeof owner !== "string" || !owner) return false;
  try {
    const before = localStorage.getItem(OWNER_KEY);
    localStorage.setItem(OWNER_KEY, owner);
    return before !== null && before !== owner;
  } catch {
    return false;
  }
}
const SYNC_DELAY = 800;

function useStoreValue() {
  const [state, setState] = useState<Persisted>(load);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());
  // Server copy per account (server/userState.ts): "pending" until the first answer, "off" for the demo account or
  // without a server, "on" afterwards – then every change is pushed, debounced. The server copy wins on load; before it
  // exists the browser's copy is uploaded once.
  const sync = useRef<"pending" | "off" | "on">("pending");
  const pushTimer = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStored(state)));
    } catch {
      /* storage full or unavailable – keep working in memory */
    }
    if (sync.current !== "on") return;
    if (pushTimer.current) window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => {
      const { chat: _chat, ...rest } = toStored(state);
      void _chat;
      fetch(SYNC_URL, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rest) }).catch(() => {});
    }, SYNC_DELAY);
  }, [state]);

  useEffect(() => {
    let live = true;
    fetch(SYNC_URL, { credentials: "same-origin" })
      .then((r) => (r.status === 401 ? { guest: true } : r.ok ? r.json() : null))
      .then((j: { state: Partial<Persisted> | null; sync: boolean; owner?: string; guest?: undefined } | { guest: true } | null) => {
        if (!live) return void (sync.current = "off");
        // A guest keeps nothing (src/lib/plan.tsx): lists left in this browser by an account whose session ran out
        // are not shown. They stay on the server and come back with the next sign-in.
        if (j?.guest) {
          sync.current = "off";
          hiddenItems = { watchlist: [], portfolio: [], alerts: [] };
          setState((s) => ({ ...DEFAULT_STATE, lastVariantId: s.lastVariantId }));
          return;
        }
        const foreign = leftByAnotherAccount(j?.owner);
        const empty = () => {
          hiddenItems = { watchlist: [], portfolio: [], alerts: [] };
          return { ...DEFAULT_STATE };
        };
        if (!j?.sync) {
          sync.current = "off";
          if (foreign) setState(empty);
          return;
        }
        if (j.state) {
          // the server copy replaces lists and the last variant; the chat stays as it is in this browser
          setState((s) => {
            const { visible, hidden } = partition({ ...DEFAULT_STATE, ...j.state, chat: foreign ? [] : s.chat });
            hiddenItems = hidden;
            return visible;
          });
          // "on" after that render, so the server copy is not pushed straight back
          window.setTimeout(() => (sync.current = "on"), 0);
        } else {
          sync.current = "on";
          setState((s) => (foreign ? empty() : { ...s })); // first upload of what this browser has, if it is this account's
        }
      })
      .catch(() => (sync.current = "off"));
    return () => {
      live = false;
    };
  }, []);

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
