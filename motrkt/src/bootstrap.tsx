import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { StoreProvider } from "./state/store";
import { LiveListingsProvider } from "./state/liveListings";
import { App } from "./App";
import { LangProvider } from "./i18n";
import { PlanProvider } from "./lib/plan";

/**
 * Page views for Vercel Web Analytics and the loading times for Vercel Speed Insights carry the path only: what
 * follows "?" or "#" (filters, the marks of a returning payment, src/lib/plan.tsx) stays in the browser.
 */
const pathOnly = <E extends { url: string }>(event: E): E => ({ ...event, url: event.url.split(/[?#]/)[0] });

/** Renders the app. Imported by main.tsx only after the market data is loaded (src/data/real/dataset.ts). */
export function start(root: HTMLElement) {
  root.replaceChildren();
  createRoot(root).render(
    <StrictMode>
      {/* Counts page views without cookies (Vercel Web Analytics, see src/legal.ts). Its script and its requests
          stay on this origin (/_vercel/insights/…), so the content-security policy (server/app.ts) needs no
          exception. Only in the built app: the development script would load from another host. */}
      {import.meta.env.PROD && <Analytics mode="production" beforeSend={pathOnly} />}
      {/* Measures how fast the pages load and react (Core Web Vitals; Vercel Speed Insights, see src/legal.ts), also
          without cookies and from this origin (/_vercel/speed-insights/…). */}
      {import.meta.env.PROD && <SpeedInsights beforeSend={pathOnly} />}
      <BrowserRouter>
        <StoreProvider>
          <LiveListingsProvider>
            {/* outside the language provider, which remounts everything below it on a language switch */}
            <PlanProvider>
              <LangProvider>
                <App />
              </LangProvider>
            </PlanProvider>
          </LiveListingsProvider>
        </StoreProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
