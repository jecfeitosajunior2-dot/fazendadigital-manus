import express, { type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { ensureSchema } from "./ensureSchema";
import { registerRoutes } from "./registerRoutes";

let apiAppPromise: Promise<express.Express> | null = null;
let appPromise: Promise<express.Express> | null = null;

export function getApiApp(): Promise<express.Express> {
  if (!apiAppPromise) {
    apiAppPromise = createApiApp();
  }
  return apiAppPromise;
}

export function getApp(): Promise<express.Express> {
  if (!appPromise) {
    appPromise = createApp();
  }
  return appPromise;
}

async function createApiApp(): Promise<express.Express> {
  await ensureSchema();

  const app = express();
  app.set("trust proxy", 1);
  app.use(cookieParser());
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));
  registerRoutes(app);
  return app;
}

async function createApp(): Promise<express.Express> {
  const app = await createApiApp();
  const publicDir = path.join(process.cwd(), "dist/public");
  app.use(express.static(publicDir));
  app.get("*", (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
  return app;
}
