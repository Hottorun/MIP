import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { getVariant, variantTitle } from "../data/db";
import type { Variant } from "../data/types";
import { useStore } from "../state/store";
import { Hero } from "../components/market/Hero";
import { ValuePanel } from "../components/market/ValuePanel";
import { Details } from "../components/market/FactCards";
import { Assessment, RecentSales } from "../components/market/SalesSection";
import { Listings } from "../components/market/BottomRow";
import { Evidence } from "../components/market/Evidence";
import { appTitle, t } from "../i18n";

export default function Market() {
  const { variantId } = useParams();
  const variant = getVariant(variantId);
  const { setLastVariant } = useStore();

  useEffect(() => {
    if (variant) {
      setLastVariant(variant.id);
      document.title = `${variantTitle(variant)} – MOTRKT`;
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
  return (
    <div className="space-y-24">
      <Hero variant={variant} picked={picked} />
      <ValuePanel variant={variant} />
      <div className="grid grid-cols-1 gap-x-16 gap-y-24 lg:grid-cols-2">
        <RecentSales variant={variant} />
        <Assessment variant={variant} />
      </div>
      <Evidence variant={variant} />
      <Details variant={variant} picked={picked} onPick={setPicked} />
      <Listings variant={variant} />
    </div>
  );
}
