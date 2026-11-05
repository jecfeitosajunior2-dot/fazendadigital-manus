/**
 * Homologação 3E.11E.2 — boot seguro em schema descartável.
 * Não grava em fazenda_digital nem schemas históricos/restauração.
 * Não executa db:push nem ensureSchema.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import * as jose from "jose";
import {
  ESTADO_CONFIRMACAO_VENDA_PRODUCAO,
  INTEGRACAO_CONFIRMACAO_VENDA_ATIVA,
} from "../shared/vendaIntegracao";

const TESTE = "fazenda_digital_test_boot_3e11e2";
const TEST_USER = "fd_boot_3e11e2";
const TEST_HOSTS = ["localhost", "%"] as const;
const OPERACIONAL = "fazenda_digital";
const PROTEGIDOS = [
  OPERACIONAL,
  "fazenda_digital_restore_3e11b_20261026",
  "fazenda_digital_homolog_3c47",
  "fazenda_digital_homolog_3b2a3",
] as const;
const DUMP = "C:/Users/Pedro Neto/FazendaDigital-backups/pre-0061-20261026-1711/fazenda_digital_full_pre_0061_20261026-1711.sql";
const SECRETS_DIR = "C:/Users/Pedro Neto/FazendaDigital-backups/.secrets";
const PORT = 3100;
const WRITE_HEAD =
  /^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|CALL|GRANT|REVOKE|RENAME|LOAD|HANDLER)\b/i;

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

function credenciaisAdmin() {
  const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };
  const raw = env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL admin ausente");
  const u = new URL(raw);
  if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) {
    throw new Error("ABORT: host não é MySQL local");
  }
  const db = (u.pathname || "").replace(/^\//, "").split("?")[0];
  if (db !== OPERACIONAL) {
    throw new Error(`ABORT: URL admin aponta para ${db}, esperado ${OPERACIONAL} só como referência de host`);
  }
  return {
    host: u.hostname === "localhost" ? "127.0.0.1" : u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    jwtSecret: env.JWT_SECRET || "fallback-secret-for-dev",
  };
}

async function q<T extends mysql.RowDataPacket[]>(
  conn: mysql.Connection,
  sqlText: string,
  params: unknown[] = [],
) {
  const [rows] = await conn.query(sqlText, params);
  return rows as T;
}

function assertNaoProtegido(nome: string | null) {
  if (!nome) throw new Error("ABORT: DATABASE() vazio");
  if ((PROTEGIDOS as readonly string[]).includes(nome)) {
    throw new Error(`ABORT: operação recusada em schema protegido ${nome}`);
  }
  if (nome !== TESTE) throw new Error(`ABORT: DATABASE()=${nome}, esperado ${TESTE}`);
}

function classifySql(sql: string): string {
  const trimmed = sql.replace(/\/\*[\s\S]*?\*\//g, " ").trim();
  return (trimmed.match(/^([A-Za-z]+)/)?.[1] || "OTHER").toUpperCase();
}

function isWriteSql(sql: string): boolean {
  const trimmed = sql.replace(/\/\*[\s\S]*?\*\//g, " ").trim();
  return WRITE_HEAD.test(trimmed);
}

async function snapshotSchema(admin: mysql.Connection, schemaName: string) {
  const tables = Number(
    (
      await q<{ n: number }[]>(
        admin,
        "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
        [schemaName],
      )
    )[0]?.n,
  );
  const cols = Number(
    (
      await q<{ n: number }[]>(
        admin,
        "SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?",
        [schemaName],
      )
    )[0]?.n,
  );
  const idxs = Number(
    (
      await q<{ n: number }[]>(
        admin,
        "SELECT COUNT(DISTINCT INDEX_NAME) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ?",
        [schemaName],
      )
    )[0]?.n,
  );
  const fks = Number(
    (
      await q<{ n: number }[]>(
        admin,
        "SELECT COUNT(*) n FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'",
        [schemaName],
      )
    )[0]?.n,
  );
  const count = async (tabela: string) =>
    Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${schemaName}\`.\`${tabela}\``))[0]?.n);
  const [col0061] = await q<{ COLUMN_TYPE: string; IS_NULLABLE: string }[]>(
    admin,
    `SELECT COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendas' AND COLUMN_NAME = 'idempotency_key'`,
    [schemaName],
  );
  const idx0061 = await q<{ SEQ_IN_INDEX: number; COLUMN_NAME: string; NON_UNIQUE: number }[]>(
    admin,
    `SELECT SEQ_IN_INDEX, COLUMN_NAME, NON_UNIQUE FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendas' AND INDEX_NAME = 'vendas_idem_uq'
     ORDER BY SEQ_IN_INDEX`,
    [schemaName],
  );
  return {
    tables,
    cols,
    idxs,
    fks,
    vendas: await count("vendas"),
    itens: await count("venda_itens"),
    baixas: await count("animal_baixas"),
    titulos: await count("financeiro_titulos"),
    titulosVenda: Number(
      (
        await q<{ n: number }[]>(
          admin,
          `SELECT COUNT(*) n FROM \`${schemaName}\`.financeiro_titulos WHERE origem_tipo = 'venda_animais'`,
        )
      )[0]?.n,
    ),
    animais: await count("animais"),
    col0061,
    idx0061,
  };
}

function waitFor(child: ReturnType<typeof spawn>, pattern: RegExp, ms: number) {
  return new Promise<{ code: number | null; out: string }>((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timeout esperando ${pattern}. log=${out.slice(-2000)}`));
    }, ms);
    const onData = (buf: Buffer) => {
      out += buf.toString();
      if (pattern.test(out)) {
        clearTimeout(timer);
        resolve({ code: null, out });
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

async function main() {
  const relatorio: Record<string, unknown> = { fase: "3E.11E.2", schema: TESTE };
  const cred = credenciaisAdmin();
  const dump = readFileSync(DUMP, "utf8");
  if (/^\s*USE\s+`?fazenda_digital`?/im.test(dump) || /^\s*CREATE\s+DATABASE/im.test(dump)) {
    throw new Error("ABORT: dump contém USE/CREATE DATABASE");
  }

  const admin = await mysql.createConnection({
    host: cred.host,
    port: cred.port,
    user: cred.user,
    password: cred.password,
    multipleStatements: false,
  });

  try {
    const [meta] = await q<{ ver: string; db: string | null }[]>(
      admin,
      "SELECT @@version AS ver, DATABASE() AS db",
    );
    relatorio.mysql = { version: meta.ver, adminDatabase: meta.db };
    if (meta.db && (PROTEGIDOS as readonly string[]).includes(meta.db)) {
      await admin.query("USE information_schema");
    }

    const antesOp = await snapshotSchema(admin, OPERACIONAL);
    relatorio.operacionalAntes = antesOp;

    const jaExiste = Number(
      (
        await q<{ n: number }[]>(
          admin,
          "SELECT COUNT(*) n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
          [TESTE],
        )
      )[0]?.n,
    );
    if (!jaExiste) {
      await admin.query(`CREATE DATABASE \`${TESTE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    }

    mkdirSync(SECRETS_DIR, { recursive: true });
    const passFile = join(SECRETS_DIR, "fd-boot-3e11e2.pass");
    const pass = existsSync(passFile)
      ? readFileSync(passFile, "utf8").trim()
      : randomBytes(18).toString("base64url");
    writeFileSync(passFile, pass, { encoding: "utf8" });

    const contas: string[] = [];
    for (const host of TEST_HOSTS) {
      const conta = `'${TEST_USER}'@'${host}'`;
      contas.push(conta);
      const userExists = Number(
        (
          await q<{ n: number }[]>(
            admin,
            "SELECT COUNT(*) n FROM mysql.user WHERE User = ? AND Host = ?",
            [TEST_USER, host],
          )
        )[0]?.n,
      );
      if (!userExists) {
        await admin.query(`CREATE USER ${conta} IDENTIFIED BY '${pass}'`);
      } else {
        await admin.query(`ALTER USER ${conta} IDENTIFIED BY '${pass}'`);
      }
      try {
        await admin.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${conta}`);
      } catch {
        /* usuário novo só tem USAGE */
      }
      await admin.query(`GRANT SELECT ON \`${TESTE}\`.* TO ${conta}`);
    }
    await admin.query("FLUSH PRIVILEGES");

    const grants = (
      await Promise.all(contas.map((conta) => q<{ [k: string]: string }[]>(admin, `SHOW GRANTS FOR ${conta}`)))
    ).flat().map((r) => Object.values(r)[0]);
    const grantsRedacted = grants.map((g) => String(g).replace(/IDENTIFIED BY\s+'[^']*'/gi, "IDENTIFIED BY ***"));
    const grantText = grantsRedacted.join(" | ").toLowerCase();
    const tocaSchema = (schema: string) =>
      grantsRedacted.some((g) => new RegExp(`\\bon\\s+\`?${schema}\`?\\.`, "i").test(String(g)));
    const isolamento = {
      grants: grantsRedacted,
      tocaOperacional: tocaSchema(OPERACIONAL),
      tocaRestore: tocaSchema("fazenda_digital_restore_3e11b_20261026"),
      tocaHomolog: tocaSchema("fazenda_digital_homolog_3c47") || tocaSchema("fazenda_digital_homolog_3b2a3"),
      allDatabases: grantsRedacted.some(
        (g) => /\bon\s+\*\.\*/i.test(String(g)) && /grant\s+(?!usage\b)(all|select|insert|update|delete)/i.test(String(g)),
      ),
    };
    if (isolamento.tocaOperacional || isolamento.tocaRestore || isolamento.tocaHomolog || isolamento.allDatabases) {
      throw new Error(`ABORT: GRANTS inseguros: ${grantsRedacted.join(" | ")}`);
    }
    relatorio.isolamento = isolamento;

    const probe = await mysql.createConnection({
      host: cred.host,
      port: cred.port,
      user: TEST_USER,
      password: pass,
      database: TESTE,
    });
    const [probeMeta] = await q<{ db: string; usr: string }[]>(
      probe,
      "SELECT DATABASE() AS db, CURRENT_USER() AS usr",
    );
    if (probeMeta.db !== TESTE) throw new Error(`ABORT: probe DATABASE()=${probeMeta.db}`);
    let operacionalNegado = false;
    try {
      await probe.query(`SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.vendas`);
    } catch (err) {
      operacionalNegado = /denied|1142|1044/i.test(err instanceof Error ? err.message : String(err));
    }
    await probe.end();
    if (!operacionalNegado) throw new Error("ABORT: usuário de teste conseguiu ler o operacional");
    relatorio.probe = { database: probeMeta.db, user: probeMeta.usr.replace(/@.*$/, "@…"), operacionalNegado };

    await admin.query(`USE \`${TESTE}\``);
    const [dbNow] = await q<{ db: string }[]>(admin, "SELECT DATABASE() AS db");
    assertNaoProtegido(dbNow.db);

    const tablesNow = Number(
      (
        await q<{ n: number }[]>(
          admin,
          "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
          [TESTE],
        )
      )[0]?.n,
    );
    if (tablesNow === 0) {
      const loader = await mysql.createConnection({
        host: cred.host,
        port: cred.port,
        user: cred.user,
        password: cred.password,
        database: TESTE,
        multipleStatements: true,
      });
      try {
        const [loaderDb] = await q<{ db: string }[]>(loader, "SELECT DATABASE() AS db");
        assertNaoProtegido(loaderDb.db);
        await loader.query(dump);
      } finally {
        await loader.end();
      }
    }

    await admin.query(`USE \`${TESTE}\``);
    assertNaoProtegido((await q<{ db: string }[]>(admin, "SELECT DATABASE() AS db"))[0]?.db);

    const temCol = Number(
      (
        await q<{ n: number }[]>(
          admin,
          "SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendas' AND COLUMN_NAME = 'idempotency_key'",
          [TESTE],
        )
      )[0]?.n,
    );
    if (!temCol) {
      await admin.query("ALTER TABLE `vendas` ADD COLUMN `idempotency_key` varchar(80) NULL");
    }
    const temIdx = Number(
      (
        await q<{ n: number }[]>(
          admin,
          "SELECT COUNT(*) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendas' AND INDEX_NAME = 'vendas_idem_uq'",
          [TESTE],
        )
      )[0]?.n,
    );
    if (!temIdx) {
      await admin.query("CREATE UNIQUE INDEX `vendas_idem_uq` ON `vendas` (`user_id`, `idempotency_key`)");
    }

    const snapAntes = await snapshotSchema(admin, TESTE);
    relatorio.schemaAntesBoot = snapAntes;
    relatorio.metodoPrep =
      "Dump estrutural+dados pre-0061 no schema novo + 0061 só nele. Fonte: backup 20261026-1711.";

    await q(admin, "UPDATE performance_schema.setup_consumers SET ENABLED = 'YES' WHERE NAME LIKE 'events_statements%'");
    const [pfsMark] = await q<{ n: number }[]>(
      admin,
      "SELECT COALESCE(MAX(EVENT_ID), 0) n FROM performance_schema.events_statements_history_long",
    );
    const mark = Number(pfsMark.n);

    const testUrl = `mysql://${encodeURIComponent(TEST_USER)}:${encodeURIComponent(pass)}@127.0.0.1:${cred.port}/${TESTE}`;
    const urlHash = createHash("sha256").update(testUrl).digest("hex").slice(0, 12);
    relatorio.databaseUrlTeste = {
      host: "127.0.0.1",
      port: cred.port,
      database: TESTE,
      user: TEST_USER,
      urlSha12: urlHash,
      apontaOperacional: testUrl.includes(`/${OPERACIONAL}`),
    };

    const spawnServer = (url: string) =>
      spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
        cwd: join(dirname(fileURLToPath(import.meta.url)), ".."),
        env: {
          ...process.env,
          DATABASE_URL: url,
          PORT: String(PORT),
          NODE_ENV: "production",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

    const childOk = spawnServer(testUrl);
    const bootOk = await waitFor(childOk, /Server running on http:\/\/localhost:3100/, 45000);
    relatorio.bootCompativel = {
      saiuAntesDeListen: bootOk.code !== null,
      codigo: bootOk.code,
      logContemEnsureSchema: /ensureSchema\s*\(/.test(bootOk.out),
      logContemCompativel: /Compatível/.test(bootOk.out),
      logTrecho: bootOk.out
        .split(/\r?\n/)
        .filter((l) => /\[schema\]|\[startup\]|Server running/.test(l))
        .slice(0, 20),
    };

    let health: unknown = null;
    if (bootOk.code === null) {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      health = { status: res.status, body: await res.json() };
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
        .sign(new TextEncoder().encode(cred.jwtSecret));
      const trpc = await fetch(
        `http://127.0.0.1:${PORT}/api/trpc/estadoConfirmacaoVenda,integracaoConfirmacaoAtiva`,
        { headers: { cookie: `session=${token}` } },
      );
      relatorio.trpc = { status: trpc.status, body: await trpc.text().then((t) => t.slice(0, 800)) };
    }
    relatorio.health = health;

    const sqlRows = await q<{ sql_text: string; event_name: string }[]>(
      admin,
      `SELECT s.SQL_TEXT AS sql_text, s.EVENT_NAME AS event_name
       FROM performance_schema.events_statements_history_long s
       JOIN performance_schema.threads t ON t.THREAD_ID = s.THREAD_ID
       WHERE s.EVENT_ID > ?
         AND (t.PROCESSLIST_USER = ? OR s.SQL_TEXT LIKE '%information_schema%')
       ORDER BY s.EVENT_ID`,
      [mark, TEST_USER],
    );
    const doUser = sqlRows.filter((r) => r.sql_text);
    const classes: Record<string, number> = {};
    const writes: string[] = [];
    for (const row of doUser) {
      const kind = classifySql(row.sql_text);
      classes[kind] = (classes[kind] || 0) + 1;
      if (isWriteSql(row.sql_text)) writes.push(row.sql_text.slice(0, 180));
    }
    relatorio.sqlBoot = {
      observados: doUser.length,
      classes,
      escritas: writes,
      amostras: doUser.slice(0, 30).map((r) => classifySql(r.sql_text) + ": " + r.sql_text.replace(/\s+/g, " ").slice(0, 140)),
    };

    if (childOk.exitCode === null && childOk.pid) {
      childOk.kill();
      await new Promise((r) => setTimeout(r, 800));
    }

    const snapDepoisOk = await snapshotSchema(admin, TESTE);
    relatorio.schemaDepoisBootOk = snapDepoisOk;

    relatorio.integracaoCodigo = {
      estado: ESTADO_CONFIRMACAO_VENDA_PRODUCAO,
      flag: INTEGRACAO_CONFIRMACAO_VENDA_ATIVA,
    };

    await admin.query(`USE \`${TESTE}\``);
    assertNaoProtegido((await q<{ db: string }[]>(admin, "SELECT DATABASE() AS db"))[0]?.db);
    await admin.query("DROP INDEX `vendas_idem_uq` ON `vendas`");

    const childBad = spawnServer(testUrl);
    const bootBad = await waitFor(childBad, /Inicialização bloqueada|Banco incompatível|Server running/, 45000);
    if (childBad.exitCode === null && childBad.pid) childBad.kill();
    let httpAposIncompativel = "n/d";
    try {
      await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(1500) });
      httpAposIncompativel = "RESPONDEU — falha";
    } catch {
      httpAposIncompativel = "sem HTTP";
    }
    relatorio.bootIncompativel = {
      codigo: bootBad.code,
      bloqueou: bootBad.code !== 0 && !/Server running/.test(bootBad.out),
      mencionouIndice: /vendas_idem_uq/.test(bootBad.out),
      mencionouEnsureSchema: /ensureSchema\s*\(/.test(bootBad.out),
      http: httpAposIncompativel,
      logTrecho: bootBad.out
        .split(/\r?\n/)
        .filter((l) => /\[schema\]|\[startup\]|Server running/.test(l))
        .slice(0, 25),
    };

    const idxAposFail = Number(
      (
        await q<{ n: number }[]>(
          admin,
          "SELECT COUNT(*) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND INDEX_NAME = 'vendas_idem_uq'",
          [TESTE],
        )
      )[0]?.n,
    );
    relatorio.indiceNaoRestaurado = idxAposFail === 0;

    const childDown = spawnServer(
      `mysql://${encodeURIComponent(TEST_USER)}:senha-invalida-3e11e2@127.0.0.1:${cred.port}/${TESTE}`,
    );
    const bootDown = await waitFor(childDown, /Inicialização bloqueada|Server running/, 30000);
    if (childDown.exitCode === null && childDown.pid) childDown.kill();
    let httpDown = "n/d";
    try {
      await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(1500) });
      httpDown = "RESPONDEU — falha";
    } catch {
      httpDown = "sem HTTP";
    }
    relatorio.bootSemConexao = {
      codigo: bootDown.code,
      bloqueou: bootDown.code !== 0 && !/Server running/.test(bootDown.out),
      http: httpDown,
      logTrecho: bootDown.out
        .split(/\r?\n/)
        .filter((l) => /\[schema\]|\[startup\]|Server running/.test(l))
        .slice(0, 20),
    };

    const depoisOp = await snapshotSchema(admin, OPERACIONAL);
    relatorio.operacionalDepois = depoisOp;
    relatorio.operacionalIntacto =
      JSON.stringify(antesOp) === JSON.stringify(depoisOp);

    console.log(JSON.stringify(relatorio, null, 2));
  } finally {
    await admin.end().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error("FALHA 3E.11E.2:", err instanceof Error ? err.message : err);
  process.exit(1);
});
