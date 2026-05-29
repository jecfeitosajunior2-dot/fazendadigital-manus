import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  root: path.resolve(__dirname, "client"),
  plugins: [react(), tailwindcss(), jsxLocPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
    },
  },
  server: {
    port: 3000,
    strictPort: false,
    host: true,
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    rollupOptions: {
      external: ["@tanstack/query-core"],
    },
  },
});
