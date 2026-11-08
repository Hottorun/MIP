import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { getVariant, variantTitle } from "../data/db";
import { useStore } from "../state/store";
import { Hero } from "../components/market/Hero";
import { ValuePanel } from "../components/market/ValuePanel";
import { Details } from "../components/market/FactCards";
import { Assessment, RecentSales } from "../components/market/SalesSection";
import { Listings } from "../components/market/BottomRow";

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
      document.title = "MOTRKT – Marktintelligenz für klassische Sportwagen";
    };
  }, [variant, setLastVariant]);

  if (!variant) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="font-display text-3xl">Nicht im Katalog</h1>
        <p className="mt-3 text-muted">Dieses Fahrzeug führen wir nicht. Im Modellkatalog findest du alle erfassten Varianten.</p>
        <Link to="/modelle" className="btn btn-gold mt-8">
          Zum Modellkatalog
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-24" key={variant.id}>
      <Hero variant={variant} />
      <ValuePanel variant={variant} />
      <div className="grid grid-cols-1 gap-x-16 gap-y-24 lg:grid-cols-2">
        <RecentSales variant={variant} />
        <Assessment variant={variant} />
      </div>
      <Details variant={variant} />
      <Listings variant={variant} />
    </div>
  );
}
