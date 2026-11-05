import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { getVariant, variantTitle } from "../data/db";
import { useStore } from "../state/store";
import { Hero } from "../components/market/Hero";
import { ValuePanel } from "../components/market/ValuePanel";
import { MarketsCard, PriceOptionsCard, ProductionCard, SpecsCard } from "../components/market/FactCards";
import { AuctionInsights, RecentSales, Recommendation } from "../components/market/SalesSection";
import { CopilotCard, CyclesCard, ListingsMini, PortfolioMini } from "../components/market/BottomRow";

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
      <div className="panel mx-auto mt-16 max-w-md p-8 text-center">
        <p className="text-muted">Dieses Fahrzeug ist nicht im MOTRKT-Katalog.</p>
        <Link to="/modelle" className="btn btn-gold mt-5">
          Zum Modellkatalog
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4" key={variant.id}>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)]">
        <Hero variant={variant} />
        <ValuePanel variant={variant} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-[1fr_1fr_1.15fr_1fr]">
        <ProductionCard variant={variant} />
        <SpecsCard variant={variant} />
        <MarketsCard variant={variant} />
        <PriceOptionsCard variant={variant} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <RecentSales variant={variant} />
        <AuctionInsights variant={variant} />
        <Recommendation variant={variant} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-[1.2fr_1.05fr_1fr_1fr]">
        <CyclesCard variant={variant} />
        <PortfolioMini />
        <ListingsMini variant={variant} />
        <CopilotCard variant={variant} />
      </div>
    </div>
  );
}
