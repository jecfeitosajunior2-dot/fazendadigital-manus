import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const storageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../client/public/manus-storage"
);

export function mountLocalManusStorage(app: Express) {
  app.use("/manus-storage", (req, res, next) => {
    const key = req.path.replace(/^\//, "");
    if (!key || key.includes("..")) return next();
    // GTA/NF só saem pela rota autenticada — não pela URL pública das fotos.
    if (key.startsWith("venda_doc_")) {
      res.status(404).send("Not found");
      return;
    }
    const filePath = path.join(storageDir, key);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
    next();
  });
}

export function getLocalManusStoragePath(key: string): string | null {
  const filePath = path.join(storageDir, key);
  return fs.existsSync(filePath) ? filePath : null;
}
