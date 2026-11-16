import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { StoreProvider } from "./state/store";
import { LiveListingsProvider } from "./state/liveListings";
import { App } from "./App";
import { LangProvider } from "./i18n";

/** Renders the app. Imported by main.tsx only after the market data is loaded (src/data/real/dataset.ts). */
export function start(root: HTMLElement) {
  root.replaceChildren();
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <StoreProvider>
          <LiveListingsProvider>
            <LangProvider>
              <App />
            </LangProvider>
          </LiveListingsProvider>
        </StoreProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
