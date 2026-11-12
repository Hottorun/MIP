import { useEffect, useState } from "react";
import { cn } from "../../lib/format";
import { t } from "../../i18n";

export type NavItem = { id: string; label: () => string };

/** Height of the sticky site header plus this bar: sections scroll to just below both. */
const OFFSET = 72 + 52;

/**
 * Table of contents of the market page that stays under the header while scrolling: shows where you are and jumps
 * to a section. Only sections that are on the page (some are hidden without data) get an entry.
 */
export function SectionNav({ items, deps }: { items: NavItem[]; deps?: unknown }) {
  const [shown, setShown] = useState<NavItem[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const present = items.filter((i) => {
      const el = document.getElementById(i.id);
      return el && el.offsetHeight > 0;
    });
    setShown(present);
    const onScroll = () => {
      let cur: string | null = null;
      for (const i of present) {
        const el = document.getElementById(i.id);
        if (el && el.getBoundingClientRect().top <= OFFSET + 24) cur = i.id;
      }
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps]);

  // Keep the active entry visible in the bar on narrow screens.
  useEffect(() => {
    const link = active ? document.getElementById(`nav-${active}`) : null;
    const bar = link?.parentElement;
    if (!link || !bar) return;
    const l = link.offsetLeft - 20, r = link.offsetLeft + link.offsetWidth + 20;
    if (l < bar.scrollLeft) bar.scrollTo({ left: l, behavior: "smooth" });
    else if (r > bar.scrollLeft + bar.clientWidth) bar.scrollTo({ left: r - bar.clientWidth, behavior: "smooth" });
  }, [active]);

  if (shown.length < 2) return null;
  return (
    <nav aria-label={t("Auf dieser Seite", "On this page")} className="hero-bleed sticky top-[72px] z-20 !mb-10 border-b border-line bg-bg/95 backdrop-blur-sm">
      <div className="relative mx-auto flex h-[52px] max-w-[1360px] items-center gap-1 overflow-x-auto px-5 [scrollbar-width:none] sm:px-8">
        <span className="mr-3 hidden shrink-0 text-[13px] text-faint lg:inline">{t("Auf dieser Seite", "On this page")}</span>
        {shown.map((i, n) => (
          <a
            key={i.id}
            id={`nav-${i.id}`}
            href={`#${i.id}`}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(i.id);
              if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - OFFSET, behavior: "smooth" });
            }}
            aria-current={active === i.id ? "location" : undefined}
            className={cn(
              "shrink-0 rounded-[3px] px-2.5 py-1.5 text-[13.5px] whitespace-nowrap transition-colors",
              active === i.id ? "bg-ink text-bg" : "text-muted hover:bg-panel-3 hover:text-ink",
            )}
          >
            <span className={cn("mr-1.5 tabular-nums", active === i.id ? "text-bg/60" : "text-faint")}>{n + 1}</span>
            {i.label()}
          </a>
        ))}
      </div>
    </nav>
  );
}
