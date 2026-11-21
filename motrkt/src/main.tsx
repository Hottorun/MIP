import "./migrateStorage";
import "./index.css";
import { applyTheme, storedTheme } from "./lib/theme";
import { watchGlobalErrors, reportError } from "./lib/report";
import { loadDataset } from "./data/real/load";

applyTheme(storedTheme());
watchGlobalErrors();

// The width of the page without the scrollbar, for bands that span the whole window (.hero-bleed, src/index.css).
// It changes with the window and when a scrollbar comes or goes.
const pageWidth = () => document.documentElement.style.setProperty("--page-w", `${document.documentElement.clientWidth}px`);
pageWidth();
new ResizeObserver(pageWidth).observe(document.documentElement);

// The market data (a few MB, cached per content hash) and the app's code load side by side; the app's modules
// evaluate only once the data is there (they read it at import time), so the import below comes after loadDataset.
const root = document.getElementById("root")!;
const en = (() => {
  try {
    const saved = localStorage.getItem("mip-lang");
    if (saved === "de" || saved === "en") return saved === "en";
  } catch {
    // storage blocked: fall back to the browser language (as src/i18n does)
  }
  return !navigator.language.toLowerCase().startsWith("de");
})();
root.innerHTML = `<div class="flex min-h-screen flex-col items-center justify-center gap-4 font-display text-muted italic"><img src="/brand/carbay-mark.svg" alt="" width="56" height="56" class="animate-pulse" /><span>${en ? "One moment …" : "Einen Moment …"}</span></div>`;

loadDataset()
  .then(() => import("./bootstrap"))
  .then((m) => m.start(root))
  .catch((err) => {
    reportError("startup", err);
    root.innerHTML = `<div class="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"><p class="font-display text-xl">${en ? "The market data could not be loaded." : "Die Marktdaten konnten nicht geladen werden."}</p><p class="max-w-md text-sm text-muted">${en ? "Please check your connection and reload the page." : "Bitte Verbindung prüfen und die Seite neu laden."}</p><button class="btn btn-gold">${en ? "Reload" : "Neu laden"}</button></div>`;
    root.querySelector("button")?.addEventListener("click", () => location.reload());
  });
