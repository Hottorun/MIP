import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Building2, Car, Gem, Landmark, Watch, type LucideIcon } from "lucide-react";
import { pickAd, type AdCategory } from "../../data/ads";
import { usePlan } from "../../lib/plan";
import { cn } from "../../lib/format";
import { isEn, t } from "../../i18n";
import { OPERATOR } from "../../legal";
import { LogoWordmark } from "../LogoMark";

/**
 * One ad under a locked premium block of the lite version (data/ads.ts). Marked "Anzeige" / "Advertisement", no
 * scripts, no cookies, no counting: a self-hosted picture and a link that leaves without a referrer. Premium sees none.
 */

const ICON: Record<AdCategory, LucideIcon> = { watches: Watch, automotive: Car, realestate: Building2, finance: Landmark, lifestyle: Gem };

/** Where a house ad leads: a mail to the operator, or the imprint while the address is not filled in. */
const contact = () => (OPERATOR.email ? `mailto:${OPERATOR.email}?subject=${encodeURIComponent(t("Werbepartnerschaft Cartag", "Cartag advertising partnership"))}` : "/impressum");

// the slots of the page on screen, counted from the top in the order they mount, so neighbours take turns
let page = "";
let count = 0;
const nextSlot = (pathname: string) => {
  if (pathname !== page) {
    page = pathname;
    count = 0;
  }
  return count++;
};

export function AdSlot({ className }: { className?: string }) {
  const { premium } = usePlan();
  const { pathname } = useLocation();
  const [slot] = useState(() => nextSlot(pathname));
  const ad = useMemo(() => pickAd(pathname, slot), [pathname, slot]);
  if (premium || !ad) return null;

  const lang = isEn() ? "en" : "de";
  const Icon = ICON[ad.category];
  const house = !ad.href;
  const href = ad.href || contact();
  const body = (
    <>
      <span className="ad-label">{t("Anzeige", "Advertisement")}</span>
      {ad.image ? (
        <img src={ad.image} alt="" loading="lazy" decoding="async" className="ad-media object-cover" />
      ) : (
        <span className="ad-media grid place-items-center" aria-hidden>
          <Icon className="size-6 text-[#e4c486]" strokeWidth={1.3} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.16em] text-[#e4c486]/85 uppercase">
          {house ? <LogoWordmark height={17} light className="-my-1 opacity-90" /> : ad.partner}
        </span>
        <span className="mt-1 block font-display text-[19px] leading-tight text-[#f4efe5] sm:text-[21px]">{ad.headline[lang]}</span>
        <span className="mt-1 block text-[13px] leading-snug text-[#f4efe5]/70">{ad.text[lang]}</span>
      </span>
      <span className="ad-cta">
        {ad.cta[lang]}
        <ArrowUpRight className="size-3.5 shrink-0 transition-transform group-hover/ad:translate-x-0.5 group-hover/ad:-translate-y-0.5" aria-hidden />
      </span>
    </>
  );

  const cls = cn("ad-slot group/ad", className);
  // a house ad on the own imprint stays in the app; anything else is a plain link out
  if (href.startsWith("/"))
    return (
      <Link to={href} rel="sponsored" className={cls} aria-label={`${t("Anzeige", "Advertisement")}: ${ad.headline[lang]}`}>
        {body}
      </Link>
    );
  return (
    <a
      href={href}
      target={href.startsWith("mailto:") ? undefined : "_blank"}
      rel="sponsored noopener noreferrer"
      referrerPolicy="no-referrer"
      className={cls}
      aria-label={`${t("Anzeige", "Advertisement")}: ${ad.partner}, ${ad.headline[lang]}`}
    >
      {body}
    </a>
  );
}
