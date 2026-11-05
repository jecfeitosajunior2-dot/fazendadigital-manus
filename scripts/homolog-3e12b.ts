/**
 * Homologação 3E.12B — integração Vendas → Financeiro V2 em schema descartável.
 * Não grava em fazenda_digital. Não altera constantes de produção.
 * Não executa ensureSchema, db:push, commit ou servidor operacional.
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
import { drizzle } from "drizzle-orm/mysql2";
import bcrypt from "bcryptjs";
import * as schema from "../drizzle/schema";
import { createConfirmarVendaFinanceiroService } from "../server/confirmarVendaFinanceiro";
import { createConfirmarVendaFinanceiroMysqlStore, createConfirmarVendaFinanceiroTxFromDrizzle } from "../server/confirmarVendaFinanceiroMysql";
import type { ConfirmarVendaFinanceiroInput, ConfirmarVendaFinanceiroStore } from "../server/confirmarVendaFinanceiro";
import { createCancelarVendaFinanceiroService, MSG_VENDA_CANCELAR_COM_RECEBIMENTO } from "../server/cancelarVendaFinanceiro";
import { createCancelarVendaFinanceiroMysqlStore } from "../server/cancelarVendaFinanceiroMysql";
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "../server/financeiroNucleo";
import { MSG_VENDA_CANCELAR_JA_CANCELADA } from "../server/cancelarVenda";
import {
  confirmarVendaComercialSePermitida,
  confirmarVendaIntegradaSeAtiva,
} from "../server/vendaConfirmacaoIntegrada";
import { MSG_VENDA_CONFIRMACAO_JA_CANCELADA, MSG_VENDA_CONFLITO_IDEMPOTENCIA } from "../shared/vendaFinanceiro";
import {
  ESTADO_CONFIRMACAO_VENDA_PRODUCAO,
  INTEGRACAO_CONFIRMACAO_VENDA_ATIVA,
  MSG_VENDA_CONFIRMACAO_COMERCIAL_BLOQUEADA,
  MSG_VENDA_CONFIRMACAO_INTEGRADA_DESLIGADA,
} from "../shared/vendaIntegracao";
import { verifyDatabaseSchema } from "../server/verifyDatabaseSchema";
import type { FinanceiroDrizzleTx } from "../server/financeiroNucleo";

const TESTE = "fazenda_digital_test_integracao_3e12b";
const TEST_USER = "fd_integ_3e12b";
const TEST_HOSTS = ["localhost", "%"] as const;
const OPERACIONAL = "fazenda_digital";
const PROTEGIDOS = [
  OPERACIONAL,
  "fazenda_digital_restore_3e11b_20261026",
  "fazenda_digital_homolog_3c47",
  "fazenda_digital_homolog_3b2a3",
  "fazenda_digital_test_boot_3e11e2",
] as const;
const DUMP = "C:/Users/Pedro Neto/FazendaDigital-backups/pre-0061-20261026-1711/fazenda_digital_full_pre_0061_20261026-1711.sql";
const SECRETS_DIR = "C:/Users/Pedro Neto/FazendaDigital-backups/.secrets";
const PORT_COMERCIAL = 3100;
const PORT_HARNESS = 3101;
const RUN = Date.now().toString(36);
const CFG_INT = { estado: "integrado" as const };

type Cenario = { id: string; nome: string; ok: boolean; detalhe: Record<string, unknown>; erro?: string };

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
  if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) throw new Error("ABORT: host não é MySQL local");
  const db = (u.pathname || "").replace(/^\//, "").split("?")[0];
  if (db !== OPERACIONAL) throw new Error(`ABORT: URL admin aponta para ${db}`);
  return {
    host: u.hostname === "localhost" ? "127.0.0.1" : u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    jwtSecret: env.JWT_SECRET || "",
  };
}

async function q<T extends mysql.RowDataPacket[]>(
  conn: mysql.Connection | mysql.Pool,
  sqlText: string,
  params: unknown[] = [],
) {
  const [rows] = await conn.query(sqlText, params);
  return rows as T;
}

function assertTeste(nome: string | null) {
  if (nome !== TESTE) throw new Error(`ABORT: DATABASE()=${nome}, esperado ${TESTE}`);
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function dataCivil(valor: string | Date | null | undefined): string {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, "0");
    const d = String(valor.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const texto = String(valor ?? "");
  const iso = texto.match(/\d{4}-\d{2}-\d{2}/);
  return iso?.[0] ?? texto.slice(0, 10);
}

function sqlInfo(e: unknown) {
  const err = e as { code?: string; errno?: number; sqlState?: string; message?: string };
  return { code: err?.code, errno: err?.errno, sqlState: err?.sqlState, message: msg(e).slice(0, 240) };
}

function settled<T>(r: PromiseSettledResult<T>) {
  if (r.status === "fulfilled") return { ok: true as const, value: r.value };
  return { ok: false as const, erro: msg(r.reason), sql: sqlInfo(r.reason) };
}

async function snapshotOps(admin: mysql.Connection, schemaName: string) {
  const count = async (t: string) =>
    Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${schemaName}\`.\`${t}\``))[0]?.n);
  const [col] = await q<{ COLUMN_TYPE: string; IS_NULLABLE: string }[]>(
    admin,
    `SELECT COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendas' AND COLUMN_NAME = 'idempotency_key'`,
    [schemaName],
  );
  const idx = await q<{ COLUMN_NAME: string; NON_UNIQUE: number }[]>(
    admin,
    `SELECT COLUMN_NAME, NON_UNIQUE FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendas' AND INDEX_NAME = 'vendas_idem_uq' ORDER BY SEQ_IN_INDEX`,
    [schemaName],
  );
  return {
    tables: Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'", [schemaName]))[0]?.n),
    fks: Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'", [schemaName]))[0]?.n),
    vendas: await count("vendas"),
    itens: await count("venda_itens"),
    baixas: await count("animal_baixas"),
    titulos: await count("financeiro_titulos"),
    titulosVenda: Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${schemaName}\`.financeiro_titulos WHERE origem_tipo = 'venda_animais'`))[0]?.n),
    animais: await count("animais"),
    col0061: col,
    idx0061: idx,
  };
}

function waitFor(child: ReturnType<typeof spawn>, pattern: RegExp, ms: number) {
  return new Promise<{ code: number | null; out: string }>((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* */ }
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

async function killChild(child: ReturnType<typeof spawn> | null) {
  if (!child?.pid) return;
  try { child.kill(); } catch { /* */ }
  await new Promise((r) => setTimeout(r, 400));
}

function cookieDe(res: Response) {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

async function trpc(base: string, path: string, opts: { method?: string; cookie?: string; body?: unknown } = {}) {
  const method = opts.method ?? (opts.body ? "POST" : "GET");
  const res = await fetch(`${base}/api/trpc/${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify({ json: opts.body }) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, cookie: cookieDe(res), json, text: text.slice(0, 800) };
}

function trpcData(body: unknown): unknown {
  const root = body as { result?: { data?: { json?: unknown } } };
  return root?.result?.data?.json;
}

async function main() {
  const cenarios: Cenario[] = [];
  const problemas: string[] = [];
  const relatorio: Record<string, unknown> = { fase: "3E.12B", schema: TESTE, run: RUN };
  const reg = (c: Cenario) => {
    cenarios.push(c);
    if (!c.ok) problemas.push(`${c.id}: ${c.erro || JSON.stringify(c.detalhe).slice(0, 240)}`);
  };
  const cred = credenciaisAdmin();
  if (!existsSync(DUMP)) throw new Error(`ABORT: dump ausente em ${DUMP}`);
  const dump = readFileSync(DUMP, "utf8");
  if (/^\s*USE\s+`?fazenda_digital`?/im.test(dump) || /^\s*CREATE\s+DATABASE/im.test(dump)) {
    throw new Error("ABORT: dump contém USE/CREATE DATABASE");
  }

  const admin = await mysql.createConnection({
    host: cred.host, port: cred.port, user: cred.user, password: cred.password, multipleStatements: false,
  });
  let pool: mysql.Pool | null = null;
  let pool2: mysql.Pool | null = null;
  let childCom: ReturnType<typeof spawn> | null = null;
  let childHar: ReturnType<typeof spawn> | null = null;
  let pass = "";

  try {
    const [meta] = await q<{ ver: string; db: string | null }[]>(admin, "SELECT @@version AS ver, DATABASE() AS db");
    relatorio.mysql = { version: meta.ver, adminDatabase: meta.db };
    if (meta.db && (PROTEGIDOS as readonly string[]).includes(meta.db)) {
      await admin.query("USE information_schema");
    }
    const antesOp = await snapshotOps(admin, OPERACIONAL);
    relatorio.operacionalAntes = antesOp;

    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${TESTE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);

    mkdirSync(SECRETS_DIR, { recursive: true });
    const passFile = join(SECRETS_DIR, "fd-integ-3e12b.pass");
    pass = existsSync(passFile) ? readFileSync(passFile, "utf8").trim() : randomBytes(18).toString("base64url");
    writeFileSync(passFile, pass, { encoding: "utf8" });
    const userPassFile = join(SECRETS_DIR, "fd-integ-3e12b-user.pass");
    const userPass = existsSync(userPassFile)
      ? readFileSync(userPassFile, "utf8").trim()
      : `H3e12b-${randomBytes(8).toString("base64url")}`;
    writeFileSync(userPassFile, userPass, { encoding: "utf8" });

    const contas: string[] = [];
    for (const host of TEST_HOSTS) {
      const conta = `'${TEST_USER}'@'${host}'`;
      contas.push(conta);
      const existe = Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM mysql.user WHERE User = ? AND Host = ?", [TEST_USER, host]))[0]?.n);
      if (!existe) await admin.query(`CREATE USER ${conta} IDENTIFIED BY '${pass}'`);
      else await admin.query(`ALTER USER ${conta} IDENTIFIED BY '${pass}'`);
      try { await admin.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${conta}`); } catch { /* USAGE */ }
      await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE, LOCK TABLES ON \`${TESTE}\`.* TO ${conta}`);
    }
    await admin.query("FLUSH PRIVILEGES");

    const grants = (await Promise.all(contas.map((c) => q<{ [k: string]: string }[]>(admin, `SHOW GRANTS FOR ${c}`))))
      .flat().map((r) => String(Object.values(r)[0]).replace(/IDENTIFIED BY\s+'[^']*'/gi, "IDENTIFIED BY ***"));
    const toca = (schemaName: string) => grants.some((g) => new RegExp(`\\bon\\s+\`?${schemaName}\`?\\.`, "i").test(g));
    const isolamento = {
      grants,
      tocaOperacional: toca(OPERACIONAL),
      tocaRestore: toca("fazenda_digital_restore_3e11b_20261026"),
      tocaHomolog: toca("fazenda_digital_homolog_3c47") || toca("fazenda_digital_homolog_3b2a3"),
      tocaBoot: toca("fazenda_digital_test_boot_3e11e2"),
      allWrite: grants.some((g) => /\bon\s+\*\.\*/i.test(g) && /grant\s+(?!usage\b)/i.test(g)),
    };
    if (isolamento.tocaOperacional || isolamento.tocaRestore || isolamento.tocaHomolog || isolamento.tocaBoot || isolamento.allWrite) {
      throw new Error(`BLOQUEADO POR ISOLAMENTO: ${grants.join(" | ")}`);
    }

    const probe = await mysql.createConnection({
      host: cred.host, port: cred.port, user: TEST_USER, password: pass, database: TESTE,
    });
    const [probeMeta] = await q<{ db: string; usr: string }[]>(probe, "SELECT DATABASE() AS db, CURRENT_USER() AS usr");
    if (probeMeta.db !== TESTE) throw new Error(`ABORT: probe DATABASE()=${probeMeta.db}`);
    const negar = async (schemaName: string) => {
      try {
        await probe.query(`SELECT COUNT(*) n FROM \`${schemaName}\`.vendas`);
        return false;
      } catch (err) {
        return /denied|1142|1044/i.test(msg(err));
      }
    };
    const operacionalNegado = await negar(OPERACIONAL);
    const restoreNegado = await negar("fazenda_digital_restore_3e11b_20261026");
    await probe.end();
    if (!operacionalNegado) throw new Error("BLOQUEADO POR ISOLAMENTO: usuário leu fazenda_digital");
    relatorio.isolamento = { ...isolamento, probeDb: probeMeta.db, operacionalNegado, restoreNegado };
    reg({
      id: "ISO",
      nome: "Schema exclusivo, GRANTS e teste negativo no operacional",
      ok: probeMeta.db === TESTE && operacionalNegado && !isolamento.tocaOperacional,
      detalhe: { db: probeMeta.db, operacionalNegado, restoreNegado, grants },
    });

    await admin.query(`USE \`${TESTE}\``);
    assertTeste((await q<{ db: string }[]>(admin, "SELECT DATABASE() AS db"))[0]?.db);
    const tablesNow = Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?", [TESTE]))[0]?.n);
    if (tablesNow === 0) {
      const loader = await mysql.createConnection({
        host: cred.host, port: cred.port, user: cred.user, password: cred.password,
        database: TESTE, multipleStatements: true,
      });
      try {
        assertTeste((await q<{ db: string }[]>(loader, "SELECT DATABASE() AS db"))[0]?.db);
        await loader.query(dump);
      } finally {
        await loader.end();
      }
    }
    await admin.query(`USE \`${TESTE}\``);
    assertTeste((await q<{ db: string }[]>(admin, "SELECT DATABASE() AS db"))[0]?.db);
    const temCol = Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendas' AND COLUMN_NAME = 'idempotency_key'", [TESTE]))[0]?.n);
    if (!temCol) await admin.query("ALTER TABLE `vendas` ADD COLUMN `idempotency_key` varchar(80) NULL");
    const temIdx = Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendas' AND INDEX_NAME = 'vendas_idem_uq'", [TESTE]))[0]?.n);
    if (!temIdx) await admin.query("CREATE UNIQUE INDEX `vendas_idem_uq` ON `vendas` (`user_id`, `idempotency_key`)");

    await admin.query("UPDATE users SET email = CONCAT('sintetico.', id, '@homolog.3e12b.local'), name = CONCAT('Usuario Homolog ', id), openId = CONCAT('homolog-3e12b-open-', id), passwordHash = '!'");
    await admin.query("UPDATE pessoas SET nome = CONCAT('Pessoa Homolog ', id), documento = NULL, email = NULL, telefone = NULL, endereco = NULL, nome_contato = NULL");
    await admin.query("UPDATE fazendas SET nome = CONCAT('Fazenda Homolog ', id), telefone = NULL, responsavel = NULL, endereco = NULL");

    const hash = await bcrypt.hash(userPass, 10);
    const jaUser = Number((await q<{ id: number }[]>(admin, "SELECT id FROM users WHERE openId = 'homolog-3e12b'"))[0]?.id ?? 0);
    if (!jaUser) {
      await admin.query(
        "INSERT INTO users (openId, name, email, loginMethod, passwordHash, role) VALUES (?, ?, ?, 'local', ?, 'user')",
        ["homolog-3e12b", "Homolog 3E12B", "homolog.3e12b@local.test", hash],
      );
    } else {
      await admin.query("UPDATE users SET email = ?, name = ?, passwordHash = ?, role = 'user' WHERE id = ?",
        ["homolog.3e12b@local.test", "Homolog 3E12B", hash, jaUser]);
    }
    const userId = Number((await q<{ id: number }[]>(admin, "SELECT id FROM users WHERE openId = 'homolog-3e12b'"))[0]?.id);

    const verifyConn = await mysql.createConnection({
      host: cred.host, port: cred.port, user: TEST_USER, password: pass, database: TESTE,
    });
    const verified = await verifyDatabaseSchema(async (sql) => {
      const [rows] = await verifyConn.query(sql);
      return rows;
    });
    await verifyConn.end();
    relatorio.verify = { ok: verified.ok, schema: verified.schemaName, issues: verified.issues.slice(0, 8) };
    reg({
      id: "SCHEMA",
      nome: "Estrutura + 0061 + verifyDatabaseSchema no descartável",
      ok: verified.ok && verified.schemaName === TESTE,
      detalhe: { ok: verified.ok, issues: verified.issues.length, schema: verified.schemaName },
    });

    const histAntes = await q<{ id: number; status: string; idempotency_key: string | null; user_id: number }[]>(
      admin, "SELECT id, status, idempotency_key, user_id FROM vendas WHERE id IN (1, 2) ORDER BY id",
    );

    pool = mysql.createPool({
      host: cred.host, port: cred.port, user: TEST_USER, password: pass, database: TESTE, connectionLimit: 8,
    });
    pool2 = mysql.createPool({
      host: cred.host, port: cred.port, user: TEST_USER, password: pass, database: TESTE, connectionLimit: 4,
    });
    assertTeste((await q<{ db: string }[]>(pool, "SELECT DATABASE() db"))[0]?.db);
    assertTeste((await q<{ db: string }[]>(pool2, "SELECT DATABASE() db"))[0]?.db);

    await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda Sintetica 3E12B')", [userId]);
    const fazendaId = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id DESC LIMIT 1", [userId]))[0]?.id);
    await pool.query("INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Comprador Sintetico 3E12B', 'cliente', 1)", [userId]);
    const pessoaId = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'cliente' ORDER BY id DESC LIMIT 1", [userId]))[0]?.id);
    await pool.query(
      "INSERT INTO financeiro_contas (user_id, nome, tipo, saldo_abertura, data_saldo_abertura, ativa) VALUES (?, 'Caixa 3E12B', 'caixa', '300000.00', '2026-10-01', 1)",
      [userId],
    );
    const contaId = Number((await q<{ id: number }[]>(pool, "SELECT id FROM financeiro_contas WHERE user_id = ? ORDER BY id DESC LIMIT 1", [userId]))[0]?.id);

    async function seedAnimal(brinco: string) {
      const tag = `${brinco}-${RUN}`;
      await pool!.query(
        "INSERT INTO animais (`userId`, `brinco`, `sexo`, `status`, `fazendaId`) VALUES (?, ?, 'macho', 'ativo', ?)",
        [userId, tag, fazendaId],
      );
      return Number((await q<{ id: number }[]>(pool!, "SELECT id FROM animais WHERE brinco = ? AND userId = ?", [tag, userId]))[0]?.id);
    }

    const d1 = drizzle(pool, { schema, mode: "default" as const });
    const d2 = drizzle(pool2, { schema, mode: "default" as const });
    const store1 = createConfirmarVendaFinanceiroMysqlStore(d1);
    const store2 = createConfirmarVendaFinanceiroMysqlStore(d2);
    const conf = createConfirmarVendaFinanceiroService(store1);
    const conf2 = createConfirmarVendaFinanceiroService(store2);
    const canc = createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(d1));
    const canc2 = createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(d2));
    const nucleo = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(d1));
    const nucleo2 = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(d2));

    const cabeca = (key: string, animalId: number, extra: Partial<ConfirmarVendaFinanceiroInput> = {}): ConfirmarVendaFinanceiroInput => ({
      idempotencyKey: key.startsWith("ven-") ? key : `ven-${key}`,
      fazendaId, data: "2026-10-27", compradorId: pessoaId,
      formaPrecificacao: "cabeca", itens: [{ animalId, precoUnitario: 1500 }], condicao: "a_vista", ...extra,
    });

    const statusAnimal = async (id: number) => (await q<{ status: string }[]>(pool!, "SELECT status FROM animais WHERE id = ?", [id]))[0]?.status;
    const baixasAtivas = async (id: number) => Number((await q<{ n: number }[]>(pool!, "SELECT COUNT(*) n FROM animal_baixas WHERE animalId = ? AND status = 'ativa'", [id]))[0]?.n);
    const baixasEst = async (id: number) => Number((await q<{ n: number }[]>(pool!, "SELECT COUNT(*) n FROM animal_baixas WHERE animalId = ? AND status = 'estornada'", [id]))[0]?.n);
    const titulosVenda = async (vendaId: number) =>
      q<{ id: number; tipo: string; estado: string; origem_tipo: string; origem_id: number; valor_original: string }[]>(
        pool!,
        `SELECT id, tipo, estado, origem_tipo, origem_id, valor_original FROM financeiro_titulos
         WHERE origem_tipo = 'venda_animais' AND origem_id = ?`,
        [vendaId],
      );
    const parcelaId = async (tituloId: number) =>
      Number((await q<{ id: number }[]>(pool!, "SELECT id FROM financeiro_parcelas WHERE titulo_id = ? ORDER BY numero LIMIT 1", [tituloId]))[0]?.id);
    const liqs = async (tituloId: number) => Number((await q<{ n: number }[]>(pool!, `SELECT COUNT(*) n FROM financeiro_liquidacoes l
      JOIN financeiro_liquidacao_alocacoes a ON a.liquidacao_id = l.id
      JOIN financeiro_parcelas p ON p.id = a.parcela_id WHERE p.titulo_id = ?`, [tituloId]))[0]?.n);
    const movs = async (tituloId: number) => Number((await q<{ n: number }[]>(pool!, `SELECT COUNT(*) n FROM financeiro_movimentos m
      JOIN financeiro_liquidacoes l ON l.id = m.liquidacao_id
      JOIN financeiro_liquidacao_alocacoes a ON a.liquidacao_id = l.id
      JOIN financeiro_parcelas p ON p.id = a.parcela_id WHERE p.titulo_id = ?`, [tituloId]))[0]?.n);

    const fonte = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../shared/vendaIntegracao.ts"), "utf8");
    let portaOff = "";
    try {
      await confirmarVendaIntegradaSeAtiva(store1, userId, cabeca(`ven-3e12b-${RUN}-off`, 1));
    } catch (e) { portaOff = msg(e); }
    let comercialBloq = "";
    try {
      await confirmarVendaComercialSePermitida(userId, {
        fazendaId, data: "2026-10-27", compradorId: pessoaId, formaPrecificacao: "cabeca",
        itens: [{ animalId: 1, precoUnitario: 10 }],
      }, CFG_INT);
    } catch (e) { comercialBloq = msg(e); }
    reg({
      id: "MODO",
      nome: "Constantes de produção intactas; injeção INTEGRADO só no harness/serviço",
      ok: ESTADO_CONFIRMACAO_VENDA_PRODUCAO === "comercial"
        && INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false
        && fonte.includes('ESTADO_CONFIRMACAO_VENDA_PRODUCAO = "comercial"')
        && fonte.includes("INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = false")
        && !fonte.includes('ESTADO_CONFIRMACAO_VENDA_PRODUCAO = "integrado"')
        && portaOff.includes(MSG_VENDA_CONFIRMACAO_INTEGRADA_DESLIGADA)
        && comercialBloq.includes(MSG_VENDA_CONFIRMACAO_COMERCIAL_BLOQUEADA),
      detalhe: { estado: ESTADO_CONFIRMACAO_VENDA_PRODUCAO, flag: INTEGRACAO_CONFIRMACAO_VENDA_ATIVA, portaOff, comercialBloq },
    });

    const a1 = await seedAnimal("3E12B-A1");
    const a2 = await seedAnimal("3E12B-A2");
    const confA = await confirmarVendaIntegradaSeAtiva(store1, userId, {
      idempotencyKey: `ven-3e12b-${RUN}-conf`,
      fazendaId, data: "2026-10-27", compradorId: pessoaId,
      formaPrecificacao: "cabeca",
      itens: [{ animalId: a1, precoUnitario: 1500 }, { animalId: a2, precoUnitario: 1700 }],
      condicao: "a_vista",
    }, CFG_INT);
    const titsA = await titulosVenda(confA.vendaId);
    const itensA = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM venda_itens WHERE venda_id = ?", [confA.vendaId]))[0]?.n);
    const parcA = await q<{ numero: number; vencimento: string; valor_original: string }[]>(
      pool, "SELECT numero, vencimento, valor_original FROM financeiro_parcelas WHERE titulo_id = ? ORDER BY numero", [confA.tituloId],
    );
    const histIds = histAntes.map((v) => v.id);
    const histTitulos = histIds.length
      ? Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id IN (${histIds.map(() => "?").join(",")})`, histIds))[0]?.n)
      : 0;
    reg({
      id: "CONF",
      nome: "Confirmação integrada atômica",
      ok: confA.success && !confA.idempotente && confA.valorTotal === 3200
        && itensA === 2
        && await statusAnimal(a1) === "vendido" && await statusAnimal(a2) === "vendido"
        && await baixasAtivas(a1) === 1 && await baixasAtivas(a2) === 1
        && titsA.length === 1 && titsA[0]?.tipo === "receber" && titsA[0]?.estado === "ativo"
        && Number(titsA[0]?.origem_id) === confA.vendaId && Number(titsA[0]?.valor_original) === 3200
        && parcA.length === 1 && dataCivil(parcA[0]?.vencimento) === "2026-10-27"
        && await liqs(confA.tituloId) === 0 && await movs(confA.tituloId) === 0
        && histTitulos === 0,
      detalhe: { confA, titsA, itensA, parcA, histTitulos },
    });

    const idemMesmo = await confirmarVendaIntegradaSeAtiva(store1, userId, {
      idempotencyKey: `ven-3e12b-${RUN}-conf`,
      fazendaId, data: "2026-10-27", compradorId: pessoaId,
      formaPrecificacao: "cabeca",
      itens: [{ animalId: a1, precoUnitario: 1500 }, { animalId: a2, precoUnitario: 1700 }],
      condicao: "a_vista",
    }, CFG_INT);
    const vendasConf = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = ?", [`ven-3e12b-${RUN}-conf`]))[0]?.n);
    reg({
      id: "IDEM-A",
      nome: "Mesma chave + mesmo payload",
      ok: idemMesmo.idempotente && idemMesmo.vendaId === confA.vendaId && idemMesmo.tituloId === confA.tituloId && vendasConf === 1,
      detalhe: { idemMesmo, vendasConf },
    });

    let idemB = "";
    try {
      await confirmarVendaIntegradaSeAtiva(store1, userId, {
        idempotencyKey: `ven-3e12b-${RUN}-conf`,
        fazendaId, data: "2026-10-27", compradorId: pessoaId,
        formaPrecificacao: "cabeca",
        itens: [{ animalId: a1, precoUnitario: 1500 }, { animalId: a2, precoUnitario: 1700 }],
        condicao: "definir_depois",
      }, CFG_INT);
    } catch (e) { idemB = msg(e); }
    reg({
      id: "IDEM-B",
      nome: "Mesma chave + payload diferente = CONFLICT",
      ok: idemB.includes(MSG_VENDA_CONFLITO_IDEMPOTENCIA) && vendasConf === 1,
      detalhe: { idemB },
    });

    const cAnim = await seedAnimal("3E12B-C");
    const c1 = await conf.confirmar(userId, cabeca(`ven-3e12b-${RUN}-lost`, cAnim));
    const c2 = await conf.confirmar(userId, cabeca(`ven-3e12b-${RUN}-lost`, cAnim));
    reg({
      id: "IDEM-C",
      nome: "Retry após resposta perdida",
      ok: c2.idempotente && c2.vendaId === c1.vendaId && c2.tituloId === c1.tituloId
        && Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id = ?", [c1.vendaId]))[0]?.n) === 1,
      detalhe: { c1, c2 },
    });

    const dAnim = await seedAnimal("3E12B-D");
    const dVenda = await confirmarVendaIntegradaSeAtiva(store1, userId, cabeca(`ven-3e12b-${RUN}-canc`, dAnim), CFG_INT);
    await canc.cancelar(userId, { vendaId: dVenda.vendaId, motivo: "teste idem cancelada", canceladoPorUserId: userId });
    let dMsg = "";
    try {
      await confirmarVendaIntegradaSeAtiva(store1, userId, cabeca(`ven-3e12b-${RUN}-canc`, dAnim), CFG_INT);
    } catch (e) { dMsg = msg(e); }
    const dReaberta = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = ? AND status = 'concluido'", [`ven-3e12b-${RUN}-canc`]))[0]?.n);
    reg({
      id: "IDEM-D",
      nome: "Venda cancelada + mesma chave recusa e não reabre",
      ok: dMsg.includes(MSG_VENDA_CONFIRMACAO_JA_CANCELADA) && dReaberta === 0 && await statusAnimal(dAnim) === "ativo",
      detalhe: { dMsg, dReaberta },
    });

    const eAnim = await seedAnimal("3E12B-E");
    const eRace = await Promise.allSettled([
      confirmarVendaIntegradaSeAtiva(store1, userId, cabeca(`ven-3e12b-${RUN}-race`, eAnim), CFG_INT),
      confirmarVendaIntegradaSeAtiva(store2, userId, cabeca(`ven-3e12b-${RUN}-race`, eAnim), CFG_INT),
    ]);
    const e1 = settled(eRace[0]!); const e2 = settled(eRace[1]!);
    const eOk = [e1, e2].filter((x) => x.ok);
    const eVendas = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = ?", [`ven-3e12b-${RUN}-race`]))[0]?.n);
    const eTits = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id IN (SELECT id FROM vendas WHERE idempotency_key = ?)", [`ven-3e12b-${RUN}-race`]))[0]?.n);
    reg({
      id: "CONC-A",
      nome: "Duas confirmações simultâneas com a mesma chave",
      ok: eOk.length >= 1 && eVendas === 1 && eTits === 1 && await baixasAtivas(eAnim) === 1
        && (eOk.length === 2 ? eOk[0]!.value.vendaId === eOk[1]!.value.vendaId : true),
      detalhe: { e1, e2, eVendas, eTits },
    });

    const fAnim = await seedAnimal("3E12B-F");
    const fRace = await Promise.allSettled([
      confirmarVendaIntegradaSeAtiva(store1, userId, cabeca(`ven-3e12b-${RUN}-f1`, fAnim), CFG_INT),
      confirmarVendaIntegradaSeAtiva(store2, userId, cabeca(`ven-3e12b-${RUN}-f2`, fAnim), CFG_INT),
    ]);
    const f1 = settled(fRace[0]!); const f2 = settled(fRace[1]!);
    const fWins = [f1, f2].filter((x) => x.ok);
    const fVendas = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key IN (?, ?)", [`ven-3e12b-${RUN}-f1`, `ven-3e12b-${RUN}-f2`]))[0]?.n);
    reg({
      id: "CONC-B",
      nome: "Duas chaves no mesmo animal: uma venda, sem efeito parcial",
      ok: fWins.length === 1 && fVendas === 1 && await baixasAtivas(fAnim) === 1 && await statusAnimal(fAnim) === "vendido",
      detalhe: { f1, f2, fVendas },
    });

    const gAnim = await seedAnimal("3E12B-G");
    const gVenda = await confirmarVendaIntegradaSeAtiva(store1, userId, cabeca(`ven-3e12b-${RUN}-g`, gAnim), CFG_INT);
    const gParc = await parcelaId(gVenda.tituloId);
    const gConc = await Promise.allSettled([
      canc2.cancelar(userId, { vendaId: gVenda.vendaId, motivo: "corrida cancel", canceladoPorUserId: userId }),
      nucleo2.criarRecebimento(userId, {
        contaId, dataLiquidacao: "2026-10-27", valorMovimentado: 1500,
        idempotencyKey: `rec-3e12b-${RUN}-g`,
        alocacoes: [{ parcelaId: gParc, principalLiquidado: 1500 }],
      }),
    ]);
    const gCanc = settled(gConc[0]!); const gRec = settled(gConc[1]!);
    const gTit = (await titulosVenda(gVenda.vendaId))[0];
    const gSt = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [gVenda.vendaId]))[0]?.status;
    const gConsistente = (gSt === "cancelado" && gTit?.estado === "cancelado" && await liqs(gVenda.tituloId) === 0 && await statusAnimal(gAnim) === "ativo")
      || (gSt === "concluido" && gTit?.estado === "ativo" && await liqs(gVenda.tituloId) === 1 && await statusAnimal(gAnim) === "vendido");
    reg({
      id: "CONC-C",
      nome: "Cancelamento vs recebimento no MySQL real",
      ok: gConsistente && (gCanc.ok !== gRec.ok || (gCanc.ok && gRec.ok === false) || (gRec.ok && !gCanc.ok)),
      detalhe: { gCanc, gRec, gSt, tit: gTit, animal: await statusAnimal(gAnim) },
    });

    const hAnim = await seedAnimal("3E12B-H");
    const hVenda = await confirmarVendaIntegradaSeAtiva(store1, userId, cabeca(`ven-3e12b-${RUN}-h`, hAnim), CFG_INT);
    const hCanc = await canc.cancelar(userId, { vendaId: hVenda.vendaId, motivo: "sem recebimento", canceladoPorUserId: userId });
    let hRep = "";
    try { await canc.cancelar(userId, { vendaId: hVenda.vendaId, motivo: "repetir", canceladoPorUserId: userId }); }
    catch (e) { hRep = msg(e); }
    reg({
      id: "CANC-A-B",
      nome: "Cancelar título aberto e recusar repetição",
      ok: hCanc.success && hCanc.tituloCancelado
        && (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [hVenda.vendaId]))[0]?.status === "cancelado"
        && (await titulosVenda(hVenda.vendaId))[0]?.estado === "cancelado"
        && await baixasAtivas(hAnim) === 0 && await baixasEst(hAnim) === 1
        && await statusAnimal(hAnim) === "ativo" && await liqs(hVenda.tituloId) === 0
        && hRep.includes(MSG_VENDA_CANCELAR_JA_CANCELADA),
      detalhe: { hCanc, hRep },
    });

    const iAnim = await seedAnimal("3E12B-I");
    const iVenda = await confirmarVendaIntegradaSeAtiva(store1, userId, cabeca(`ven-3e12b-${RUN}-i`, iAnim), CFG_INT);
    const recI = await nucleo.criarRecebimento(userId, {
      contaId, dataLiquidacao: "2026-10-27", valorMovimentado: 1500,
      idempotencyKey: `rec-3e12b-${RUN}-i`,
      alocacoes: [{ parcelaId: await parcelaId(iVenda.tituloId), principalLiquidado: 1500 }],
    });
    let iMsg = "";
    try { await canc.cancelar(userId, { vendaId: iVenda.vendaId, motivo: "com recebimento", canceladoPorUserId: userId }); }
    catch (e) { iMsg = msg(e); }
    reg({
      id: "CANC-C",
      nome: "Recebimento efetivo bloqueia cancelamento",
      ok: iMsg.includes(MSG_VENDA_CANCELAR_COM_RECEBIMENTO)
        && (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [iVenda.vendaId]))[0]?.status === "concluido"
        && (await titulosVenda(iVenda.vendaId))[0]?.estado === "ativo"
        && await statusAnimal(iAnim) === "vendido" && await baixasAtivas(iAnim) === 1
        && recI.id > 0,
      detalhe: { iMsg, recI: recI.id },
    });

    function storeAbort(ponto: "itens" | "titulo"): ConfirmarVendaFinanceiroStore {
      return {
        transaction(fn) {
          return d1.transaction(async (drizzleTx) => {
            const tx = createConfirmarVendaFinanceiroTxFromDrizzle(drizzleTx as FinanceiroDrizzleTx, new Map());
            if (ponto === "itens") {
              const orig = tx.insertItens.bind(tx);
              tx.insertItens = async (...args) => {
                await orig(...args);
                throw new Error("3E12B-ITENS-ABORT");
              };
            } else {
              tx.fin.insertTitulo = async () => {
                throw new Error("3E12B-TITULO-ABORT");
              };
            }
            return fn(tx);
          }) as Promise<ReturnType<typeof fn>>;
        },
      };
    }

    const rb1 = await seedAnimal("3E12B-RB1");
    let rb1Msg = "";
    try { await createConfirmarVendaFinanceiroService(storeAbort("titulo")).confirmar(userId, cabeca(`ven-3e12b-${RUN}-rb1`, rb1)); }
    catch (e) { rb1Msg = msg(e); }
    const rb1V = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = ?", [`ven-3e12b-${RUN}-rb1`]))[0]?.n);
    const rb1T = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos WHERE documento_referencia LIKE ?", [`VENDA-%`]))[0]?.n);
    reg({
      id: "RB-TITULO",
      nome: "Falha na criação do título: rollback integral",
      ok: rb1Msg.includes("3E12B-TITULO-ABORT") && rb1V === 0 && await statusAnimal(rb1) === "ativo" && await baixasAtivas(rb1) === 0,
      detalhe: { rb1Msg, rb1V, animal: await statusAnimal(rb1) },
    });

    const rb2 = await seedAnimal("3E12B-RB2");
    let rb2Msg = "";
    try { await createConfirmarVendaFinanceiroService(storeAbort("itens")).confirmar(userId, cabeca(`ven-3e12b-${RUN}-rb2`, rb2)); }
    catch (e) { rb2Msg = msg(e); }
    const rb2V = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = ?", [`ven-3e12b-${RUN}-rb2`]))[0]?.n);
    const rb2I = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM venda_itens vi JOIN animais a ON a.id = vi.animal_id WHERE a.id = ?", [rb2]))[0]?.n);
    reg({
      id: "RB-ITENS",
      nome: "Falha após itens, antes do commit: rollback integral",
      ok: rb2Msg.includes("3E12B-ITENS-ABORT") && rb2V === 0 && rb2I === 0 && await statusAnimal(rb2) === "ativo" && await baixasAtivas(rb2) === 0,
      detalhe: { rb2Msg, rb2V, rb2I },
    });

    const histDepoisSeed = await q<{ id: number; status: string; idempotency_key: string | null }[]>(
      pool, "SELECT id, status, idempotency_key FROM vendas WHERE id IN (?, ?) ORDER BY id",
      [histAntes[0]?.id ?? 0, histAntes[1]?.id ?? 0],
    );
    const histTit = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id IN (?, ?)", [histAntes[0]?.id ?? 0, histAntes[1]?.id ?? 0]))[0]?.n);
    let hist2 = histAntes.find((v) => v.status === "concluido" && v.idempotency_key == null);
    let histCancDet: Record<string, unknown> = {};
    if (!hist2) {
      const histAnim = await seedAnimal("3E12B-HIST");
      await pool.query(
        `INSERT INTO vendas (user_id, comprador, data, quantidade_animais, valor_total, status, fazenda_id, comprador_id, forma_precificacao, idempotency_key)
         VALUES (?, 'Historico Sintetico', '2026-10-20', 1, '1500.00', 'concluido', ?, ?, 'cabeca', NULL)`,
        [userId, fazendaId, pessoaId],
      );
      const histVendaId = Number((await q<{ id: number }[]>(pool, "SELECT LAST_INSERT_ID() id"))[0]?.id);
      await pool.query(
        `INSERT INTO venda_itens (user_id, venda_id, animal_id, brinco_snapshot, forma_precificacao, preco_unitario, valor_item)
         VALUES (?, ?, ?, 'HIST', 'cabeca', '1500.00', '1500.00')`,
        [userId, histVendaId, histAnim],
      );
      await pool.query("UPDATE animais SET status = 'vendido' WHERE id = ?", [histAnim]);
      await pool.query(
        `INSERT INTO animal_baixas (userId, animalId, fazendaId, tipo, dataBaixa, destino, vendaId, status)
         VALUES (?, ?, ?, 'venda', '2026-10-20', 'Historico Sintetico', ?, 'ativa')`,
        [userId, histAnim, fazendaId, histVendaId],
      );
      hist2 = { id: histVendaId, status: "concluido", idempotency_key: null, user_id: userId };
      histCancDet.sintetica = true;
    }
    const histCanc = await canc.cancelar(hist2.user_id, {
      vendaId: hist2.id, motivo: "compatibilidade historica 3e12b", canceladoPorUserId: hist2.user_id,
    });
    const st = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [hist2.id]))[0]?.status;
    const histCancOk = histCanc.success && histCanc.vendaAntigaSemTitulo === true && histCanc.tituloId == null && st === "cancelado";
    histCancDet = { ...histCancDet, histCanc, st };
    reg({
      id: "HIST",
      nome: "Vendas históricas sanitizadas: sem chave, sem título retroativo, cancelamento comercial",
      ok: histAntes.length === 2
        && histAntes.every((v) => v.idempotency_key == null)
        && histTit === 0
        && histCancOk,
      detalhe: { histAntes, histDepoisSeed, histTit, ...histCancDet },
    });

    const testUrl = `mysql://${encodeURIComponent(TEST_USER)}:${encodeURIComponent(pass)}@127.0.0.1:${cred.port}/${TESTE}`;
    relatorio.databaseUrlTeste = {
      host: "127.0.0.1", port: cred.port, database: TESTE, user: TEST_USER,
      urlSha12: createHash("sha256").update(testUrl).digest("hex").slice(0, 12),
      apontaOperacional: /\/fazenda_digital(\?|$)/.test(new URL(testUrl).pathname) && new URL(testUrl).pathname.endsWith(OPERACIONAL),
    };

    const spawnEnv = {
      ...process.env,
      DATABASE_URL: testUrl,
      NODE_ENV: "production",
      JWT_SECRET: cred.jwtSecret || process.env.JWT_SECRET || "homolog-3e12b-local",
    };
    childCom = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: join(dirname(fileURLToPath(import.meta.url)), ".."),
      env: { ...spawnEnv, PORT: String(PORT_COMERCIAL) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const bootCom = await waitFor(childCom, /Server running on http:\/\/localhost:3100/, 50000);
    childHar = spawn(process.execPath, ["--import", "tsx", "scripts/homolog-3e12b-trpc-integrado.ts"], {
      cwd: join(dirname(fileURLToPath(import.meta.url)), ".."),
      env: { ...spawnEnv, PORT: String(PORT_HARNESS) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const bootHar = await waitFor(childHar, /3E12B harness INTEGRADO/, 40000);
    relatorio.boot = {
      comercial: { code: bootCom.code, trecho: bootCom.out.split(/\r?\n/).filter((l) => /\[schema\]|Server running/.test(l)).slice(0, 8) },
      harness: { code: bootHar.code, trecho: bootHar.out.split(/\r?\n/).slice(-6) },
    };

    const baseCom = `http://127.0.0.1:${PORT_COMERCIAL}`;
    const baseHar = `http://127.0.0.1:${PORT_HARNESS}`;
    const login = await trpc(baseCom, "auth.login", {
      method: "POST",
      body: { username: "homolog.3e12b@local.test", password: userPass },
    });
    const cookie = login.cookie;
    const estadoCom = await trpc(baseCom, "vendas.estadoConfirmacaoVenda", { cookie });
    const flagCom = await trpc(baseCom, "vendas.integracaoConfirmacaoAtiva", { cookie });
    const trAnim = await seedAnimal("3E12B-TRPC");
    const integOff = await trpc(baseCom, "vendas.confirmarIntegrada", {
      method: "POST", cookie,
      body: {
        idempotencyKey: `ven-3e12b-${RUN}-trpc-off`, fazendaId, data: "2026-10-27", compradorId: pessoaId,
        formaPrecificacao: "cabeca", itens: [{ animalId: trAnim, precoUnitario: 1500 }], condicao: "a_vista",
      },
    });
    const estadoHar = await trpc(baseHar, "vendas.estadoConfirmacaoVenda", { cookie });
    const comercialHar = await trpc(baseHar, "vendas.confirmar", {
      method: "POST", cookie,
      body: {
        fazendaId, data: "2026-10-27", compradorId: pessoaId, formaPrecificacao: "cabeca",
        itens: [{ animalId: trAnim, precoUnitario: 1500 }],
      },
    });
    const confHar = await trpc(baseHar, "vendas.confirmarIntegrada", {
      method: "POST", cookie,
      body: {
        idempotencyKey: `ven-3e12b-${RUN}-trpc`, fazendaId, data: "2026-10-27", compradorId: pessoaId,
        formaPrecificacao: "cabeca", itens: [{ animalId: trAnim, precoUnitario: 1500 }], condicao: "a_vista",
      },
    });
    const confHarJson = trpcData(confHar.json) as { vendaId?: number; tituloId?: number; idempotente?: boolean } | null;
    const retryHar = await trpc(baseHar, "vendas.confirmarIntegrada", {
      method: "POST", cookie,
      body: {
        idempotencyKey: `ven-3e12b-${RUN}-trpc`, fazendaId, data: "2026-10-27", compradorId: pessoaId,
        formaPrecificacao: "cabeca", itens: [{ animalId: trAnim, precoUnitario: 1500 }], condicao: "a_vista",
      },
    });
    const retryJson = trpcData(retryHar.json) as { vendaId?: number; tituloId?: number; idempotente?: boolean } | null;
    const getCom = await trpc(baseCom, `vendas.get?input=${encodeURIComponent(JSON.stringify({ json: { id: confHarJson?.vendaId ?? 0 } }))}`, { cookie });
    const cancHar = await trpc(baseHar, "vendas.cancelar", {
      method: "POST", cookie,
      body: { id: confHarJson?.vendaId, motivo: "cancelamento tRPC 3e12b" },
    });
    const page = await fetch(`${baseCom}/venda/nova`).then(async (r) => ({ status: r.status, text: (await r.text()).slice(0, 400) })).catch((e) => ({ status: 0, text: msg(e) }));

    const offMsg = JSON.stringify(integOff.json);
    const comHarMsg = JSON.stringify(comercialHar.json);
    reg({
      id: "TRPC",
      nome: "Servidor real COMERCIAL + harness INTEGRADO injetado",
      ok: login.status === 200 && Boolean(cookie)
        && trpcData(estadoCom.json) === "comercial" && trpcData(flagCom.json) === false
        && /ainda não está ligada|FORBIDDEN|INTEGRADA/i.test(offMsg)
        && trpcData(estadoHar.json) === "integrado"
        && /comercial antiga não pode|FORBIDDEN/i.test(comHarMsg)
        && Number(confHarJson?.vendaId) > 0 && Number(confHarJson?.tituloId) > 0
        && retryJson?.idempotente === true && retryJson.vendaId === confHarJson?.vendaId
        && cancHar.status === 200,
      detalhe: {
        login: login.status, estadoCom: trpcData(estadoCom.json), flagCom: trpcData(flagCom.json),
        integOff: offMsg.slice(0, 220), estadoHar: trpcData(estadoHar.json),
        comercialHar: comHarMsg.slice(0, 180), confHar: confHarJson, retry: retryJson,
        getCom: getCom.status, cancHar: cancHar.status, page,
      },
    });
    relatorio.interface = {
      paginaNovaVenda: page,
      ressalva: "A tela Nova Venda no servidor real permanece COMERCIAL (constantes de produção). O fluxo INTEGRADO HTTP foi o harness isolado, não o DOM React.",
    };

    const orfaos = {
      titulosSemVenda: Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM financeiro_titulos t
        WHERE t.origem_tipo = 'venda_animais' AND NOT EXISTS (SELECT 1 FROM vendas v WHERE v.id = t.origem_id)`))[0]?.n),
      vendasIntegradasSemTitulo: Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM vendas v
        WHERE v.idempotency_key IS NOT NULL AND v.status = 'concluido'
          AND NOT EXISTS (SELECT 1 FROM financeiro_titulos t WHERE t.origem_tipo = 'venda_animais' AND t.origem_id = v.id)`))[0]?.n),
      duplicatas: Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM (
        SELECT origem_id FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' GROUP BY user_id, origem_id, origem_item_chave HAVING COUNT(*) > 1
      ) x`))[0]?.n),
    };
    relatorio.descartavelFinal = {
      ...(await snapshotOps(admin, TESTE)),
      orfaos,
      vendasNovas: await q(pool, "SELECT id, status, idempotency_key, valor_total FROM vendas WHERE idempotency_key LIKE ? ORDER BY id", [`ven-3e12b-${RUN}%`]),
    };
    reg({
      id: "INT-DESC",
      nome: "Integridade do schema descartável",
      ok: orfaos.titulosSemVenda === 0 && orfaos.vendasIntegradasSemTitulo === 0 && orfaos.duplicatas === 0,
      detalhe: orfaos,
    });

    const depoisOp = await snapshotOps(admin, OPERACIONAL);
    relatorio.operacionalDepois = depoisOp;
    const opOk = depoisOp.tables === 55 && depoisOp.fks === 27 && depoisOp.vendas === 2
      && depoisOp.itens === 6 && depoisOp.baixas === 9 && depoisOp.titulos === 6
      && depoisOp.titulosVenda === 0 && depoisOp.animais === 37
      && depoisOp.col0061?.IS_NULLABLE === "YES" && depoisOp.idx0061.length >= 2;
    reg({
      id: "OP",
      nome: "Operacional intacto (somente SELECT)",
      ok: opOk && JSON.stringify(antesOp) === JSON.stringify(depoisOp),
      detalhe: { antesOp, depoisOp },
    });
  } finally {
    await killChild(childCom);
    await killChild(childHar);
    if (pool) await pool.end();
    if (pool2) await pool2.end();
    await admin.end();
  }

  relatorio.cenarios = cenarios;
  relatorio.problemas = problemas;
  relatorio.arquivos = [
    "scripts/homolog-3e12b.ts",
    "scripts/homolog-3e12b-trpc-integrado.ts",
  ];
  const aprovados = cenarios.filter((c) => c.ok).length;
  const parecer = !cenarios.find((c) => c.id === "ISO")?.ok
    ? "BLOQUEADO POR ISOLAMENTO"
    : problemas.length === 0
      ? "HOMOLOGADO COM RESSALVAS"
      : cenarios.filter((c) => ["CONF", "IDEM-A", "IDEM-B", "CONC-A", "CONC-B", "CANC-A-B", "CANC-C", "RB-TITULO", "TRPC", "OP"].includes(c.id) && !c.ok).length
        ? "REPROVADO"
        : "HOMOLOGADO COM RESSALVAS";
  relatorio.parecer = parecer;
  relatorio.placar = { aprovados, total: cenarios.length, problemas: problemas.length };
  const outFile = join(SECRETS_DIR, "homolog-3e12b-relatorio.json");
  writeFileSync(outFile, JSON.stringify(relatorio, null, 2), "utf8");
  console.log(JSON.stringify({
    fase: "3E.12B",
    parecer,
    placar: relatorio.placar,
    problemas,
    cenarios: cenarios.map((c) => ({ id: c.id, ok: c.ok, nome: c.nome })),
    interface: relatorio.interface,
    isolamento: relatorio.isolamento,
  }, null, 2));
  if (parecer === "BLOQUEADO POR ISOLAMENTO") process.exit(2);
}

main().catch((err) => {
  console.error("FALHA 3E.12B", err);
  process.exit(1);
});
