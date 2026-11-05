import { register } from "node:module";
import { pathToFileURL } from "node:url";

const TESTE = "fazenda_digital_test_integracao_3e12b";
const raw = process.env.DATABASE_URL ?? "";
let dbName = "";
try {
  dbName = new URL(raw).pathname.replace(/^\//, "").split("?")[0];
} catch {
  dbName = "";
}
if (dbName !== TESTE) {
  console.error(`[3e12c-hook] ABORT: DATABASE_URL aponta para "${dbName || "?"}", esperado ${TESTE}`);
  process.exit(1);
}

register(new URL("./homolog-3e12c-loader.mjs", import.meta.url), pathToFileURL("./"));
console.log(`[3e12c-hook] loader INTEGRADO restrito ao schema ${TESTE}`);
