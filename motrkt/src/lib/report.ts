/**
 * Sends browser errors to the server (/api/fehler), which logs them; on Vercel they show up in the runtime logs.
 * At most a handful per page load, nothing personal beyond the message and the page.
 */
let sent = 0;
const MAX_PER_LOAD = 5;

export function reportError(kind: string, error: unknown, extra: Record<string, string> = {}) {
  if (sent >= MAX_PER_LOAD) return;
  sent++;
  const e = error instanceof Error ? error : null;
  const message = e?.message ?? (typeof error === "string" ? error : String(error ?? "unknown"));
  const body = JSON.stringify({ kind, message, stack: e?.stack ?? "", page: location.pathname + location.search, ...extra });
  fetch("/api/fehler", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

/** Uncaught errors and rejected promises anywhere in the app. */
export function watchGlobalErrors() {
  window.addEventListener("error", (ev) => reportError("error", ev.error ?? ev.message));
  window.addEventListener("unhandledrejection", (ev) => reportError("unhandledrejection", ev.reason));
}
