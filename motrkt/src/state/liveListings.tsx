import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Listing } from "../data/types";
import { fetchGeneration, fetchMobileStatus, generationQueries } from "../lib/mobilede";
import { t } from "../i18n";

/** Live mobile.de listings for the whole (enabled) catalog, loaded once per session when the API is configured. */

type LiveState = {
  status: "checking" | "off" | "loading" | "ready" | "error";
  listings: Listing[];
  error: string | null;
  loadedAt: number | null;
  refresh: () => void;
};

const LiveContext = createContext<LiveState | null>(null);

export function LiveListingsProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LiveState["status"]>("checking");
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      if (!(await fetchMobileStatus())) return setStatus("off");
      setStatus("loading");
      setError(null);
      const queries = generationQueries();
      const results: Listing[] = [];
      const failures: string[] = [];
      // A few queries at a time keeps us well inside mobile.de's rate limits (responses are cached server-side).
      for (let i = 0; i < queries.length; i += 3) {
        const batch = await Promise.allSettled(queries.slice(i, i + 3).map((q) => fetchGeneration(q, controller.signal)));
        for (const r of batch) {
          if (r.status === "fulfilled") results.push(...r.value);
          else failures.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
        }
        if (controller.signal.aborted) return;
        setListings([...results]);
      }
      const unique = [...new Map(results.map((l) => [l.id, l])).values()].sort((a, b) => b.listedAt - a.listedAt);
      setListings(unique);
      setLoadedAt(Date.now());
      if (failures.length === queries.length) {
        setStatus("error");
        setError(failures[0]);
      } else {
        setStatus("ready");
        setError(failures.length ? t(`${failures.length} von ${queries.length} Abfragen fehlgeschlagen: ${failures[0]}`, `${failures.length} of ${queries.length} requests failed: ${failures[0]}`) : null);
      }
    })().catch((e) => {
      if (controller.signal.aborted) return;
      setStatus("error");
      setError(e instanceof Error ? e.message : t("mobile.de nicht erreichbar", "mobile.de not reachable"));
    });
    return () => controller.abort();
  }, [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const value = useMemo(() => ({ status, listings, error, loadedAt, refresh }), [status, listings, error, loadedAt, refresh]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLiveListings(): LiveState {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLiveListings must be used inside <LiveListingsProvider>");
  return ctx;
}
