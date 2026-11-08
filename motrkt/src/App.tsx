import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useStore } from "./state/store";
const Overview = lazy(() => import("./pages/Overview"));
const Market = lazy(() => import("./pages/Market"));
const Models = lazy(() => import("./pages/Models"));
const Auctions = lazy(() => import("./pages/Auctions"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Insights = lazy(() => import("./pages/Insights"));
const Buy = lazy(() => import("./pages/Buy"));
const AiPage = lazy(() => import("./pages/AiPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Credits = lazy(() => import("./pages/Credits"));

function MarketRedirect() {
  const { lastVariantId } = useStore();
  return <Navigate to={`/markt/${lastVariantId}`} replace />;
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="markt" element={<MarketRedirect />} />
        <Route path="markt/:variantId" element={<Market />} />
        <Route path="modelle" element={<Models />} />
        <Route path="auktionen" element={<Auctions />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="insights" element={<Insights />} />
        <Route path="kaufen" element={<Buy />} />
        <Route path="ai" element={<AiPage />} />
        <Route path="bildnachweise" element={<Credits />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
