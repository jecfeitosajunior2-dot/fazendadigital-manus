import type { Application } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { handleOAuthCallback } from "./_core/oauth";
import { registerManusStorageProxy } from "./_core/manusStorageProxy";

export function registerRoutes(app: Application) {
  registerManusStorageProxy(app);
  app.get("/api/oauth/callback", handleOAuthCallback);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
}
