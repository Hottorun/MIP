import { useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
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
import { SectionNav, type NavItem } from "../components/market/SectionNav";
import { appTitle, t } from "../i18n";

const NAV: NavItem[] = [
  { id: "wert", label: () => t("Wertentwicklung", "Value history") },
  { id: "zahlen", label: () => t("Markt in Zahlen", "Market in figures") },
  { id: "verkaeufe", label: () => t("Verkäufe", "Sales") },
  { id: "einschaetzung", label: () => t("Einschätzung", "Assessment") },
  { id: "nachweis", label: () => t("Belege", "Evidence") },
  { id: "daten", label: () => t("Daten und Ausstattung", "Data and equipment") },
  { id: "angebote", label: () => t("Angebote", "Listings") },
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
      document.title = `${variantTitle(variant)} – MIP`;
    }
    return () => {
      document.title = appTitle();
    };
  }, [variant, setLastVariant]);

  if (!variant) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="font-display text-3xl">{t("Nicht im Katalog", "Not in the catalogue")}</h1>
        <p className="mt-3 text-muted">
          {t("Dieses Fahrzeug führen wir nicht. Im Modellkatalog findest du alle erfassten Varianten.", "We don’t cover this car. The model catalogue lists every variant we track.")}
        </p>
        <Link to="/modelle" className="btn btn-gold mt-8">
          {t("Zum Modellkatalog", "Go to the model catalogue")}
        </Link>
      </div>
    );
  }

  // Old link of a former variant (e.g. GT3 Touring) → the variant it now belongs to.
  if (variantId !== variant.id) return <Navigate to={`/markt/${variant.id}`} replace />;

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
  return (
    <div className="space-y-20">
      <Hero variant={variant} picked={picked} body={body} onBody={setBody} />
      <SectionNav items={NAV} deps={`${variant.id}-${body}`} />
      <div id="wert">
        <ValuePanel variant={variant} body={body} />
      </div>
      <Band id="zahlen">
        <MarketStats variant={variant} body={body} />
      </Band>
      <div className="grid grid-cols-1 gap-x-16 gap-y-20 lg:grid-cols-2">
        <div id="verkaeufe" className="min-w-0">
          <RecentSales variant={variant} body={body} />
        </div>
        <div id="einschaetzung" className="min-w-0">
          <Assessment variant={variant} />
        </div>
      </div>
      <Band id="nachweis">
        <Evidence variant={variant} body={body} />
      </Band>
      <div id="daten">
        <Details variant={variant} picked={picked} onPick={setPicked} />
      </div>
      {/* Werksfarben (PaintChart) vorerst ausgeblendet; die Daten in paints.json bleiben erhalten. */}
      <Band id="angebote">
        <Listings variant={variant} body={body} />
      </Band>
    </div>
  );
}
