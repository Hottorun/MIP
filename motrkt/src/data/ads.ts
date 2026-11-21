/**
 * Advertising in the lite version (guest and free account). Where a premium block is locked and blurred
 * (components/premium/Locked.tsx), an ad from this list sits under it; premium has none. The upgrade pill stays, the
 * ad only adds to it.
 *
 * Rules for every entry:
 * - Marked as an ad on the page ("Anzeige" / "Advertisement"), done by components/premium/AdSlot.tsx.
 * - No tracking, no scripts or pixels of the partner, no cookies: an ad is a self-hosted picture (public/ads/), a text
 *   and a plain link that is followed only on a click (rel="sponsored noopener noreferrer", no referrer). Nothing is
 *   counted or sent while the ad is shown. Should that ever change (counting views or clicks, a partner's server),
 *   the privacy notice (src/legal.ts, DATENSCHUTZ.md) has to say so first.
 * - Real brands, logos or photos only with a signed agreement. Until then the house ads below invite partners.
 */

export type AdCategory = "watches" | "automotive" | "realestate" | "finance" | "lifestyle";

type Text = { de: string; en: string };

export type Ad = {
  id: string;
  category: AdCategory;
  /** who the ad is for, shown on the ad */
  partner: string;
  headline: Text;
  text: Text;
  /** the words of the link */
  cta: Text;
  /** the partner's page; empty for a house ad, which leads to our contact address */
  href?: string;
  /** a self-hosted picture under public/ (e.g. "/ads/partner-2027.webp"), never a partner's server */
  image?: string;
  /** first and last day the ad runs (ISO dates, inclusive); open where empty */
  from?: string;
  until?: string;
};

/** Ads of partners under contract. None yet: the house ads below stand in. */
export const PARTNER_ADS: Ad[] = [];

/** Invitations to become a partner, one for each kind of partner, while no partner ad of that kind runs. */
export const HOUSE_ADS: Ad[] = [
  {
    id: "house-watches",
    category: "watches",
    partner: "Cartag",
    headline: { de: "Ihre Uhrenmanufaktur hier", en: "Your watch manufacture here" },
    text: {
      de: "Zeitmesser dort zeigen, wo Sammler Werte vergleichen: neben den Modellen, die sie verfolgen.",
      en: "Show timepieces where collectors compare values: next to the models they follow.",
    },
    cta: { de: "Werbepartner werden", en: "Become a partner" },
  },
  {
    id: "house-automotive",
    category: "automotive",
    partner: "Cartag",
    headline: { de: "Ihre Automarke hier", en: "Your marque here" },
    text: {
      de: "Erreichen Sie Sportwagenkäufer genau bei dem Modell, für das sie sich gerade interessieren.",
      en: "Reach sports car buyers at the very model they are looking at.",
    },
    cta: { de: "Werbepartner werden", en: "Become a partner" },
  },
  {
    id: "house-realestate",
    category: "realestate",
    partner: "Cartag",
    headline: { de: "Ihre Immobilie hier", en: "Your property here" },
    text: {
      de: "Anwesen, Garagenvillen und Stadthäuser für ein Publikum mit Sinn für Seltenes.",
      en: "Estates, garage villas and town houses for an audience with a feel for the rare.",
    },
    cta: { de: "Werbepartner werden", en: "Become a partner" },
  },
  {
    id: "house-finance",
    category: "finance",
    partner: "Cartag",
    headline: { de: "Ihr Private Banking hier", en: "Your private banking here" },
    text: {
      de: "Vermögensverwaltung und Versicherung für Sammlungen, die an Wert gewinnen.",
      en: "Wealth management and insurance for collections that gain in value.",
    },
    cta: { de: "Werbepartner werden", en: "Become a partner" },
  },
  {
    id: "house-lifestyle",
    category: "lifestyle",
    partner: "Cartag",
    headline: { de: "Ihre Marke hier", en: "Your brand here" },
    text: {
      de: "Yachten, Reisen, Kunst: Anzeigen für Liebhaber des Besonderen, ohne Tracking.",
      en: "Yachts, travel, art: ads for lovers of the exceptional, without tracking.",
    },
    cta: { de: "Werbepartner werden", en: "Become a partner" },
  },
];

/** Which kinds of partner fit which page, most fitting first. */
const BY_PAGE: [prefix: string, categories: AdCategory[]][] = [
  ["/markt", ["watches", "automotive"]],
  ["/modelle", ["automotive", "watches"]],
  ["/auktionen", ["automotive", "watches", "lifestyle"]],
  ["/portfolio", ["finance", "realestate"]],
  ["/insights", ["finance", "realestate", "watches"]],
  ["/ai", ["finance", "watches"]],
];
const ALL: AdCategory[] = ["watches", "automotive", "realestate", "finance", "lifestyle"];

export function categoriesFor(pathname: string): AdCategory[] {
  return BY_PAGE.find(([p]) => pathname === p || pathname.startsWith(`${p}/`))?.[1] ?? ALL;
}

/** Whether an ad runs on this day (dates compared as local days). */
export function running(ad: Ad, now: Date): boolean {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return (!ad.from || ad.from <= day) && (!ad.until || day <= ad.until);
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/**
 * The ad for one slot: the partner ads that run today in the kinds that fit the page, otherwise the house ads of those
 * kinds. `slot` counts the slots of one page from the top, so neighbours show the next ad in turn; where the turn
 * starts changes once a day and per page.
 */
export function pickAd(pathname: string, slot: number, now = new Date(), partners: Ad[] = PARTNER_ADS, house: Ad[] = HOUSE_ADS): Ad | null {
  const fits = categoriesFor(pathname);
  const live = partners.filter((a) => fits.includes(a.category) && running(a, now));
  const pool = live.length ? live : house.filter((a) => fits.includes(a.category));
  if (!pool.length) return null;
  const day = Math.floor(now.getTime() / 86_400_000);
  return pool[(hash(`${pathname}|${day}`) + slot) % pool.length];
}
