import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, CornerDownLeft, Menu, Search, X, CheckCircle2, AlertCircle, Info, TrendingUp, Upload, User, LogOut } from "lucide-react";
import { useStore } from "../state/store";
import { useNotifications } from "../state/notifications";
import { search, type SearchHit } from "../lib/search";
import { cn, date, num } from "../lib/format";
import { t, useLang, type Lang } from "../i18n";
import { ImportModal } from "./ImportModal";
import { AS_OF } from "../data/generate";
import { LogoFull, LogoMark } from "./LogoMark";
import { MODEL_CHANNELS } from "../data/real/model";

// What the market values rest on: auction results (Europe and US) and asking prices.
const N_AUCTIONS = MODEL_CHANNELS.EU_AUC + MODEL_CHANNELS.US_AUC + MODEL_CHANNELS.US_ONL;
const N_ASKS = MODEL_CHANNELS.EU_ASK + MODEL_CHANNELS.US_ASK;

const NAV_LEFT = [
  { to: "/", get label() { return t("Start", "Home"); } },
  { to: "/modelle", get label() { return t("Modelle", "Models"); } },
  { to: "/auktionen", get label() { return t("Auktionen", "Auctions"); } },
  { to: "/kaufen", get label() { return t("Kaufen", "Buy"); } },
];
const NAV_RIGHT = [
  { to: "/insights", label: "Insights" },
  { to: "/ai", label: "Co-Pilot" },
  { to: "/portfolio", label: "Portfolio" },
];

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-ink px-4 py-2 text-center text-[12.5px] tracking-[0.02em] text-bg/85">
        {t("Marktdaten vom", "Market data as of")} {date(AS_OF)}.
        <span className="hidden sm:inline">
          {" "}
          {t(
            `Marktwerte aus ${num(N_AUCTIONS)} Auktionsergebnissen seit 2015 und ${num(N_ASKS)} Angeboten.`,
            `Market values from ${num(N_AUCTIONS)} auction results since 2015 and ${num(N_ASKS)} listings.`,
          )}
        </span>
      </div>
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-[1360px] px-5 py-8 sm:px-8 lg:py-12">
          <Suspense
            fallback={
              <div className="flex flex-col items-center gap-4 py-24 font-serif text-muted italic">
                <LogoMark size={56} className="animate-pulse" />
                {t("Einen Moment …", "One moment …")}
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </main>
      <Footer />
      <Toasts />
    </div>
  );
}

function Wordmark({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn("flex items-center", className)} aria-label={t("MIP Startseite", "MIP home")}>
      <LogoMark size={56} />
    </Link>
  );
}

function NavItem({ to, label }: { to: string; label: string }) {
  const { pathname } = useLocation();
  const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
  return (
    <NavLink
      to={to}
      className={cn("border-b py-1 text-[14.5px] transition-colors", active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}
    >
      {label}
    </NavLink>
  );
}

function Header() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur-sm">
      <div className="mx-auto grid h-[72px] max-w-[1360px] grid-cols-[1fr_auto_1fr] items-center gap-6 px-5 sm:px-8">
        <div className="flex items-center gap-7">
          <button className="-ml-1 p-1 text-ink lg:hidden" onClick={() => setMenuOpen((o) => !o)} aria-label={t("Menü", "Menu")} aria-expanded={menuOpen}>
            {menuOpen ? <X className="size-5" strokeWidth={1.5} /> : <Menu className="size-5" strokeWidth={1.5} />}
          </button>
          <nav className="hidden items-center gap-7 lg:flex" aria-label={t("Hauptnavigation", "Main navigation")}>
            {NAV_LEFT.map((n) => (
              <NavItem key={n.to} to={n.to} label={n.label} />
            ))}
          </nav>
        </div>
        <Wordmark />
        <div className="flex items-center justify-end gap-7">
          <nav className="hidden items-center gap-7 xl:flex" aria-label={t("Weitere Bereiche", "More sections")}>
            {NAV_RIGHT.map((n) => (
              <NavItem key={n.to} to={n.to} label={n.label} />
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <button className="p-2 text-ink transition-colors hover:text-gold" onClick={() => setSearchOpen(true)} aria-label={t("Suche öffnen", "Open search")}>
              <Search className="size-[19px]" strokeWidth={1.5} />
            </button>
            <NotificationBell />
            <UserMenu />
            <LangSwitch className="ml-1 hidden sm:flex" />
          </div>
        </div>
      </div>
      {menuOpen && (
        <nav className="animate-fade-in border-t border-line bg-bg px-5 py-4 sm:px-8 lg:hidden" aria-label="Navigation">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-3 font-serif text-lg sm:grid-cols-4">
            {[...NAV_LEFT, ...NAV_RIGHT].map((n) => (
              <li key={n.to}>
                <NavItem to={n.to} label={n.label} />
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-3 sm:hidden">
            <span className="text-[13px] text-muted">{t("Sprache", "Language")}</span>
            <LangSwitch />
          </div>
        </nav>
      )}
      {!menuOpen && (
        <nav className="hidden border-t border-line px-5 py-2.5 sm:px-8 lg:block xl:hidden" aria-label={t("Weitere Bereiche", "More sections")}>
          <div className="mx-auto flex max-w-[1360px] justify-end gap-7">
            {NAV_RIGHT.map((n) => (
              <NavItem key={n.to} to={n.to} label={n.label} />
            ))}
          </div>
        </nav>
      )}
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </header>
  );
}

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => search(q), [q]);
  const ref = useClickOutside(true, onClose);

  useEffect(() => input.current?.focus(), []);

  const go = (hit: SearchHit) => {
    navigate(hit.href);
    onClose();
  };

  return (
    <div ref={ref} className="animate-fade-in absolute inset-x-0 top-full border-b border-line bg-bg shadow-[0_30px_60px_-30px_rgba(20,20,20,0.22)]">
      <div className="mx-auto max-w-[760px] px-5 pt-6 pb-8">
        <div className="flex items-center gap-3 border-b border-ink pb-2">
          <Search className="size-5 shrink-0 text-muted" strokeWidth={1.5} />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(hits.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter" && hits[active]) {
                go(hits[active]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder={t("Modell, Variante, FIN oder Auktions-ID", "Model, variant, VIN or auction ID")}
            className="min-w-0 flex-1 bg-transparent font-serif text-[22px] placeholder:text-faint focus:outline-none"
            aria-label={t("Suche", "Search")}
          />
          <button onClick={onClose} aria-label={t("Suche schließen", "Close search")} className="text-muted hover:text-ink">
            <X className="size-5" strokeWidth={1.5} />
          </button>
        </div>
        {q.trim().length >= 2 ? (
          hits.length === 0 ? (
            <p className="py-8 text-center font-serif text-muted italic">{t(`Keine Treffer für „${q}“.`, `No results for “${q}”.`)}</p>
          ) : (
            <ul className="mt-3 max-h-[55vh] overflow-y-auto">
              {hits.map((h, i) => (
                <li key={h.href + h.label}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(h)}
                    onMouseEnter={() => setActive(i)}
                    className={cn("flex w-full items-baseline gap-4 border-b border-line/70 px-1 py-2.5 text-left", i === active && "bg-panel-2")}
                  >
                    <span className="w-20 shrink-0 text-[12.5px] text-faint">{h.kind}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-serif text-[16px]">{h.label}</span>
                      <span className="block truncate text-[13px] text-muted">{h.detail}</span>
                    </span>
                    {i === active && <CornerDownLeft className="size-3.5 self-center text-faint" />}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="mt-3 text-[13px] text-faint">
            {t("Zum Beispiel „Carrera RS“, „993 Turbo“ oder eine Auktions-ID wie „RMS-25“.", "For example “Carrera RS”, “993 Turbo” or an auction ID like “RMS-25”.")}
          </p>
        )}
      </div>
    </div>
  );
}

function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);
  return ref;
}

const dropdown = "animate-fade-in absolute right-0 z-40 mt-2 rounded-[3px] border border-line bg-panel shadow-[0_24px_50px_-20px_rgba(20,20,20,0.22)]";

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { items, unread, read } = useNotifications();
  const { markNotificationsRead } = useStore();
  const ref = useClickOutside(open, () => setOpen(false));
  const navigate = useNavigate();
  const icon = { alert: AlertCircle, sale: TrendingUp };
  return (
    <div className="relative" ref={ref}>
      <button className="relative p-2 text-ink transition-colors hover:text-gold" onClick={() => setOpen((o) => !o)} aria-label={t(`Benachrichtigungen (${unread} ungelesen)`, `Notifications (${unread} unread)`)}>
        <Bell className="size-[19px]" strokeWidth={1.5} />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-gold" />}
      </button>
      {open && (
        <div className={cn(dropdown, "w-[min(92vw,380px)] overflow-hidden")}>
          <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
            <span className="font-serif text-[17px]">{t("Benachrichtigungen", "Notifications")}</span>
            <button className="text-[13px] text-muted hover:text-ink disabled:opacity-40" disabled={!unread} onClick={() => markNotificationsRead(items.map((n) => n.id))}>
              {t("Alle gelesen", "Mark all read")}
            </button>
          </div>
          {items.length === 0 ? (
            <div className="px-5 py-8 text-center text-[14px] text-muted">{t("Noch nichts Neues. Preisalarme legst du auf der Seite eines Fahrzeugs an.", "Nothing new yet. You can set price alerts on a car's page.")}</div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {items.map((n) => {
                const Icon = icon[n.kind];
                return (
                  <li key={n.id}>
                    <button
                      className="flex w-full gap-3 border-b border-line/60 px-5 py-3 text-left hover:bg-panel-2"
                      onClick={() => {
                        markNotificationsRead([n.id]);
                        setOpen(false);
                        navigate(n.href);
                      }}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-faint" strokeWidth={1.5} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-[14px]", read.has(n.id) ? "text-muted" : "text-ink")}>{n.title}</span>
                        <span className="block text-[13px] text-muted">{n.body}</span>
                        <span className="block text-[12px] text-faint">{date(n.time)}</span>
                      </span>
                      {!read.has(n.id) && <span className="mt-2 size-1.5 shrink-0 rounded-full bg-gold" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** The signed-in user's name (the server lets nobody into the app without a session). */
function useUsername() {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && setName(j?.username ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return name;
}

async function signOut() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } finally {
    window.location.replace("/anmelden");
  }
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { portfolio, watchlist, alerts } = useStore();
  const ref = useClickOutside(open, () => setOpen(false));
  const username = useUsername();
  const item = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] hover:bg-panel-2";
  return (
    <div className="relative" ref={ref}>
      <button className="p-2 text-ink transition-colors hover:text-gold" onClick={() => setOpen((o) => !o)} aria-label={t("Konto", "Account")}>
        <User className="size-[19px]" strokeWidth={1.5} />
      </button>
      {open && (
        <div className={cn(dropdown, "w-64 py-2")}>
          <div className="px-3 pt-1 pb-2">
            <div className="truncate font-serif text-[16px]">{username ?? t("Konto", "Account")}</div>
            <div className="text-[13px] text-muted">
              {t(
                `${portfolio.length} Fahrzeuge, ${watchlist.length} beobachtet, ${alerts.length} Alarme`,
                `${portfolio.length} cars, ${watchlist.length} watched, ${alerts.length} alerts`,
              )}
            </div>
          </div>
          <div className="my-1 border-t border-line" />
          <Link to="/portfolio" className={item} onClick={() => setOpen(false)}>
            {t("Mein Portfolio", "My portfolio")}
          </Link>
          <button
            className={item}
            onClick={() => {
              setImportOpen(true);
              setOpen(false);
            }}
          >
            <Upload className="size-3.5 text-muted" /> {t("Verkäufe importieren (CSV)", "Import sales (CSV)")}
          </button>
          <div className="my-1 border-t border-line" />
          <button className={item} onClick={signOut}>
            <LogOut className="size-3.5 text-muted" /> {t("Abmelden", "Sign out")}
          </button>
        </div>
      )}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

/** "DE | EN": switches the interface language; the choice is stored in the browser. */
function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useLang();
  const opt = (l: Lang, label: string, name: string) => (
    <button
      type="button"
      onClick={() => setLang(l)}
      aria-pressed={lang === l}
      aria-label={name}
      lang={l}
      className={cn("px-1 py-1 transition-colors", lang === l ? "text-ink" : "text-faint hover:text-ink")}
    >
      {label}
    </button>
  );
  return (
    <div className={cn("flex items-center text-[12.5px] tracking-[0.08em]", className)} role="group" aria-label={t("Sprache", "Language")}>
      {opt("de", "DE", "Deutsch")}
      <span className="text-line-2" aria-hidden>
        |
      </span>
      {opt("en", "EN", "English")}
    </div>
  );
}

function Footer() {
  const links = [
    { to: "/", label: t("Start", "Home") },
    { to: "/modelle", label: t("Modelle", "Models") },
    { to: "/auktionen", label: t("Auktionen", "Auctions") },
    { to: "/kaufen", label: t("Kaufen", "Buy") },
    { to: "/insights", label: "Insights" },
    { to: "/portfolio", label: "Portfolio" },
  ];
  return (
    <footer className="mt-16 border-t border-line bg-panel-2">
      <div className="mx-auto grid max-w-[1360px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <LogoFull size={88} className="w-fit" />
          <p className="mt-5 max-w-xs font-serif text-[15px] leading-relaxed text-muted italic">
            {t("Marktwerte, Verkäufe und Angebote klassischer Sportwagen.", "Market values, sales and listings of classic sports cars.")}
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-y-2 text-[14px]">
          {links.map((l) => (
            <li key={l.label}>
              <Link to={l.to} className="text-muted hover:text-ink">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="space-y-2 text-[13px] leading-relaxed text-muted">
          <p>
            {t(
              `Marktwerte, Verläufe und Verkäufe beruhen auf ${num(N_AUCTIONS)} öffentlichen Auktionsergebnissen (Bring a Trailer, RM Sotheby's, Gooding, Bonhams, Broad Arrow, Artcurial) und ${num(N_ASKS)} Angeboten von Classic Trader und Händlern, umgerechnet zum EZB-Kurs des Verkaufstags. Keine Anlageberatung.`,
              `Market values, price histories and sales are based on ${num(N_AUCTIONS)} public auction results (Bring a Trailer, RM Sotheby's, Gooding, Bonhams, Broad Arrow, Artcurial) and ${num(N_ASKS)} listings from Classic Trader and dealers, converted at the ECB rate on the day of sale. Not investment advice.`,
            )}
          </p>
          <Link to="/bildnachweise" className="link">
            {t("Bildnachweise und Quellen", "Image credits and sources")}
          </Link>
        </div>
      </div>
    </footer>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useStore();
  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-[60] flex flex-col gap-2">
      {toasts.map((item) => {
        const Icon = icons[item.tone];
        return (
          <div key={item.id} className="animate-fade-in pointer-events-auto flex items-center gap-3 rounded-[2px] bg-ink px-4 py-3 text-[14px] text-bg shadow-lg">
            <Icon className={cn("size-4", item.tone === "error" ? "text-[#e7a493]" : "text-bg/70")} strokeWidth={1.5} />
            {item.message}
            <button onClick={() => dismissToast(item.id)} className="ml-1 text-bg/60 hover:text-bg" aria-label={t("Schließen", "Close")}>
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
