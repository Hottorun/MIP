import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { bodyChoices, getVariant, variantTitle } from "../data/db";
import type { Body, Variant } from "../data/types";
import { useStore } from "../state/store";
import { Hero } from "../components/market/Hero";
import { ValuePanel } from "../components/market/ValuePanel";
import { Details } from "../components/market/FactCards";
import { Assessment, RecentSales } from "../components/market/SalesSection";
import { Listings } from "../components/market/BottomRow";
import { Evidence } from "../components/market/Evidence";
import { MarketStats } from "../components/market/MarketStats";
import { Forum } from "../components/market/Forum";
import { SectionNav, type NavItem } from "../components/market/SectionNav";
import { appTitle, t } from "../i18n";
import { Lock } from "../components/premium/Locked";
import { getSales } from "../data/generate";
import { marketBasis } from "../data/real/model";
import { num } from "../lib/format";

const NAV: NavItem[] = [
  { id: "wert", label: () => t("Wertentwicklung", "Value history") },
  { id: "zahlen", label: () => t("Markt in Zahlen", "Market in figures") },
  { id: "verkaeufe", label: () => t("Verkäufe", "Sales") },
  { id: "einschaetzung", label: () => t("Einschätzung", "Assessment") },
  { id: "nachweis", label: () => t("Belege", "Evidence") },
  { id: "daten", label: () => t("Daten und Ausstattung", "Data and equipment") },
  { id: "angebote", label: () => t("Angebote", "Listings") },
  { id: "forum", label: () => t("Forum", "Forum") },
];

/** Full-width tinted band: every other block of the page sits on it, so the long page reads in clear parts. */
function Band({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div id={id} className="hero-bleed border-y border-line bg-panel has-[>div:empty]:hidden">
      <div className="mx-auto max-w-[1360px] px-5 py-14 empty:hidden sm:px-8 sm:py-16">{children}</div>
    </div>
  );
}


export default function Market() {
  const { variantId } = useParams();
  const variant = getVariant(variantId);
  const { setLastVariant } = useStore();

  useEffect(() => {
    if (variant) {
      setLastVariant(variant.id);
      document.title = `${variantTitle(variant)} – Carbay`;
    }
    return () => {
      document.title = appTitle();
    };
  }, [variant, setLastVariant]);

  // "#forum" etc. in the address (links from the forum overview, the search): scroll there once the page is up;
  // after the layout's own scroll to the top, hence the delay
  const { hash, search } = useLocation();
  useEffect(() => {
    if (!hash || !variant) return;
    const id = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    return () => window.clearTimeout(id);
  }, [hash, variant]);

  if (!variant) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="font-display text-3xl">{t("Nicht im Katalog", "Not in the catalogue")}</h1>
        <p className="mt-3 text-muted">
          {t("Dieses Fahrzeug führen wir nicht. Im Modellkatalog finden Sie alle erfassten Varianten.", "We don’t cover this car. The model catalogue lists every variant we track.")}
        </p>
        <Link to="/modelle" className="btn btn-gold mt-8">
          {t("Zum Modellkatalog", "Go to the model catalogue")}
        </Link>
      </div>
    );
  }

  // Old link of a former variant (e.g. GT3 Touring) → the variant it now belongs to.
  // Keeps ?thema=… and #forum of a forum link.
  if (variantId !== variant.id) return <Navigate to={`/markt/${variant.id}${search}${hash}`} replace />;

  return <MarketPage key={variant.id} variant={variant} />;
}

/** Keyed by variant, so the option selection starts empty for every car. */
function MarketPage({ variant }: { variant: Variant }) {
  const [picked, setPicked] = useState<string[]>([]);
  // Body switcher (Coupé, Cabriolet, Targa …): kept in the URL (?karosserie=cabriolet) so a view can be shared.
  const [params, setParams] = useSearchParams();
  const choices = bodyChoices(variant);
  const body = choices.find((b) => b.toLowerCase().replace("é", "e") === params.get("karosserie")) ?? null;
  const setBody = (b: Body | null) =>
    setParams(
      (p) => {
        if (b) p.set("karosserie", b.toLowerCase().replace("é", "e"));
        else p.delete("karosserie");
        return p;
      },
      { replace: true, preventScrollReset: true },
    );
  // Lite (src/lib/plan.tsx): the market value in the hero is free. Each analysis below keeps its heading and says in
  // one line what is behind the blur, with this car's own numbers where there are any. The listings and the forum
  // stay open: they are the free parts of the app (Buy, community) and the reason to come back to this page.
  const nSales = getSales(variant.id).length;
  const nRecords = marketBasis(variant.id)?.n ?? 0;
  return (
    <div className="space-y-20">
      <Hero variant={variant} picked={picked} body={body} onBody={setBody} />
      <SectionNav items={NAV} deps={`${variant.id}-${body}`} />
      <div id="wert">
        <Lock reason="history" teaser={t("Der Wertverlauf seit 2015, Woche für Woche", "The value history since 2015, week by week")}>
          <ValuePanel variant={variant} body={body} />
        </Lock>
      </div>
      <Band id="zahlen">
        <Lock reason="figures" teaser={t("Laufleistungen, Märkte und Karosserien dieser Variante", "Mileages, markets and body styles of this variant")} height={240}>
          <MarketStats variant={variant} body={body} />
        </Lock>
      </Band>
      <div className="grid grid-cols-1 gap-x-16 gap-y-20 lg:grid-cols-2">
        <div id="verkaeufe" className="min-w-0">
          <Lock
            reason="sales"
            teaser={
              nSales > 1
                ? t(`${num(nSales)} Verkäufe mit Preis, Laufleistung und Auktionshaus`, `${num(nSales)} sales with price, mileage and auction house`)
                : t("Verkäufe mit Preis, Laufleistung und Auktionshaus", "Sales with price, mileage and auction house")
            }
          >
            <RecentSales variant={variant} body={body} />
          </Lock>
        </div>
        <div id="einschaetzung" className="min-w-0">
          <Lock reason="assessment" teaser={t("Kaufen, halten oder beobachten? Unsere Einschätzung", "Buy, hold or watch? Our assessment")}>
            <Assessment variant={variant} />
          </Lock>
        </div>
      </div>
      <Band id="nachweis">
        <Lock
          reason="evidence"
          teaser={
            nRecords > 1
              ? t(`Die ${num(nRecords)} Belege hinter dem Marktwert, jeder einzeln`, `The ${num(nRecords)} records behind the market value, one by one`)
              : t("Die Belege hinter dem Marktwert, jeder einzeln", "The records behind the market value, one by one")
          }
          height={240}
        >
          <Evidence variant={variant} body={body} />
        </Lock>
      </Band>
      <div id="daten">
        <Lock reason="options" teaser={t("Technische Daten und was jede Option am Wert ändert", "Specifications and what each option adds to the value")} height={240}>
          <Details variant={variant} picked={picked} onPick={setPicked} />
        </Lock>
      </div>
      {/* Werksfarben (PaintChart) vorerst ausgeblendet; die Daten in paints.json bleiben erhalten. */}
      <Band id="angebote">
        <Listings variant={variant} body={body} />
      </Band>
      <div id="forum">
        <Forum variant={variant} />
      </div>
    </div>
  );
}
