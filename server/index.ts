import express from "express";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { handleOAuthCallback } from "./_core/oauth";
import { ensureSchema } from "./ensureSchema";

await ensureSchema();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(cookieParser());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// OAuth callback
app.get("/api/oauth/callback", handleOAuthCallback);

// tRPC API
app.use("/api/trpc", createExpressMiddleware({
  router: appRouter,
  createContext,
}));

// Serve frontend (Vite in dev, static in prod)
if (process.env.NODE_ENV === "production") {
  const path = await import("path");
  const { fileURLToPath } = await import("url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  app.use(express.static(path.join(__dirname, "public")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: true,
      allowedHosts: ["all", ".manus.computer", ".manuspre.computer", ".manus-asia.computer", ".manuscomputer.ai", ".manusvm.computer"],
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}/`);
});
