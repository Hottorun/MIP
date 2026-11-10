import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { handleApi } from "./server/api.ts";
import { authGate, enableDemoAccount } from "./server/auth.ts";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "motrkt-api",
      configureServer(server) {
        if (process.env.MOTRKT_DEMO_ACCOUNT !== "0") enableDemoAccount();
        // sign-in first: without a session nothing of the app is served
        server.middlewares.use((req, res, next) => {
          authGate(req, res)
            .then((handled) => {
              if (handled) return;
              if (!req.url?.startsWith("/api/")) return next();
              return handleApi(req, res);
            })
            .catch(next);
        });
      },
    },
  ],
});
