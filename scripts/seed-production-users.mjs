import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scope = "jecfeitosajunior2-dots-projects";
const tmp = mkdtempSync(join(tmpdir(), "fd-env-"));

function run(cmd, args, cwd = root, env = process.env) {
  const result = spawnSync(cmd, args, { cwd, env, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function parseEnvFile(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value) env[key] = value;
  }
  return env;
}

function syncEnvToManus(sourceEnv) {
  run("vercel", ["link", "--yes", "--scope", scope, "--project", "fazendadigital-manus"], root);
  for (const [key, value] of Object.entries(sourceEnv)) {
    const add = spawnSync(
      "vercel",
      ["env", "add", key, "production", "--scope", scope, "--force"],
      { cwd: root, input: value, encoding: "utf8", stdio: ["pipe", "inherit", "inherit"] }
    );
    if (add.status !== 0) process.exit(add.status ?? 1);
  }
}

try {
  run("vercel", ["link", "--yes", "--scope", scope, "--project", "fazenda-digital-app-v2"], tmp);
  run("vercel", ["env", "pull", ".env.source", "--environment", "production", "--yes", "--scope", scope], tmp);

  const sourceEnv = parseEnvFile(join(tmp, ".env.source"));
  if (!sourceEnv.DATABASE_URL) {
    throw new Error("DATABASE_URL ausente no projeto fonte.");
  }

  syncEnvToManus(sourceEnv);

  const childEnv = { ...process.env, ...sourceEnv, NODE_ENV: "production" };

  run("npx", ["tsx", "scripts/seed.ts"], root, childEnv);
  run("npx", ["tsx", "scripts/create-user.ts", "pngomes1@gmail.com", "123456", "Pedro Gomes", "admin"], root, childEnv);
  run(
    "npx",
    ["tsx", "scripts/create-user.ts", "produtor2@fazendadigitalpro.com.br", "FdPro2026!", "Produtor Demo", "user"],
    root,
    childEnv
  );

  console.log("Usuários de produção sincronizados.");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
