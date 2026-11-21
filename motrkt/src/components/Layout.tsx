import { Component, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, CornerDownLeft, Menu, Moon, Search, Sun, X, CheckCircle2, AlertCircle, Info, TrendingUp, Upload, User, LogOut, ShieldCheck, Settings, Briefcase, Crown, Lock, ArrowRight, LogIn, UserPlus } from "lucide-react";
import { useMe } from "../lib/userCars";
import { signInHref, usePlan } from "../lib/plan";
import { signOut } from "../lib/session";
import { PremiumFab, UpgradeDialog } from "./premium/Upgrade";
import { useStore } from "../state/store";
import { useNotifications } from "../state/notifications";
import { prepareSearch, search, type SearchHit } from "../lib/search";
import { cn, date, num, usdRate } from "../lib/format";
import { t, useLang, type Lang } from "../i18n";
import { ImportModal } from "./ImportModal";
import { EmailGate } from "./EmailGate";
import { AS_OF } from "../data/generate";
import { LogoMark, LogoWordmark } from "./LogoMark";
import { MODEL_CHANNELS } from "../data/real/model";
import { reportError } from "../lib/report";
import { useTheme } from "../lib/theme";

// What the market values rest on: auction results (Europe and US) and asking prices.
const N_AUCTIONS = MODEL_CHANNELS.EU_AUC + MODEL_CHANNELS.US_AUC + MODEL_CHANNELS.US_ONL + (MODEL_CHANNELS.US_PCM ?? 0);

type NavEntry = { to: string; label: string; premium?: boolean };
const NAV_LEFT: NavEntry[] = [
  { to: "/", get label() { return t("Start", "Home"); } },
  { to: "/modelle", get label() { return t("Modelle", "Models"); } },
  { to: "/auktionen", get label() { return t("Auktionen", "Auctions"); } },
  { to: "/kaufen", get label() { return t("Kaufen", "Buy"); } },
];
// premium: locked for a lite user (src/lib/plan.tsx); the entries stay in the menu and lead to a preview of the page
const NAV_RIGHT: NavEntry[] = [
  { to: "/insights", label: "Insights", premium: true },
  { to: "/ai", label: "Co-Pilot", premium: true },
];

export function Layout() {
  const { pathname } = useLocation();
  const { ready, premium } = usePlan();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  const wait = (
    <div className="flex flex-col items-center gap-4 py-24 font-display text-muted italic">
      <LogoMark size={56} className="animate-pulse" />
      {t("Einen Moment …", "One moment …")}
    </div>
  );
  return (
    <div className="flex min-h-screen flex-col">
      <div className="night-band top-seam px-4 py-2 text-center text-[12.5px] tracking-[0.02em]">
        <span className="mr-2 inline-block size-1.5 -translate-y-px rounded-full bg-accent align-middle shadow-[0_0_0_3px_rgba(71,167,184,0.25)]" aria-hidden />
        <span className="text-on-night/90">{t("Marktdaten vom", "Market data as of")} {date(AS_OF)}.</span>
        <span className="hidden text-on-night/65 sm:inline">
          {" "}
          {t(
            `Marktwerte aus ${num(N_AUCTIONS)} Auktionsergebnissen, Händler- und Privatverkäufen.`,
            `Market values from ${num(N_AUCTIONS)} auction results, dealer and private sales.`,
          )}
        </span>
      </div>
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-[1360px] px-5 py-8 sm:px-8 lg:py-12">
          {/* the pages wait for the plan (first visit only, later ones start from the cached answer): no lock flashes up for a premium user, no data for a lite one */}
          {ready ? (
            <Suspense fallback={wait}>
              <PageErrorBoundary key={pathname}>
                <Outlet />
              </PageErrorBoundary>
            </Suspense>
          ) : (
            wait
          )}
        </div>
      </main>
      <Footer />
      <PremiumFab />
      <UpgradeDialog />
      <EmailGate />
      <Toasts raised={ready && !premium} />
    </div>
  );
}

/** A page that throws while rendering shows this instead of a blank app; the header and footer stay usable. */
class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("page error", error, info.componentStack);
    reportError("render", error, { component: (info.componentStack ?? "").slice(0, 600) });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="font-display text-heading text-2xl">{t("Diese Seite konnte nicht angezeigt werden.", "This page could not be shown.")}</h1>
        <p className="mt-3 text-sm text-muted">
          {t("Ein Fehler ist aufgetreten. Neu laden hilft meist; sonst bitte später noch einmal versuchen.", "Something went wrong. Reloading usually helps; otherwise please try again later.")}
        </p>
        <p className="mt-2 font-mono text-[12px] text-faint">{this.state.error.message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button className="btn btn-gold" onClick={() => location.reload()}>
            {t("Neu laden", "Reload")}
          </button>
          <Link to="/" className="btn" onClick={() => this.setState({ error: null })}>
            {t("Zur Startseite", "Home")}
          </Link>
        </div>
      </div>
    );
  }
}

function Wordmark({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn("flex items-center", className)} aria-label={t("Cartag Startseite", "Cartag home")}>
      <LogoWordmark height={52} light />
    </Link>
  );
}

function useNavState(to: string, premium?: boolean) {
  const { pathname } = useLocation();
  const plan = usePlan();
  return { active: to === "/" ? pathname === "/" : pathname.startsWith(to), locked: !!premium && plan.ready && !plan.premium };
}

/** Desktop header: tabs in petrol (gold of the logo in the dark theme); the current one sits on a soft accent pill. */
function NavItem({ to, label, premium }: NavEntry) {
  const { active, locked } = useNavState(to, premium);
  return (
    <NavLink
      to={to}
      title={locked ? t("Teil von Premium", "Part of premium") : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14.5px] font-medium tracking-[0.01em] transition-colors",
        active ? "bg-accent-soft text-nav" : "text-nav/70 hover:text-nav",
      )}
    >
      {label}
      {locked && (
        <>
          <Lock className="size-3 text-gold" strokeWidth={2} aria-hidden />
          <span className="sr-only">{t("(Premium)", "(premium)")}</span>
        </>
      )}
    </NavLink>
  );
}

/**
 * Mobile menu: numbered section names in the serif on the petrol panel. The current one in gold with a gold rule
 * at its edge; the others reveal an arrow on hover.
 */
function MenuRow({ to, label, premium, index }: NavEntry & { index: number }) {
  const { active, locked } = useNavState(to, premium);
  return (
    <NavLink to={to} aria-current={active ? "page" : undefined} className="group relative flex items-baseline gap-4 py-3.5">
      {active && <span className="absolute top-1/2 -left-5 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-[#d3ad66] sm:-left-8" aria-hidden />}
      <span className={cn("w-5 shrink-0 text-[10.5px] font-medium tracking-[0.2em] tabular-nums", active ? "text-[#d3ad66]" : "text-white/30")}>{String(index + 1).padStart(2, "0")}</span>
      <span className={cn("flex-1 font-display text-[25px] leading-none transition-colors", active ? "text-[#f1dcae]" : "text-[#d3ad66] group-hover:text-[#ecd29c]")}>{label}</span>
      {locked ? (
        <span className="inline-flex shrink-0 items-center gap-1 self-center rounded-full border border-[#d3ad66]/45 px-2 py-0.5 text-[9.5px] font-semibold tracking-[0.16em] text-[#e4c486] uppercase">
          <Lock className="size-2.5" strokeWidth={2.25} aria-hidden /> Premium
        </span>
      ) : (
        <ArrowRight
          className={cn("size-4 shrink-0 self-center transition-all", active ? "text-[#d3ad66]" : "-translate-x-1 text-white/0 group-hover:translate-x-0 group-hover:text-white/60")}
          strokeWidth={1.5}
          aria-hidden
        />
      )}
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
    <header className={cn("brand-band sticky top-0 z-30 border-b transition-colors", menuOpen ? "border-transparent" : "border-white/10")}>
      <div className="mx-auto grid h-[72px] max-w-[1360px] grid-cols-[1fr_auto_1fr] items-center gap-6 px-5 sm:px-8">
        <div className="flex items-center gap-7">
          <button className="-ml-1 p-1 text-ink lg:hidden" onClick={() => setMenuOpen((o) => !o)} aria-label={t("Menü", "Menu")} aria-expanded={menuOpen}>
            {menuOpen ? <X className="size-5" strokeWidth={1.5} /> : <Menu className="size-5" strokeWidth={1.5} />}
          </button>
          <nav className="hidden items-center gap-1 lg:flex" aria-label={t("Hauptnavigation", "Main navigation")}>
            {NAV_LEFT.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
          </nav>
        </div>
        <Wordmark />
        <div className="flex items-center justify-end gap-7">
          <nav className="hidden items-center gap-1 lg:flex" aria-label={t("Weitere Bereiche", "More sections")}>
            {NAV_RIGHT.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <button className="p-2 text-ink transition-colors hover:text-accent" onClick={() => setSearchOpen(true)} aria-label={t("Suche öffnen", "Open search")}>
              <Search className="size-[19px]" strokeWidth={1.5} />
            </button>
            <NotificationBell />
            <GuestSignIn />
            <UserMenu />
            <ThemeSwitch />
            <LangSwitch className="ml-1 hidden sm:flex" />
          </div>
        </div>
      </div>
      {menuOpen && (
        // the page behind the open menu, dimmed towards the menu's petrol; a tap on it closes the menu
        <div className="menu-scrim absolute inset-x-0 top-full h-[100dvh] lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden />
      )}
      {menuOpen && (
        // drops out of the header over the page, in the header's own gradient, so the two read as one surface
        <nav
          className="menu-drop brand-band absolute inset-x-0 top-full overflow-hidden rounded-b-panel px-5 pt-2 pb-4 text-white [--color-ink:#f4f1ea] [--color-muted:rgb(255_255_255/0.5)] [--color-faint:rgb(255_255_255/0.3)] sm:px-8 lg:hidden"
          aria-label="Navigation"
        >
          <div className="theme-light-only pointer-events-none absolute -right-24 -bottom-32 size-80 rounded-full bg-[#d3ad66]/[0.09] blur-3xl" aria-hidden />
          <div className="theme-light-only pointer-events-none absolute -bottom-24 -left-24 size-72 rounded-full bg-[#5fb3c2]/[0.08] blur-3xl" aria-hidden />
          <ul className="relative grid md:grid-flow-col md:grid-cols-2 md:grid-rows-3 md:gap-x-10">
            {[...NAV_LEFT, ...NAV_RIGHT].map((n, i) => (
              <li key={n.to} className="menu-row border-b border-white/[0.08]" style={{ animationDelay: `${60 + i * 35}ms` }}>
                <MenuRow {...n} index={i} />
              </li>
            ))}
          </ul>
          <div className="relative flex items-center justify-between pt-3.5 sm:hidden">
            <span className="font-display text-[13px] text-white/40 italic">Cartag</span>
            <LangSwitch />
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
  const [tick, setTick] = useState(0); // bumps when the forum topics for the search arrive
  const input = useRef<HTMLInputElement>(null);
  const lite = !usePlan().premium;
  const hits = useMemo(() => search(q, 9, lite), [q, tick, lite]);
  const ref = useClickOutside(true, onClose);

  useEffect(() => {
    input.current?.focus();
    prepareSearch(() => setTick((n) => n + 1));
  }, []);

  const go = (hit: SearchHit) => {
    navigate(hit.href);
    onClose();
  };

  return (
    <div ref={ref} className="brand-reset animate-fade-in absolute inset-x-0 top-full border-b border-line bg-bg shadow-[0_30px_60px_-30px_rgba(20,20,20,0.22)]">
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
            placeholder={t("Modell, Inserat, Forum, FIN oder Auktions-ID", "Model, listing, forum, VIN or auction ID")}
            className="min-w-0 flex-1 bg-transparent font-display text-[22px] placeholder:text-faint focus:outline-none"
            aria-label={t("Suche", "Search")}
          />
          <button onClick={onClose} aria-label={t("Suche schließen", "Close search")} className="text-muted hover:text-ink">
            <X className="size-5" strokeWidth={1.5} />
          </button>
        </div>
        {q.trim().length >= 2 ? (
          hits.length === 0 ? (
            <p className="py-8 text-center font-display text-muted italic">{t(`Keine Treffer für „${q}“.`, `No results for “${q}”.`)}</p>
          ) : (
            <ul className="mt-3 max-h-[55vh] overflow-y-auto">
              {hits.map((h, i) => (
                <li key={`${i}:${h.href}`}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(h)}
                    onMouseEnter={() => setActive(i)}
                    className={cn("flex w-full items-baseline gap-4 border-b border-line/70 px-1 py-2.5 text-left", i === active && "bg-panel-2")}
                  >
                    <span className="w-20 shrink-0 text-[12.5px] text-faint">{h.kind}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[16px]">{h.label}</span>
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
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const dropdown = "brand-reset animate-fade-in absolute right-0 z-40 mt-2 rounded-box border border-line bg-panel shadow-[0_24px_50px_-20px_rgba(20,20,20,0.22)]";

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { items, unread, read } = useNotifications();
  const { markNotificationsRead } = useStore();
  const ref = useClickOutside(open, () => setOpen(false));
  const navigate = useNavigate();
  const icon = { alert: AlertCircle, sale: TrendingUp };
  return (
    <div className="relative" ref={ref}>
      <button className="relative p-2 text-ink transition-colors hover:text-accent" onClick={() => setOpen((o) => !o)} aria-label={t(`Benachrichtigungen (${unread} ungelesen)`, `Notifications (${unread} unread)`)}>
        <Bell className="size-[19px]" strokeWidth={1.5} />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-red ring-2 ring-menu" />}
      </button>
      {open && (
        <div className={cn(dropdown, "w-[min(92vw,380px)] overflow-hidden")}>
          <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
            <span className="font-display text-[17px]">{t("Benachrichtigungen", "Notifications")}</span>
            <button className="text-[13px] text-muted hover:text-ink disabled:opacity-40" disabled={!unread} onClick={() => markNotificationsRead(items.map((n) => n.id))}>
              {t("Alle gelesen", "Mark all read")}
            </button>
          </div>
          {items.length === 0 ? (
            <div className="px-5 py-8 text-center text-[14px] text-muted">{t("Noch nichts Neues. Preisalarme legen Sie auf der Seite eines Fahrzeugs an.", "Nothing new yet. You can set price alerts on a car's page.")}</div>
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
                      {!read.has(n.id) && <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />}
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
  const ref = useClickOutside(open, () => setOpen(false));
  const me = useMe();
  const plan = usePlan();
  const username = me?.username ?? null;
  const item = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] hover:bg-panel-2";
  return (
    <div className="relative" ref={ref}>
      <button className="p-2 text-ink transition-colors hover:text-accent" onClick={() => setOpen((o) => !o)} aria-label={t("Konto", "Account")}>
        <User className="size-[19px]" strokeWidth={1.5} />
      </button>
      {open && plan.guest && (
        <div className={cn(dropdown, "w-64 py-2")}>
          <div className="px-3 pt-1 pb-2">
            <div className="font-display text-[16px]">{t("Ohne Konto", "No account")}</div>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">{t("Mit kostenlosem Konto behalten Sie Watchlist, Portfolio und Preisalarme.", "A free account keeps your watchlist, portfolio and price alerts.")}</p>
          </div>
          <div className="my-1 border-t border-line" />
          <a href={signInHref(false)} className={item}>
            <LogIn className="size-3.5 text-muted" /> {t("Anmelden", "Sign in")}
          </a>
          <a href={signInHref(true)} className={cn(item, "font-medium text-gold-2")}>
            <UserPlus className="size-3.5 text-gold" /> {t("Kostenlos Konto anlegen", "Create a free account")}
          </a>
        </div>
      )}
      {open && !plan.guest && (
        <div className={cn(dropdown, "w-64 py-2")}>
          <div className="px-3 pt-1 pb-2">
            <div className="flex items-center gap-2">
              <span className="truncate font-display text-[16px]">{username ?? t("Konto", "Account")}</span>
              {plan.ready && (
                <span className={cn("shrink-0 rounded-full px-2 py-px text-[10.5px] font-semibold tracking-[0.1em] uppercase", plan.premium ? "bg-gold-soft text-gold-2" : "bg-panel-3 text-muted")}>
                  {plan.premium ? "Premium" : "Lite"}
                </span>
              )}
            </div>
          </div>
          <div className="my-1 border-t border-line" />
          <Link to="/portfolio" className={item} onClick={() => setOpen(false)}>
            <Briefcase className="size-3.5 text-muted" /> Portfolio
          </Link>
          {plan.premium ? (
            <Link to="/portfolio#melden" className={item} onClick={() => setOpen(false)}>
              <Crown className="size-3.5 text-gold" /> {t("Premium verlängern", "Extend premium")}
            </Link>
          ) : (
            <button
              className={cn(item, "font-medium text-gold-2")}
              onClick={() => {
                setOpen(false);
                plan.openUpgrade("general");
              }}
            >
              <Crown className="size-3.5 text-gold" /> {t("Premium freischalten", "Unlock premium")}
            </button>
          )}
          {me?.admin && (
            <Link to="/pruefung" className={item} onClick={() => setOpen(false)}>
              <ShieldCheck className="size-3.5 text-muted" /> {t("Prüfung", "Review")}
            </Link>
          )}
          {me?.admin && (
            <button
              className={item}
              onClick={() => {
                setImportOpen(true);
                setOpen(false);
              }}
            >
              <Upload className="size-3.5 text-muted" /> {t("Verkäufe importieren (CSV)", "Import sales (CSV)")}
            </button>
          )}
          <div className="my-1 border-t border-line" />
          <Link to="/konto" className={item} onClick={() => setOpen(false)}>
            <Settings className="size-3.5 text-muted" /> {t("Konto und Daten", "Account and data")}
          </Link>
          <button className={item} onClick={signOut}>
            <LogOut className="size-3.5 text-muted" /> {t("Abmelden", "Sign out")}
          </button>
        </div>
      )}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

/** "Anmelden" in the header for a guest, next to the account icon (whose menu also offers creating an account). */
function GuestSignIn() {
  const { guest } = usePlan();
  if (!guest) return null;
  return (
    <a href={signInHref(false)} className="mr-1 hidden rounded-card border border-line-2 px-3 py-1.5 text-[13.5px] font-medium whitespace-nowrap text-ink transition-colors hover:border-accent hover:text-accent md:inline-flex">
      {t("Anmelden", "Sign in")}
    </a>
  );
}

/** Sun / moon: switches between the light and the dark theme (first click leaves the system setting). */
function ThemeSwitch() {
  const { dark, setTheme } = useTheme();
  const label = dark ? t("Helle Darstellung", "Light theme") : t("Dunkle Darstellung", "Dark theme");
  return (
    <button className="p-2 text-ink transition-colors hover:text-accent" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={label} title={label}>
      {dark ? <Sun className="size-[19px]" strokeWidth={1.5} /> : <Moon className="size-[18px]" strokeWidth={1.5} />}
    </button>
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

const footLabel = "text-[11px] tracking-[0.22em] text-faint uppercase";

function Footer() {
  const links = [
    { to: "/", label: t("Start", "Home") },
    { to: "/modelle", label: t("Modelle", "Models") },
    { to: "/auktionen", label: t("Auktionen", "Auctions") },
    { to: "/kaufen", label: t("Kaufen", "Buy") },
    { to: "/insights", label: "Insights" },
    { to: "/ai", label: "Co-Pilot" },
    { to: "/portfolio", label: "Portfolio" },
  ];
  return (
    <footer className="brand-band mt-16 border-t-[3px] border-gold/70">
      <div className="mx-auto grid max-w-[1360px] gap-12 px-5 pt-16 pb-12 sm:px-8 md:grid-cols-[1.2fr_1fr_1.3fr] md:gap-16">
        <div>
          <LogoWordmark height={60} light />
          <span className="mt-6 block h-[3px] w-14 rounded-full bg-[linear-gradient(90deg,var(--color-accent),var(--color-gold))]" aria-hidden="true" />
          <p className="mt-5 max-w-[16rem] font-display text-[16px] leading-relaxed text-muted italic">
            {t("Marktwerte, Verkäufe und Angebote von Sportwagen, vom Klassiker bis zum Neuwagen.", "Market values, sales and listings of sports cars, from classics to new cars.")}
          </p>
        </div>
        <nav aria-label={t("Seiten", "Pages")}>
          <div className={footLabel}>{t("Entdecken", "Explore")}</div>
          <ul className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 text-[14.5px]">
            {links.map((l) => (
              <li key={l.label}>
                <Link to={l.to} className="text-muted transition-colors hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <div className={footLabel}>{t("Daten und Quellen", "Data and sources")}</div>
          <div className="mt-5 space-y-3 text-[13px] leading-relaxed text-muted">
            <p>
              {t(
                `Marktwerte, Verläufe und Verkäufe beruhen auf ${num(N_AUCTIONS)} öffentlichen Auktionsergebnissen (Bring a Trailer, RM Sotheby's, Gooding, Bonhams, Broad Arrow, Artcurial, Mecum, Iconic, Aguttes, Osenat), umgerechnet zum EZB-Kurs des Verkaufstags. Angebote von Classic Trader und Händlern zeigen wir zum Vergleich, sie zählen nicht zum Marktwert.`,
                `Market values, price histories and sales are based on ${num(N_AUCTIONS)} public auction results (Bring a Trailer, RM Sotheby's, Gooding, Bonhams, Broad Arrow, Artcurial, Mecum, Iconic, Aguttes, Osenat), converted at the ECB rate on the day of sale. Listings from Classic Trader and dealers are shown for comparison and do not count towards the market value.`,
              )}
            </p>
            {usdRate() && (
              <p>
                Prices are shown in US dollars, converted from euros at the ECB rate of {date(Date.parse(usdRate()!.date))} (
                {num(usdRate()!.rate, 4)} USD per EUR).
              </p>
            )}
            <Link to="/bildnachweise" className="link inline-block">
              {t("Bildnachweise und Quellen", "Image credits and sources")}
            </Link>
          </div>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line px-5 py-6 text-[12.5px] text-faint sm:px-8">
        <span>© {new Date(AS_OF).getFullYear()} Cartag</span>
        <span className="flex gap-5">
          <Link to="/impressum" className="hover:text-ink">Impressum</Link>
          <Link to="/datenschutz" className="hover:text-ink">{t("Datenschutz", "Privacy")}</Link>
          <span>{t("Keine Anlageberatung.", "Not investment advice.")}</span>
        </span>
      </div>
    </footer>
  );
}

/** `raised`: above the floating premium button of a lite user. */
function Toasts({ raised }: { raised?: boolean }) {
  const { toasts, dismissToast } = useStore();
  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
  return (
    <div className={cn("pointer-events-none fixed right-5 z-[60] flex flex-col gap-2", raised ? "bottom-24" : "bottom-5")}>
      {toasts.map((item) => {
        const Icon = icons[item.tone];
        return (
          <div key={item.id} className="animate-fade-in pointer-events-auto flex items-center gap-3 rounded-tag bg-ink px-4 py-3 text-[14px] text-bg shadow-lg">
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
