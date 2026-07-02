import express from "express";
import cookieParser from "cookie-parser";
import { ensureSchema } from "./ensureSchema";
import { registerRoutes } from "./registerRoutes";
import { getApp } from "./createApp";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

if (process.env.NODE_ENV === "production") {
  const app = await getApp();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}/`);
  });
} else {
  await ensureSchema();
  const app = express();
  app.set("trust proxy", 1);
  app.use(cookieParser());
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  registerRoutes(app);

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

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}/`);
  });
}
