import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { handleApi } from "./server/api.ts";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "motrkt-api",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith("/api/")) return next();
          handleApi(req, res).catch(next);
        });
      },
    },
  ],
});
