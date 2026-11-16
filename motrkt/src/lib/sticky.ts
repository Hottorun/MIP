import { useEffect, useRef, useState } from "react";
import type { SetURLSearchParams } from "react-router-dom";

/**
 * Filters that survive leaving a page: whoever opens a model from the results and comes back (or opens the page again
 * from the menu) finds search and filters as they left them. Kept for the browser tab's session (sessionStorage); a
 * private window or blocked storage simply starts with the defaults.
 */

const PREFIX = "mip.filter.";

function read<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the filter just is not kept */
  }
}

/** useState that keeps its value for the session under `key`. */
export function useStickyState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    const stored = read<T>(key);
    if (stored !== undefined) return stored;
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });
  useEffect(() => write(key, value), [key, value]);
  return [value, setValue] as const;
}

/**
 * For pages whose filters live in the URL: remembers the query string (without `ignore`d keys such as an open detail)
 * and puts it back when the page is opened without any filter in the URL.
 */
export function useStickyParams(key: string, params: URLSearchParams, setParams: SetURLSearchParams, ignore: string[] = []) {
  const restored = useRef(false);
  const own = (p: URLSearchParams) => {
    const q = new URLSearchParams(p);
    for (const k of ignore) q.delete(k);
    return q;
  };
  useEffect(() => {
    if (!restored.current) {
      restored.current = true;
      const stored = read<string>(key);
      if (stored && own(params).toString() === "") {
        const next = new URLSearchParams(stored);
        for (const k of ignore) if (params.has(k)) next.set(k, params.get(k)!);
        setParams(next, { replace: true });
        return;
      }
    }
    write(key, own(params).toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, params]);
}
