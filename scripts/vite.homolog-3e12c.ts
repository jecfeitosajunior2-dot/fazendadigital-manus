import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";

/** Redireciona o App de produção para o App enxuto da 3E.12C. */
function vitePluginHomologApp(): Plugin {
  const destino = path.resolve(import.meta.dirname, "homolog-3e12c-App.tsx");
  return {
    name: "homolog-3e12c-app",
    enforce: "pre",
    resolveId(source) {
      const texto = String(source).replace(/\\/g, "/");
      if (
        texto === "./App"
        || texto === "./App.tsx"
        || texto.endsWith("/client/src/App")
        || texto.endsWith("/client/src/App.tsx")
      ) {
        return destino;
      }
      return null;
    },
  };
}

/** Vite exclusivo da 3E.12C. */
function vitePluginStorageProxy(): Plugin {
  return {
    name: "manus-storage-proxy-3e12c",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/manus-storage", (_req, res) => {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      });
    },
  };
}

export default defineConfig({
  plugins: [vitePluginHomologApp(), react(), tailwindcss(), vitePluginStorageProxy()],
  optimizeDeps: {
    include: [
      "react",
      "react/jsx-dev-runtime",
      "react-dom/client",
      "@trpc/client",
      "@trpc/react-query",
      "@tanstack/react-query",
      "superjson",
      "wouter",
      "sonner",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../client/src"),
      "@shared": path.resolve(import.meta.dirname, "../shared"),
      [path.resolve(import.meta.dirname, "../client/src/App.tsx")]: path.resolve(import.meta.dirname, "homolog-3e12c-App.tsx"),
    },
  },
  root: path.resolve(import.meta.dirname, "../client"),
  publicDir: path.resolve(import.meta.dirname, "../client", "public"),
  envDir: path.resolve(import.meta.dirname, ".."),
  server: {
    port: 5174,
    strictPort: true,
    host: "127.0.0.1",
    hmr: false,
    watch: { ignored: ["**"] },
    warmup: {
      clientFiles: [
        "./src/main.tsx",
        "./src/pages/LoginPage.tsx",
        "./src/pages/NovaVendaPage.tsx",
      ],
    },
    allowedHosts: true,
    fs: {
      strict: false,
      allow: [path.resolve(import.meta.dirname, "..")],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3102",
        changeOrigin: true,
      },
    },
  },
});
