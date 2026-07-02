import type { Application } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { handleOAuthCallback } from "./_core/oauth";
import { clearAuthCookie } from "./_core/cookies";
import { registerManusStorageProxy } from "./_core/manusStorageProxy";
import { mountLocalManusStorage } from "./_core/localManusStorage";
import { createMysqlPool } from "./_core/mysqlPool";

export function registerRoutes(app: Application, databaseAvailable: { value: boolean }) {
  if (process.env.VERCEL === "1") {
    registerManusStorageProxy(app);
  } else {
    mountLocalManusStorage(app);
    registerManusStorageProxy(app);
  }

  app.get("/api/oauth/callback", handleOAuthCallback);

  app.get("/api/auth/logout", (_req, res) => {
    clearAuthCookie(res);
    res.redirect(302, "/entrar");
  });

  app.get("/api/health", async (_req, res) => {
    try {
      const pool = createMysqlPool(1);
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();
      await pool.end();
      databaseAvailable.value = true;
      res.json({ ok: true, database: "online" });
    } catch {
      databaseAvailable.value = false;
      res.status(503).json({
        ok: false,
        database: "offline",
        message: "Banco de dados indisponível.",
      });
    }
  });

  app.use("/api", (_req, res, next) => {
    res.setHeader("X-Fazenda-Digital-Database", databaseAvailable.value ? "online" : "offline");
    next();
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
}
