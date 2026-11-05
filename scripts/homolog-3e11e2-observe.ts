import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import mysql from "mysql2/promise";
import * as jose from "jose";

const TESTE = "fazenda_digital_test_boot_3e11e2";
const TEST_USER = "fd_boot_3e11e2";
const OPERACIONAL = "fazenda_digital";
const PORT = 3100;
const WRITE_HEAD =
  /^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|CALL|GRANT|REVOKE|RENAME|LOAD)\b/i;

function parseEnv(file: string) {
  if (!existsSync(file)) return {} as Record<string, string>;
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i)] = t.slice(i + 1);
  }
  return out;
}

const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };
const u = new URL(env.DATABASE_URL!);
const adminOpt = {
  host: u.hostname === "localhost" ? "127.0.0.1" : u.hostname,
  port: Number(u.port || 3306),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
};
const pass = readFileSync("C:/Users/Pedro Neto/FazendaDigital-backups/.secrets/fd-boot-3e11e2.pass", "utf8").trim();
const testUrl = `mysql://${encodeURIComponent(TEST_USER)}:${encodeURIComponent(pass)}@127.0.0.1:${adminOpt.port}/${TESTE}`;

function classify(sql: string) {
  return (sql.replace(/\/\*[\s\S]*?\*\//g, " ").trim().match(/^([A-Za-z]+)/)?.[1] || "OTHER").toUpperCase();
}

async function main() {
  const admin = await mysql.createConnection(adminOpt);
  await admin.query(`USE \`${TESTE}\``);
  const [curRows] = await admin.query("SELECT DATABASE() AS db");
  const cur = (curRows as Array<{ db: string }>)[0];
  if (cur.db !== TESTE) throw new Error("ABORT " + cur.db);

  const [idxRows] = await admin.query(
    "SELECT COUNT(*) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND INDEX_NAME = 'vendas_idem_uq'",
    [TESTE],
  );
  if (Number((idxRows as Array<{ n: number }>)[0].n) === 0) {
    await admin.query("CREATE UNIQUE INDEX `vendas_idem_uq` ON `vendas` (`user_id`, `idempotency_key`)");
  }

  let generalLog = false;
  let generalLogErro: string | null = null;
  try {
    await admin.query("SET GLOBAL log_output = 'TABLE'");
    await admin.query("SET GLOBAL general_log = 'ON'");
    generalLog = true;
  } catch (e) {
    generalLogErro = e instanceof Error ? e.message : String(e);
  }

  const markTime = new Date();
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl, PORT: String(PORT), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout boot " + log.slice(-500))), 45000);
      const on = (b: Buffer) => {
        log += b.toString();
        if (/Server running/.test(log)) {
          clearTimeout(t);
          resolve();
        }
      };
      child.stdout?.on("data", on);
      child.stderr?.on("data", on);
      child.on("exit", (code) => {
        clearTimeout(t);
        reject(new Error("saiu " + code + " " + log.slice(-800)));
      });
    });

    const health = await fetch(`http://127.0.0.1:${PORT}/api/health`).then(async (r) => ({
      status: r.status,
      body: await r.json(),
    }));
    const token = await new jose.SignJWT({
      id: 999991,
      openId: "homolog-3e11e2-descartavel",
      name: "Homolog Boot",
      email: null,
      role: "user",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(new TextEncoder().encode(env.JWT_SECRET || "fallback-secret-for-dev"));

    const trpcEstado = await fetch(`http://127.0.0.1:${PORT}/api/trpc/vendas.estadoConfirmacaoVenda`, {
      headers: { cookie: `session=${token}` },
    });
    const trpcFlag = await fetch(`http://127.0.0.1:${PORT}/api/trpc/vendas.integracaoConfirmacaoAtiva`, {
      headers: { cookie: `session=${token}` },
    });

    let sql: Array<{ command_type: string; argument: string }> = [];
    if (generalLog) {
      const [rows] = await admin.query(
        `SELECT command_type, CONVERT(argument USING utf8mb4) AS argument
         FROM mysql.general_log
         WHERE user_host LIKE ?
           AND event_time >= ?
         ORDER BY event_time`,
        [`%${TEST_USER}%`, markTime],
      );
      sql = rows as Array<{ command_type: string; argument: string }>;
    }

    const classes: Record<string, number> = {};
    const writes: string[] = [];
    const amostras: string[] = [];
    for (const row of sql) {
      const arg = String(row.argument || "");
      const kind = row.command_type === "Query" ? classify(arg) : String(row.command_type);
      classes[kind] = (classes[kind] || 0) + 1;
      if (row.command_type === "Query" && WRITE_HEAD.test(arg.replace(/\/\*[\s\S]*?\*\//g, " ").trim())) {
        writes.push(arg.slice(0, 200));
      }
      if (amostras.length < 50) amostras.push(`${kind}: ${arg.replace(/\s+/g, " ").slice(0, 160)}`);
    }

    console.log(
      JSON.stringify(
        {
          generalLog,
          generalLogErro,
          health,
          trpcEstado: { status: trpcEstado.status, body: (await trpcEstado.text()).slice(0, 600) },
          trpcFlag: { status: trpcFlag.status, body: (await trpcFlag.text()).slice(0, 600) },
          logBoot: log.split(/\r?\n/).filter((l) => /\[schema\]|Server running/.test(l)),
          sqlObservados: sql.length,
          classes,
          escritas: writes,
          amostras,
          urlDb: TESTE,
          urlUser: TEST_USER,
        },
        null,
        2,
      ),
    );
  } finally {
    if (generalLog) {
      await admin.query("SET GLOBAL general_log = 'OFF'").catch(() => undefined);
    }
    child.kill();
    await new Promise((r) => setTimeout(r, 800));
    await admin.end().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
