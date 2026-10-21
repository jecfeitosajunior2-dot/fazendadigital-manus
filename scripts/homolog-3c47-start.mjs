/**
 * Sobe o servidor só no banco isolado, porta 3010.
 * Não lê a URL operacional como destino: troca o pathname antes de iniciar.
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

config({ path: ".env.local" });
config();

const HOMOLOG = "fazenda_digital_homolog_3c47";
const OPERACIONAL = "fazenda_digital";
const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("DATABASE_URL ausente");
  process.exit(1);
}
const u = new URL(raw);
const bancoOrigem = u.pathname.replace(/^\//, "").split("?")[0];
if (bancoOrigem !== OPERACIONAL) {
  console.error("ABORT: URL base inesperada");
  process.exit(1);
}
if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) {
  console.error("ABORT: host não local");
  process.exit(1);
}

u.pathname = `/${HOMOLOG}`;
process.env.DATABASE_URL = u.toString();
process.env.PORT = "3010";
process.env.JWT_SECRET = `homolog-3c47-${randomBytes(24).toString("hex")}`;
process.env.VITE_APP_ID = "";
process.env.OAUTH_SERVER_URL = "";
process.env.VITE_OAUTH_PORTAL_URL = "";
process.env.BUILT_IN_FORGE_API_URL = "";
process.env.BUILT_IN_FORGE_API_KEY = "";
process.env.VITE_FRONTEND_FORGE_API_URL = "";
process.env.VITE_FRONTEND_FORGE_API_KEY = "";

const destino = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "").split("?")[0];
if (destino !== HOMOLOG) {
  console.error("ABORT: destino não é o banco isolado");
  process.exit(1);
}

console.log(JSON.stringify({
  aviso: "SERVIDOR HOMOLOGAÇÃO 3C.4.8",
  hostMysql: u.hostname,
  banco: destino,
  portaApp: 3010,
  url: "http://127.0.0.1:3010",
  jwtExclusivo: true,
}));

const child = spawn("pnpm", ["exec", "tsx", "watch", "server/index.ts"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
  cwd: process.cwd(),
});
child.on("exit", code => process.exit(code ?? 1));
