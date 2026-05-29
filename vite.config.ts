import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    rollupOptions: {
      external: ["@tanstack/query-core"],
    },
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // Correção emergencial: gera um Service Worker autodestrutivo para remover
    // versões antigas que ficaram presas no navegador e bloqueiam login/cadastro.
    VitePWA({
      selfDestroying: true,
      injectRegister: null,
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "robots.txt"],
      manifest: {
        name: "Fazenda Digital",
        short_name: "Fazenda",
        description: "Gestão pecuária no campo, com ou sem sinal.",
        theme_color: "#1B4332",
        background_color: "#1B4332",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/favicon.ico", sizes: "64x64", type: "image/x-icon" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,ico,webp}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: "/index.html",
        // Não intercepta rotas internas da Lovable (OAuth, preview helpers).
        navigateFallbackDenylist: [/^\/~/, /^\/api\//],
        runtimeCaching: [
          {
            // tRPC: tenta rede primeiro; se falhar, devolve último cache.
            urlPattern: /\/api\/trpc\/.*/,
            handler: "NetworkFirst",
            options: {
              cacheName: "trpc-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Imagens externas (avatares, fotos) — cache longo.
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: {
        // Mantém SW desligado em dev para não atrapalhar HMR.
        enabled: false,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
