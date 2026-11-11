// Imported first in main.tsx so it runs before any module reads localStorage.

// The app was called MOTRKT before; carry saved settings, portfolio and imports over to the new MIP keys once.
const RENAMED: [string, string][] = [
  ["motrkt:v1", "mip:v1"],
  ["motrkt:sales-import", "mip:sales-import"],
  ["motrkt-lang", "mip-lang"],
];
try {
  for (const [from, to] of RENAMED) {
    const old = localStorage.getItem(from);
    if (old !== null && localStorage.getItem(to) === null) localStorage.setItem(to, old);
    if (old !== null) localStorage.removeItem(from);
  }
} catch {
  // storage blocked (private mode etc.): nothing to migrate
}

// Until November 2026 every new user started with a sample portfolio, watchlist and two alerts. Remove those samples
// once from saved state; anything the user added is kept. The watchlist samples go only if all of them are still there.
const SAMPLE_HOLDINGS = ["h1", "h2", "h3", "h4", "h5", "h6", "h7"];
const SAMPLE_ALERTS = ["a1", "a2"];
const SAMPLE_WATCHLIST = [
  "porsche-911-993-carrera-rs",
  "porsche-918-918-spyder",
  "porsche-911-991-1-r",
  "porsche-911-993-gt2",
  "porsche-911-964-turbo",
  "porsche-911-997-2-gt2-rs",
  "porsche-959-959-komfort",
  "porsche-carrera-gt-carrera-gt",
  "porsche-911-992-1-s-t",
];
try {
  const raw = localStorage.getItem("mip:v1");
  if (raw !== null && localStorage.getItem("mip:samples-removed") === null) {
    const state = JSON.parse(raw);
    const watchlist: string[] = state.watchlist ?? [];
    if (SAMPLE_WATCHLIST.every((id) => watchlist.includes(id))) state.watchlist = watchlist.filter((id) => !SAMPLE_WATCHLIST.includes(id));
    state.portfolio = (state.portfolio ?? []).filter((h: { id: string }) => !SAMPLE_HOLDINGS.includes(h.id));
    state.alerts = (state.alerts ?? []).filter((a: { id: string }) => !SAMPLE_ALERTS.includes(a.id));
    localStorage.setItem("mip:v1", JSON.stringify(state));
  }
  localStorage.setItem("mip:samples-removed", "1");
} catch {
  // storage blocked or unreadable: nothing to clean up
}
