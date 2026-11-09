import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, CornerDownLeft, Menu, RotateCcw, Search, X, CheckCircle2, AlertCircle, Info, Gavel, TrendingUp, Upload, User } from "lucide-react";
import { useStore } from "../state/store";
import { useNotifications } from "../state/notifications";
import { search, type SearchHit } from "../lib/search";
import { cn, date } from "../lib/format";
import { ImportModal } from "./ImportModal";
import { AS_OF } from "../data/generate";
import { MODEL_SALES_TOTAL } from "../data/real/model";

const NAV_LEFT = [
  { to: "/markt", label: "Markt" },
  { to: "/modelle", label: "Modelle" },
  { to: "/auktionen", label: "Auktionen" },
  { to: "/kaufen", label: "Kaufen" },
];
const NAV_RIGHT = [
  { to: "/insights", label: "Insights" },
  { to: "/ai", label: "Co-Pilot" },
  { to: "/portfolio", label: "Portfolio" },
];
const AS_OF_LABEL = date(AS_OF);

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-ink px-4 py-2 text-center text-[12.5px] tracking-[0.02em] text-bg/85">
        Marktdaten vom {AS_OF_LABEL}.
        <span className="hidden sm:inline">
          {" "}
          Marktwerte aus {MODEL_SALES_TOTAL.toLocaleString("de-DE")} Auktionsergebnissen seit 2015; Inserate und kommende Auktionen sind Demo-Daten.
        </span>
      </div>
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-[1360px] px-5 py-8 sm:px-8 lg:py-12">
          <Suspense fallback={<div className="py-24 text-center font-serif text-muted italic">Einen Moment …</div>}>
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
    <Link to="/" className={cn("font-display text-[26px] leading-none tracking-[0.18em] text-ink", className)} aria-label="MOTRKT Startseite">
      MOTRKT
    </Link>
  );
}

function NavItem({ to, label }: { to: string; label: string }) {
  const { lastVariantId } = useStore();
  const { pathname } = useLocation();
  const href = to === "/markt" ? `/markt/${lastVariantId}` : to;
  const active = pathname.startsWith(to);
  return (
    <NavLink
      to={href}
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
          <button className="-ml-1 p-1 text-ink lg:hidden" onClick={() => setMenuOpen((o) => !o)} aria-label="Menü" aria-expanded={menuOpen}>
            {menuOpen ? <X className="size-5" strokeWidth={1.5} /> : <Menu className="size-5" strokeWidth={1.5} />}
          </button>
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Hauptnavigation">
            {NAV_LEFT.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
          </nav>
        </div>
        <Wordmark />
        <div className="flex items-center justify-end gap-7">
          <nav className="hidden items-center gap-7 xl:flex" aria-label="Weitere Bereiche">
            {NAV_RIGHT.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <button className="p-2 text-ink transition-colors hover:text-gold" onClick={() => setSearchOpen(true)} aria-label="Suche öffnen">
              <Search className="size-[19px]" strokeWidth={1.5} />
            </button>
            <NotificationBell />
            <UserMenu />
          </div>
        </div>
      </div>
      {menuOpen && (
        <nav className="animate-fade-in border-t border-line bg-bg px-5 py-4 sm:px-8 lg:hidden" aria-label="Navigation">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-3 font-serif text-lg sm:grid-cols-4">
            {[...NAV_LEFT, ...NAV_RIGHT].map((n) => (
              <li key={n.to}>
                <NavItem {...n} />
              </li>
            ))}
          </ul>
        </nav>
      )}
      {!menuOpen && (
        <nav className="hidden border-t border-line px-5 py-2.5 sm:px-8 lg:block xl:hidden" aria-label="Weitere Bereiche">
          <div className="mx-auto flex max-w-[1360px] justify-end gap-7">
            {NAV_RIGHT.map((n) => (
              <NavItem key={n.to} {...n} />
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
    <div ref={ref} className="animate-fade-in absolute inset-x-0 top-full border-b border-line bg-bg shadow-[0_30px_60px_-30px_rgba(58,42,29,0.35)]">
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
            placeholder="Modell, Variante, FIN oder Auktions-ID"
            className="min-w-0 flex-1 bg-transparent font-serif text-[22px] placeholder:text-faint focus:outline-none"
            aria-label="Suche"
          />
          <button onClick={onClose} aria-label="Suche schließen" className="text-muted hover:text-ink">
            <X className="size-5" strokeWidth={1.5} />
          </button>
        </div>
        {q.trim().length >= 2 ? (
          hits.length === 0 ? (
            <p className="py-8 text-center font-serif text-muted italic">Keine Treffer für „{q}“.</p>
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
          <p className="mt-3 text-[13px] text-faint">Zum Beispiel „Carrera RS“, „993 Turbo“ oder eine Auktions-ID wie „RMS-25“.</p>
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

const dropdown = "animate-fade-in absolute right-0 z-40 mt-2 rounded-[3px] border border-line bg-panel shadow-[0_24px_50px_-20px_rgba(58,42,29,0.35)]";

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { items, unread, read } = useNotifications();
  const { markNotificationsRead } = useStore();
  const ref = useClickOutside(open, () => setOpen(false));
  const navigate = useNavigate();
  const icon = { alert: AlertCircle, sale: TrendingUp, auction: Gavel };
  return (
    <div className="relative" ref={ref}>
      <button className="relative p-2 text-ink transition-colors hover:text-gold" onClick={() => setOpen((o) => !o)} aria-label={`Benachrichtigungen (${unread} ungelesen)`}>
        <Bell className="size-[19px]" strokeWidth={1.5} />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-gold" />}
      </button>
      {open && (
        <div className={cn(dropdown, "w-[min(92vw,380px)] overflow-hidden")}>
          <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
            <span className="font-serif text-[17px]">Benachrichtigungen</span>
            <button className="text-[13px] text-muted hover:text-ink disabled:opacity-40" disabled={!unread} onClick={() => markNotificationsRead(items.map((n) => n.id))}>
              Alle gelesen
            </button>
          </div>
          {items.length === 0 ? (
            <div className="px-5 py-8 text-center text-[14px] text-muted">Noch nichts Neues. Preisalarme legst du auf der Seite eines Fahrzeugs an.</div>
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

function UserMenu() {
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { resetAll, toast, portfolio, watchlist, alerts } = useStore();
  const ref = useClickOutside(open, () => setOpen(false));
  const item = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] hover:bg-panel-2";
  return (
    <div className="relative" ref={ref}>
      <button className="p-2 text-ink transition-colors hover:text-gold" onClick={() => setOpen((o) => !o)} aria-label="Konto">
        <User className="size-[19px]" strokeWidth={1.5} />
      </button>
      {open && (
        <div className={cn(dropdown, "w-64 py-2")}>
          <div className="px-3 pt-1 pb-2">
            <div className="font-serif text-[16px]">Demo-Konto</div>
            <div className="text-[13px] text-muted">
              {portfolio.length} Fahrzeuge, {watchlist.length} beobachtet, {alerts.length} Alarme
            </div>
          </div>
          <div className="my-1 border-t border-line" />
          <Link to="/portfolio" className={item} onClick={() => setOpen(false)}>
            Mein Portfolio
          </Link>
          <button
            className={item}
            onClick={() => {
              setImportOpen(true);
              setOpen(false);
            }}
          >
            <Upload className="size-3.5 text-muted" /> Verkäufe importieren (CSV)
          </button>
          <button
            className={cn(item, "text-down")}
            onClick={() => {
              if (confirm("Portfolio, Watchlist, Alarme und Chatverlauf auf die Demo-Daten zurücksetzen?")) {
                resetAll();
                toast("Demo-Daten wiederhergestellt", "info");
                setOpen(false);
              }
            }}
          >
            <RotateCcw className="size-3.5" /> Demo-Daten zurücksetzen
          </button>
        </div>
      )}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function Footer() {
  const { lastVariantId } = useStore();
  const links = [
    { to: `/markt/${lastVariantId}`, label: "Markt" },
    { to: "/modelle", label: "Modelle" },
    { to: "/auktionen", label: "Auktionen" },
    { to: "/kaufen", label: "Kaufen" },
    { to: "/insights", label: "Insights" },
    { to: "/portfolio", label: "Portfolio" },
  ];
  return (
    <footer className="mt-16 border-t border-line bg-panel-2">
      <div className="mx-auto grid max-w-[1360px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <div className="font-display text-[22px] tracking-[0.18em]">MOTRKT</div>
          <p className="mt-3 max-w-xs font-serif text-[15px] leading-relaxed text-muted italic">Marktwerte, Verkäufe und Angebote klassischer Sportwagen.</p>
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
            Marktwerte, Verläufe und Verkäufe beruhen auf {MODEL_SALES_TOTAL.toLocaleString("de-DE")} öffentlichen Auktionsergebnissen (Bring a Trailer, RM Sotheby&apos;s,
            Gooding, Bonhams, Broad Arrow, Artcurial), umgerechnet zum EZB-Kurs des Verkaufstags. Inserate, kommende Auktionen und Portfolio sind Demo-Daten. Keine
            Anlageberatung.
          </p>
          <Link to="/bildnachweise" className="link">
            Bildnachweise und Quellen
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
      {toasts.map((t) => {
        const Icon = icons[t.tone];
        return (
          <div key={t.id} className="animate-fade-in pointer-events-auto flex items-center gap-3 rounded-[2px] bg-ink px-4 py-3 text-[14px] text-bg shadow-lg">
            <Icon className={cn("size-4", t.tone === "error" ? "text-[#e7a493]" : "text-bg/70")} strokeWidth={1.5} />
            {t.message}
            <button onClick={() => dismissToast(t.id)} className="ml-1 text-bg/60 hover:text-bg" aria-label="Schließen">
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
