import express from "express";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { handleOAuthCallback } from "./_core/oauth";
import { clearAuthCookie } from "./_core/cookies";
import { ensureSchema } from "./ensureSchema";
import mysql from "mysql2/promise";
import { env } from "./_core/env";

let databaseAvailable = false;

try {
  await ensureSchema();
  databaseAvailable = true;
} catch (err) {
  databaseAvailable = false;
  console.error(
    "[startup] Banco de dados indisponível. O servidor web continuará ativo, mas operações que salvam/listam dados vão falhar até o MySQL estar ligado.",
    err
  );
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(cookieParser());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// OAuth callback
app.get("/api/oauth/callback", handleOAuthCallback);

// Logout direto — limpa cookie e redireciona (funciona mesmo sem JS no cliente)
app.get("/api/auth/logout", (_req, res) => {
  clearAuthCookie(res);
  res.redirect(302, "/entrar");
});

app.get("/api/health", async (_req, res) => {
  try {
    const connection = await mysql.createConnection(env.DATABASE_URL);
    await connection.ping();
    await connection.end();
    databaseAvailable = true;
    res.json({ ok: true, database: "online" });
  } catch (err) {
    databaseAvailable = false;
    res.status(503).json({
      ok: false,
      database: "offline",
      message: "Banco de dados local indisponível. Ligue o MySQL/Docker para salvar e consultar dados.",
    });
  }
});

app.use("/api", (_req, res, next) => {
  res.setHeader("X-Fazenda-Digital-Database", databaseAvailable ? "online" : "offline");
  next();
});

// tRPC API
app.use("/api/trpc", createExpressMiddleware({
  router: appRouter,
  createContext,
}));

// Serve frontend (Vite in dev, static in prod)
if (process.env.NODE_ENV === "production") {
  const path = await import("path");
  const fs = await import("fs");
  const { fileURLToPath } = await import("url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const bundledPublicDir = path.join(__dirname, "public");
  const sourcePublicDir = path.resolve(__dirname, "..", "dist", "public");
  const publicDir = fs.existsSync(bundledPublicDir) ? bundledPublicDir : sourcePublicDir;
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    configLoader: "runner",
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
