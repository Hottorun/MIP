import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { StoreProvider } from "./state/store";
import { LiveListingsProvider } from "./state/liveListings";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <LiveListingsProvider>
          <App />
        </LiveListingsProvider>
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
