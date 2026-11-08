import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from "react-router-dom";
import { Bell, BarChart3, ChevronDown, ChevronRight, CornerDownLeft, RotateCcw, Search, Sparkles, X, CheckCircle2, AlertCircle, Info, Gavel, TrendingUp, Plus, Upload } from "lucide-react";
import { brands, generationById, models, variantById, yearsLabel } from "../data/db";
import { useStore } from "../state/store";
import { useNotifications } from "../state/notifications";
import { search, type SearchHit } from "../lib/search";
import { cn, date } from "../lib/format";
import { BrandEmblem } from "./ui";
import { ImportModal } from "./ImportModal";

const NAV = [
  { to: "/markt", label: "Markt" },
  { to: "/modelle", label: "Modelle" },
  { to: "/auktionen", label: "Auktionen" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/insights", label: "Insights" },
  { to: "/kaufen", label: "Kaufen" },
];

export function Layout() {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div className="flex h-full flex-col">
      <TopNav />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main ref={main} className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1680px] p-4 lg:p-5">
            <Suspense fallback={<div className="p-8 text-sm text-muted">Lade …</div>}>
              <Outlet />
            </Suspense>
          </div>
          <footer className="px-5 pb-5 text-center text-[11px] text-faint">
            MOTRKT · Werte mit „Echte Daten“ beruhen auf öffentlich berichteten Verkäufen (mit Quelle), übrige Werte, Inserate und kommende Auktionen sind Demo-Daten (Stand {date(Date.UTC(2026, 10, 2))}) · keine Anlageberatung ·{" "}
            <Link to="/bildnachweise" className="underline-offset-2 hover:text-muted hover:underline">
              Bildnachweise & Quellen
            </Link>
          </footer>
        </main>
      </div>
      <Toasts />
    </div>
  );
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 text-[19px] font-bold tracking-[0.08em]">
      <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden>
        <g fill="var(--color-gold)">
          <path d="M0 18 6 0h4L4 18z" />
          <path d="M8 18 14 0h4l-6 18z" />
          <path d="M16 18 22 0h4l-6 18z" />
        </g>
      </svg>
      MOTRKT
    </Link>
  );
}

function TopNav() {
  const { lastVariantId } = useStore();
  const { pathname } = useLocation();
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-panel/80 px-4 backdrop-blur">
      <Logo />
      <span className="hidden border-l border-line pl-4 text-xs italic text-muted xl:block">Marktintelligenz für klassische Sportwagen</span>
      <nav className="ml-2 flex h-full items-stretch gap-1 overflow-x-auto md:ml-6">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to === "/markt" ? `/markt/${lastVariantId}` : n.to}
            className={({ isActive }) =>
              cn(
                "relative flex items-center px-3 text-sm transition-colors",
                isActive || (n.to === "/markt" && pathname.startsWith("/markt")) ? "text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-gold" : "text-muted hover:text-ink",
              )
            }
          >
            {n.label}
          </NavLink>
        ))}
        <NavLink
          to="/ai"
          className={({ isActive }) =>
            cn(
              "relative flex items-center gap-1 px-3 text-sm transition-colors",
              isActive ? "text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-gold" : "text-muted hover:text-ink",
            )
          }
        >
          AI <Sparkles className="size-3.5 text-gold" />
        </NavLink>
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <SearchBox />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}

function SearchBox() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => search(q), [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        e.preventDefault();
        input.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (hit: SearchHit) => {
    navigate(hit.href);
    setQ("");
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="relative">
      <div className="flex h-9 w-[min(38vw,340px)] items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 focus-within:border-gold/60">
        <Search className="size-4 shrink-0 text-muted" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
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
              setOpen(false);
              input.current?.blur();
            }
          }}
          placeholder="Modell, Variante, FIN, Auktions-ID …"
          className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-faint focus:outline-none"
          aria-label="Suche"
        />
        {q ? (
          <button onClick={() => setQ("")} aria-label="Suche leeren" className="text-muted hover:text-ink">
            <X className="size-3.5" />
          </button>
        ) : (
          <kbd className="rounded border border-line px-1.5 text-[10px] text-faint">/</kbd>
        )}
      </div>
      {open && q.trim().length >= 2 && (
        <div className="panel animate-fade-in absolute right-0 z-40 mt-1.5 w-[min(92vw,460px)] overflow-hidden shadow-2xl shadow-black/60">
          {hits.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted">Keine Treffer für „{q}“</div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {hits.map((h, i) => (
                <li key={h.href + h.label}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(h)}
                    onMouseEnter={() => setActive(i)}
                    className={cn("flex w-full items-center gap-3 px-3 py-2 text-left", i === active && "bg-panel-3")}
                  >
                    <span className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-gold">{h.kind}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{h.label}</span>
                      <span className="block truncate text-xs text-muted">{h.detail}</span>
                    </span>
                    {i === active && <CornerDownLeft className="size-3.5 text-muted" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line px-3 py-1.5 text-[11px] text-faint">↑↓ navigieren · Enter öffnen · Tipp: FIN oder Auktions-ID (z. B. „RMS-25“) eingeben</div>
        </div>
      )}
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

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { items, unread, read } = useNotifications();
  const { markNotificationsRead } = useStore();
  const ref = useClickOutside(open, () => setOpen(false));
  const navigate = useNavigate();
  const icon = { alert: AlertCircle, sale: TrendingUp, auction: Gavel };
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-ghost relative size-9 p-0" onClick={() => setOpen((o) => !o)} aria-label={`Benachrichtigungen (${unread} ungelesen)`}>
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="panel animate-fade-in absolute right-0 z-40 mt-1.5 w-[min(92vw,400px)] overflow-hidden shadow-2xl shadow-black/60">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold">Benachrichtigungen</span>
            <button className="text-xs text-gold hover:underline disabled:opacity-40" disabled={!unread} onClick={() => markNotificationsRead(items.map((n) => n.id))}>
              Alle als gelesen markieren
            </button>
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">Keine Benachrichtigungen. Lege Preisalarme über das Glocken-Symbol einer Variante an.</div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {items.map((n) => {
                const Icon = icon[n.kind];
                return (
                  <li key={n.id}>
                    <button
                      className="flex w-full gap-3 border-b border-line/60 px-4 py-2.5 text-left hover:bg-panel-3"
                      onClick={() => {
                        markNotificationsRead([n.id]);
                        setOpen(false);
                        navigate(n.href);
                      }}
                    >
                      <Icon className={cn("mt-0.5 size-4 shrink-0", n.kind === "alert" ? "text-gold" : n.kind === "sale" ? "text-up" : "text-muted")} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm", read.has(n.id) ? "text-muted" : "text-ink")}>{n.title}</span>
                        <span className="block text-xs text-muted">{n.body}</span>
                        <span className="block text-[11px] text-faint">{date(n.time)}</span>
                      </span>
                      {!read.has(n.id) && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-gold" />}
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
  return (
    <div className="relative" ref={ref}>
      <button
        className="flex size-9 items-center justify-center rounded-full border border-line bg-panel-3 text-xs font-semibold hover:border-gold/60"
        onClick={() => setOpen((o) => !o)}
        aria-label="Konto"
      >
        JD
      </button>
      {open && (
        <div className="panel animate-fade-in absolute right-0 z-40 mt-1.5 w-64 p-2 shadow-2xl shadow-black/60">
          <div className="px-2 py-1.5">
            <div className="text-sm font-medium">Demo-Konto</div>
            <div className="text-xs text-muted">
              {portfolio.length} Fahrzeuge · {watchlist.length} Watchlist · {alerts.length} Alarme
            </div>
          </div>
          <Link to="/portfolio" className="block rounded-md px-2 py-1.5 text-sm hover:bg-panel-3" onClick={() => setOpen(false)}>
            Mein Portfolio
          </Link>
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-panel-3"
            onClick={() => {
              setImportOpen(true);
              setOpen(false);
            }}
          >
            <Upload className="size-3.5" /> Marktdaten importieren (CSV)
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-down hover:bg-panel-3"
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

function Sidebar() {
  const match = useMatch("/markt/:variantId");
  const { lastVariantId } = useStore();
  const current = variantById.get(match?.params.variantId ?? "") ?? variantById.get(lastVariantId)!;
  const [brandId, setBrandId] = useState(current.brandId);
  const [expandedModel, setExpandedModel] = useState<string | null>(current.modelId);
  const [moreBrands, setMoreBrands] = useState(false);
  const [moreModels, setMoreModels] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setBrandId(current.brandId);
    setExpandedModel(current.modelId);
  }, [current.brandId, current.modelId]);

  const brandModels = models.filter((m) => m.brandId === brandId);
  const shownModels = moreModels ? brandModels : brandModels.filter((m) => m.featured || m.id === current.modelId);
  const shownBrands = moreBrands ? brands : brands.filter((b) => b.featured || b.id === brandId);
  const gen = generationById.get(current.generationId)!;
  const brand = brands.find((b) => b.id === brandId)!;

  return (
    <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-line bg-panel/40 px-3 py-4 text-sm lg:block">
      <NavLink to="/" end className={({ isActive }) => cn("flex items-center gap-2.5 rounded-lg px-2 py-2", isActive ? "bg-panel-3 text-ink" : "text-muted hover:text-ink")}>
        <BarChart3 className="size-4" /> Marktüberblick
      </NavLink>

      <SectionTitle>Marken</SectionTitle>
      <ul className="space-y-0.5">
        {shownBrands.map((b) => (
          <li key={b.id}>
            <button
              onClick={() => {
                setBrandId(b.id);
                setMoreModels(false);
                const first = models.find((m) => m.brandId === b.id && m.featured);
                setExpandedModel(first?.id ?? null);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left",
                b.id === brandId ? "border-gold/40 bg-gold/10 text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              <BrandEmblem brandId={b.id} />
              <span className="flex-1">{b.name}</span>
              {b.id === brandId && <ChevronDown className="size-3.5 text-muted" />}
            </button>
          </li>
        ))}
        {brands.some((b) => !b.featured) && (
          <li>
            <button onClick={() => setMoreBrands((m) => !m)} className="flex w-full items-center gap-2.5 px-2 py-1.5 text-xs text-muted hover:text-ink">
              {moreBrands ? <ChevronDown className="size-3.5" /> : <Plus className="size-3.5" />} {moreBrands ? "Weniger Marken" : "Weitere Marken"}
            </button>
          </li>
        )}
      </ul>

      <SectionTitle>Modelle ({brand.name})</SectionTitle>
      <ul className="space-y-0.5">
        {shownModels.map((m) => {
          const expanded = expandedModel === m.id;
          const multi = m.generationIds.length > 1;
          return (
            <li key={m.id}>
              <button
                onClick={() => {
                  if (multi) setExpandedModel(expanded ? null : m.id);
                  else navigate(`/markt/${generationById.get(m.generationIds[0])!.variantIds[0]}`);
                }}
                className={cn("flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left", m.id === current.modelId ? "text-ink" : "text-muted hover:text-ink")}
              >
                {multi ? (expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />) : <span className="w-3.5" />}
                <span className="flex-1 font-medium">{m.name}</span>
                {!multi && <span className="text-[11px] text-faint">{yearsLabel(generationById.get(m.generationIds[0])!.years)}</span>}
              </button>
              {multi && expanded && (
                <ul className="mt-0.5 mb-1 ml-5 space-y-0.5">
                  {m.generationIds.map((gid) => {
                    const g = generationById.get(gid)!;
                    const active = gid === current.generationId;
                    return (
                      <li key={gid}>
                        <button
                          onClick={() => navigate(`/markt/${g.variantIds.includes(current.id) ? current.id : g.variantIds[0]}`)}
                          className={cn(
                            "flex w-full items-baseline gap-2 rounded-md border px-2 py-1 text-left",
                            active ? "border-gold/40 bg-gold/10 text-ink" : "border-transparent text-muted hover:text-ink",
                          )}
                        >
                          <span className="font-medium">{g.name}</span>
                          <span className="text-[11px] text-faint">({yearsLabel(g.years)})</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
        {brandModels.some((m) => !m.featured) && (
          <li>
            <button onClick={() => setMoreModels((m) => !m)} className="flex w-full items-center gap-1.5 px-1.5 py-1 text-xs text-muted hover:text-ink">
              {moreModels ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} {moreModels ? "Weniger Modelle" : "Weitere Modelle"}
            </button>
          </li>
        )}
      </ul>

      <SectionTitle>
        Variationen <span className="font-normal text-faint">({gen.name})</span>
      </SectionTitle>
      <ul className="space-y-0.5">
        {gen.variantIds.map((id) => {
          const v = variantById.get(id)!;
          const active = id === current.id && !!match;
          return (
            <li key={id}>
              <Link
                to={`/markt/${id}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-md border px-2 py-1.5",
                  active ? "border-gold/40 bg-gold/10 text-ink" : "border-transparent text-muted hover:text-ink",
                )}
              >
                <span className={cn("flex size-3.5 items-center justify-center rounded-[3px] border", active ? "border-gold bg-gold text-black" : "border-line-2")}>
                  {active && <CheckCircle2 className="size-3" strokeWidth={3} />}
                </span>
                <span className="flex-1 truncate">{v.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 mb-1.5 border-t border-line pt-4 px-2 text-[13px] font-semibold text-ink">{children}</div>;
}

function Toasts() {
  const { toasts, dismissToast } = useStore();
  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = icons[t.tone];
        return (
          <div key={t.id} className="panel animate-fade-in pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 text-sm shadow-xl shadow-black/50">
            <Icon className={cn("size-4", t.tone === "success" ? "text-up" : t.tone === "error" ? "text-down" : "text-gold")} />
            {t.message}
            <button onClick={() => dismissToast(t.id)} className="ml-1 text-muted hover:text-ink" aria-label="Schließen">
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
