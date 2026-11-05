/**
 * API exclusiva da homologação 3E.12C + UI React empacotada.
 * Sem Vite em runtime. Só aceita o schema descartável.
 */
import express from "express";
import fs from "node:fs";
import path from "node:path";

const TESTE = "fazenda_digital_test_integracao_3e12b";
const raw = process.env.DATABASE_URL ?? "";
let dbName = "";
try {
  dbName = new URL(raw).pathname.replace(/^\//, "").split("?")[0];
} catch {
  dbName = "";
}
if (dbName !== TESTE) {
  console.error(`[3e12c-server] ABORT: DATABASE_URL aponta para "${dbName || "?"}"`);
  process.exit(1);
}

const uiDir = process.env.HOMOLOG_3E12C_UI_DIR ?? "";
if (!uiDir || !fs.existsSync(path.join(uiDir, "app.js")) || !fs.existsSync(path.join(uiDir, "index.html"))) {
  console.error("[3e12c-server] ABORT: UI empacotada ausente");
  process.exit(1);
}

const { getApiApp } = await import("../server/createApp");
const app = await getApiApp();

app.use("/homolog-ui", express.static(uiDir));
app.get("*", (req, res, next) => {
  if (String(req.path).startsWith("/api")) return next();
  res.sendFile(path.join(uiDir, "index.html"));
});

const PORT = Number(process.env.PORT || 3102);
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Server running on http://localhost:${PORT}/`);
  console.log(`[3e12c-server] tRPC real + UI empacotada INTEGRADO, db=${TESTE}`);
});
