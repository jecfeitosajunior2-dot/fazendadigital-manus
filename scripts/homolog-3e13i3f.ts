/**
 * Homologação 3E.13I.3F — uma venda a prazo fictícia no schema isolado.
 * Não grava em fazenda_digital. Não usa financeiroMysqlHarness.
 * Não inicia o servidor oficial. Não reutiliza ven-89a2b5d471fa470d9d60adbf1eb26ce6.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { createConfirmarVendaFinanceiroMysqlStore } from "../server/confirmarVendaFinanceiroMysql";
import { confirmarVendaIntegradaSeAtiva } from "../server/vendaConfirmacaoIntegrada";
import { TRPCError } from "@trpc/server";

const TESTE = "fazenda_digital_test_3e13i3";
const TEST_USER = "fd_3e13i3";
const TEST_HOSTS = ["localhost", "%"] as const;
const OPERACIONAL = "fazenda_digital";
const PROTEGIDOS = [
  OPERACIONAL,
  "fazenda_digital_restore_3e11b_20261026",
  "fazenda_digital_homolog_3c47",
  "fazenda_digital_homolog_3b2a3",
  "fazenda_digital_test_boot_3e11e2",
  "fazenda_digital_test_integracao_3e12b",
] as const;
const CHAVE_PROIBIDA = "ven-89a2b5d471fa470d9d60adbf1eb26ce6";
const EVID = "C:/Users/Pedro Neto/FazendaDigital-backups/homolog-3e13i3f";
const SECRETS_DIR = "C:/Users/Pedro Neto/FazendaDigital-backups/.secrets";
const TABELAS = [
  "users",
  "fazendas",
  "pessoas",
  "lotes",
  "animais",
  "vendas",
  "venda_itens",
  "animal_baixas",
  "financeiro_contas",
  "financeiro_titulos",
  "financeiro_parcelas",
  "financeiro_apropriacoes",
  "financeiro_liquidacoes",
  "financeiro_liquidacao_alocacoes",
  "financeiro_movimentos",
] as const;

type Relatorio = Record<string, unknown>;

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
  if (!raw) throw new Error("ABORT: DATABASE_URL admin ausente");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("ABORT: DATABASE_URL admin inválida");
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) {
    throw new Error("ABORT: host não é MySQL local");
  }
  const db = (u.pathname || "").replace(/^\//, "").split("?")[0];
  if (db !== OPERACIONAL) throw new Error(`ABORT: URL admin aponta para ${db}`);
  return {
    host: u.hostname === "localhost" ? "127.0.0.1" : u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
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

function assertTeste(nome: string | null | undefined) {
  if (nome !== TESTE) throw new Error(`ABORT: DATABASE()=${nome}, esperado ${TESTE}`);
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function detalheErro(e: unknown) {
  const err = e as { code?: string; errno?: number; sqlState?: string; name?: string };
  return {
    name: e instanceof Error ? e.name : typeof e,
    code: err?.code ?? (e instanceof TRPCError ? e.code : undefined),
    message: msg(e).slice(0, 400),
    errno: typeof err?.errno === "number" ? err.errno : undefined,
    sqlState: err?.sqlState,
    trpc: e instanceof TRPCError,
  };
}

async function snapshotOp(admin: mysql.Connection) {
  const count = async (t: string) =>
    Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.\`${t}\``))[0]?.n);
  const [animal] = await q<{ id: number; brinco: string; status: string; fazendaId: number }[]>(
    admin,
    `SELECT id, brinco, status, fazendaId FROM \`${OPERACIONAL}\`.animais WHERE id = 35`,
  );
  const [venda4] = await q<{ id: number; status: string; valor_total: string }[]>(
    admin,
    `SELECT id, status, valor_total FROM \`${OPERACIONAL}\`.vendas WHERE id = 4`,
  );
  const [titulo107] = await q<{ id: number; estado: string; valor_original: string }[]>(
    admin,
    `SELECT id, estado, valor_original FROM \`${OPERACIONAL}\`.financeiro_titulos WHERE id = 107`,
  );
  const [caixa] = await q<{ id: number; nome: string; saldo: string }[]>(
    admin,
    `SELECT c.id, c.nome,
            COALESCE(SUM(CASE WHEN m.direcao='entrada' THEN m.valor WHEN m.direcao='saida' THEN -m.valor ELSE 0 END),0) saldo
     FROM \`${OPERACIONAL}\`.financeiro_contas c
     LEFT JOIN \`${OPERACIONAL}\`.financeiro_movimentos m ON m.conta_id = c.id
     WHERE c.id = 97`,
  );
  const chaveProibida = Number((await q<{ n: number }[]>(
    admin,
    `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.vendas WHERE idempotency_key = ?`,
    [CHAVE_PROIBIDA],
  ))[0]?.n);
  return {
    vendas: await count("vendas"),
    itens: await count("venda_itens"),
    baixas: await count("animal_baixas"),
    titulos: await count("financeiro_titulos"),
    parcelas: await count("financeiro_parcelas"),
    liquidacoes: await count("financeiro_liquidacoes"),
    alocacoes: await count("financeiro_liquidacao_alocacoes"),
    movimentos: await count("financeiro_movimentos"),
    finContas: await count("financeiro_contas"),
    animal35: animal ?? null,
    venda4: venda4 ?? null,
    titulo107: titulo107 ?? null,
    caixa97: caixa ?? null,
    chaveProibida,
  };
}

function conferirDocker() {
  const engine = execFileSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" }).trim();
  if (!engine) throw new Error("ABORT: Docker Engine sem versão");
  const health = execFileSync(
    "docker",
    ["inspect", "-f", "{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}", "fazenda-digital-mysql"],
    { encoding: "utf8" },
  ).trim();
  if (!/^running healthy$/i.test(health) && !/healthy/i.test(health)) {
    throw new Error(`ABORT: container MySQL não saudável (${health})`);
  }
  return { engine, health };
}

async function main() {
  mkdirSync(EVID, { recursive: true });
  const relatorio: Relatorio = {
    fase: "3E.13I.3F",
    schema: TESTE,
    chaveProibida: CHAVE_PROIBIDA,
    escritaOperacional: false,
  };

  delete process.env.DATABASE_URL;

  const docker = conferirDocker();
  relatorio.infra = docker;

  const cred = credenciaisAdmin();
  delete process.env.DATABASE_URL;

  const admin = await mysql.createConnection({
    host: cred.host,
    port: cred.port,
    user: cred.user,
    password: cred.password,
    multipleStatements: false,
  });

  let pool: mysql.Pool | null = null;
  const logsServidor: unknown[] = [];
  const consoleError = console.error;
  console.error = (...args: unknown[]) => {
    logsServidor.push(args.map(a => (typeof a === "string" || typeof a === "number" || a == null ? a : JSON.parse(JSON.stringify(a, (_k, v) => {
      if (typeof v === "string" && /password|secret|token|cookie/i.test(_k)) return "***";
      return v;
    })))));
    consoleError.apply(console, args);
  };

  try {
    const [meta] = await q<{ ver: string; db: string | null }[]>(admin, "SELECT @@version AS ver, DATABASE() AS db");
    relatorio.mysql = { version: meta.ver, adminDatabase: meta.db };
    if (meta.db && (PROTEGIDOS as readonly string[]).includes(meta.db)) {
      await admin.query("USE information_schema");
    }

    const antesOp = await snapshotOp(admin);
    relatorio.operacionalAntes = antesOp;
    if (antesOp.chaveProibida !== 0) {
      throw new Error("ABORT: chave proibida encontrada no operacional antes do teste");
    }

    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${TESTE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);

    mkdirSync(SECRETS_DIR, { recursive: true });
    const passFile = join(SECRETS_DIR, "fd-3e13i3.pass");
    const pass = existsSync(passFile) ? readFileSync(passFile, "utf8").trim() : randomBytes(18).toString("base64url");
    writeFileSync(passFile, pass, { encoding: "utf8" });

    const contas: string[] = [];
    for (const host of TEST_HOSTS) {
      const conta = `'${TEST_USER}'@'${host}'`;
      contas.push(conta);
      const existe = Number((await q<{ n: number }[]>(
        admin,
        "SELECT COUNT(*) n FROM mysql.user WHERE User = ? AND Host = ?",
        [TEST_USER, host],
      ))[0]?.n);
      if (!existe) await admin.query(`CREATE USER ${conta} IDENTIFIED BY '${pass}'`);
      else await admin.query(`ALTER USER ${conta} IDENTIFIED BY '${pass}'`);
      try { await admin.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${conta}`); } catch { /* USAGE */ }
      await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE, LOCK TABLES ON \`${TESTE}\`.* TO ${conta}`);
    }
    await admin.query("FLUSH PRIVILEGES");

    const grants = (await Promise.all(contas.map(c => q<{ [k: string]: string }[]>(admin, `SHOW GRANTS FOR ${c}`))))
      .flat()
      .map(r => String(Object.values(r)[0]).replace(/IDENTIFIED BY\s+'[^']*'/gi, "IDENTIFIED BY ***"));
    const toca = (nome: string) => grants.some(g => new RegExp(`\\bon\\s+\`?${nome}\`?\\.`, "i").test(g));
    const isolamento = {
      grants,
      tocaOperacional: toca(OPERACIONAL),
      tocaOutroProtegido: PROTEGIDOS.filter(p => p !== OPERACIONAL).some(toca),
      allWrite: grants.some(g => /\bon\s+\*\.\*/i.test(g) && /grant\s+(?!usage\b)/i.test(g)),
    };
    if (isolamento.tocaOperacional || isolamento.tocaOutroProtegido || isolamento.allWrite) {
      throw new Error(`BLOQUEADO POR ISOLAMENTO: ${grants.join(" | ")}`);
    }

    const probe = await mysql.createConnection({
      host: cred.host, port: cred.port, user: TEST_USER, password: pass, database: TESTE,
    });
    const [probeMeta] = await q<{ db: string }[]>(probe, "SELECT DATABASE() AS db");
    assertTeste(probeMeta.db);
    let operacionalNegado = false;
    try {
      await probe.query(`SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.vendas`);
    } catch (err) {
      operacionalNegado = /denied|1142|1044/i.test(msg(err));
    }
    await probe.end();
    if (!operacionalNegado) throw new Error("BLOQUEADO POR ISOLAMENTO: usuário de teste leu fazenda_digital");
    relatorio.isolamento = { ...isolamento, probeDb: probeMeta.db, operacionalNegado };

    await admin.query(`USE \`${TESTE}\``);
    assertTeste((await q<{ db: string }[]>(admin, "SELECT DATABASE() AS db"))[0]?.db);
    await admin.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const tabela of [...TABELAS].reverse()) {
      await admin.query(`DROP TABLE IF EXISTS \`${tabela}\``);
    }
    for (const tabela of TABELAS) {
      await admin.query(`CREATE TABLE \`${TESTE}\`.\`${tabela}\` LIKE \`${OPERACIONAL}\`.\`${tabela}\``);
    }
    await admin.query("SET FOREIGN_KEY_CHECKS = 1");
    assertTeste((await q<{ db: string }[]>(admin, "SELECT DATABASE() AS db"))[0]?.db);
    const dadosOpNoTeste = Number((await q<{ n: number }[]>(
      admin,
      `SELECT COUNT(*) n FROM \`${TESTE}\`.animais`,
    ))[0]?.n);
    if (dadosOpNoTeste !== 0) throw new Error("ABORT: clone trouxe dados de animais");

    pool = mysql.createPool({
      host: cred.host,
      port: cred.port,
      user: TEST_USER,
      password: pass,
      database: TESTE,
      connectionLimit: 6,
    });
    assertTeste((await q<{ db: string }[]>(pool, "SELECT DATABASE() db"))[0]?.db);

    await pool.query(
      "INSERT INTO users (openId, name, email, loginMethod, passwordHash, role) VALUES (?, ?, ?, 'local', '!', 'user')",
      ["homolog-3e13i3", "Homolog 3E13I3", "homolog.3e13i3@local.test"],
    );
    const userId = Number((await q<{ id: number }[]>(pool, "SELECT id FROM users WHERE openId = 'homolog-3e13i3'"))[0]?.id);
    await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda ficticia 3E13I3')", [userId]);
    const fazendaId = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id DESC LIMIT 1", [userId]))[0]?.id);
    await pool.query(
      "INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Comprador ficticio 3E13I3', 'cliente', 1)",
      [userId],
    );
    const compradorId = Number((await q<{ id: number }[]>(
      pool,
      "SELECT id FROM pessoas WHERE user_id = ? AND nome = 'Comprador ficticio 3E13I3'",
      [userId],
    ))[0]?.id);
    await pool.query(
      "INSERT INTO animais (`userId`, `brinco`, `sexo`, `status`, `fazendaId`) VALUES (?, 'FIC-3E13I3', 'macho', 'ativo', ?)",
      [userId, fazendaId],
    );
    const animalId = Number((await q<{ id: number }[]>(
      pool,
      "SELECT id FROM animais WHERE userId = ? AND brinco = 'FIC-3E13I3'",
      [userId],
    ))[0]?.id);
    if (!userId || !fazendaId || !compradorId || !animalId) throw new Error("ABORT: seed fictício incompleto");

    const chave = `ven-3e13i3f-${randomBytes(12).toString("hex")}`;
    if (chave === CHAVE_PROIBIDA || chave.includes("89a2b5d471fa470d")) {
      throw new Error("ABORT: chave gerada colidiu com a proibida");
    }

    relatorio.ficticios = {
      userId, fazendaId, compradorId, animalId, brinco: "FIC-3E13I3", chave,
      data: "2026-10-28", vencimento: "2026-11-27", condicao: "a_prazo", total: 3000,
    };

    const store = createConfirmarVendaFinanceiroMysqlStore(drizzle(pool, { schema, mode: "default" }));
    relatorio.caminho = [
      "confirmarVendaIntegradaSeAtiva",
      "createConfirmarVendaFinanceiroService.confirmar",
      "confirmarVendaFinanceiroAtomico",
      "createConfirmarVendaFinanceiroMysqlStore",
    ];

    let confirmacao: unknown = null;
    let falha: ReturnType<typeof detalheErro> | null = null;
    try {
      confirmacao = await confirmarVendaIntegradaSeAtiva(
        store,
        userId,
        {
          idempotencyKey: chave,
          fazendaId,
          data: "2026-10-28",
          compradorId,
          formaPrecificacao: "kg",
          precoPadrao: 10,
          itens: [{ animalId, pesoVenda: 300, precoUnitario: 10 }],
          condicao: "a_prazo",
          parcelas: [{ numero: 1, vencimento: "2026-11-27", valorOriginal: 3000 }],
          usuarioNome: "Homolog 3E13I3",
        },
        { estado: "integrado" },
      );
    } catch (err) {
      falha = detalheErro(err);
    }

    relatorio.confirmacao = confirmacao;
    relatorio.falha = falha;
    relatorio.logsServidor = logsServidor;

    const persistido = {
      vendas: await q(pool, "SELECT id, status, valor_total, idempotency_key, forma_precificacao FROM vendas"),
      itens: await q(pool, "SELECT id, venda_id, animal_id, peso_venda, preco_unitario, valor_item FROM venda_itens"),
      baixas: await q(pool, "SELECT id, animalId, status, vendaId, tipo FROM animal_baixas"),
      animal: await q(pool, "SELECT id, brinco, status, fazendaId FROM animais"),
      titulos: await q(pool, "SELECT id, estado, valor_original, origem_tipo, origem_id, observacoes FROM financeiro_titulos"),
      parcelas: await q(pool, "SELECT id, titulo_id, numero, vencimento, valor_original FROM financeiro_parcelas"),
      liquidacoes: Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes"))[0]?.n),
      alocacoes: Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacao_alocacoes"))[0]?.n),
      movimentos: Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_movimentos"))[0]?.n),
      schema: (await q<{ db: string }[]>(pool, "SELECT DATABASE() db"))[0]?.db,
    };
    relatorio.persistido = persistido;

    const depoisOp = await snapshotOp(admin);
    relatorio.operacionalDepois = depoisOp;
    relatorio.operacionalIntacto = JSON.stringify(antesOp) === JSON.stringify(depoisOp);

    if (!relatorio.operacionalIntacto) {
      relatorio.parecer = "DIVERGENCIA OPERACIONAL";
    } else if (falha) {
      relatorio.parecer = falha.code === "INTERNAL_SERVER_ERROR" ? "REPRODUZIU 500 INTERNO" : "FALHOU COM ERRO CONHECIDO";
    } else {
      const vendaOk = Array.isArray(persistido.vendas) && persistido.vendas.length === 1;
      relatorio.parecer = vendaOk ? "VENDA FICTICIA CONFIRMADA" : "RESULTADO INESPERADO";
    }
  } finally {
    console.error = consoleError;
    if (pool) await pool.end();
    await admin.end();
  }

  writeFileSync(join(EVID, "resultado.json"), JSON.stringify(relatorio, null, 2), "utf8");
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "../.local-data/homolog-3e13i3f-resultado.json"), JSON.stringify({
    parecer: relatorio.parecer,
    isolamento: relatorio.isolamento,
    ficticios: relatorio.ficticios,
    confirmacao: relatorio.confirmacao,
    falha: relatorio.falha,
    logsServidor: relatorio.logsServidor,
    persistidoResumo: {
      schema: (relatorio.persistido as { schema?: string } | undefined)?.schema,
      vendas: (relatorio.persistido as { vendas?: unknown[] } | undefined)?.vendas,
      parcelas: (relatorio.persistido as { parcelas?: unknown[] } | undefined)?.parcelas,
      liquidacoes: (relatorio.persistido as { liquidacoes?: number } | undefined)?.liquidacoes,
    },
    operacionalIntacto: relatorio.operacionalIntacto,
  }, null, 2), "utf8");
  console.log(JSON.stringify({
    fase: relatorio.fase,
    parecer: relatorio.parecer,
    isolamento: { probeDb: (relatorio.isolamento as { probeDb?: string })?.probeDb, operacionalNegado: (relatorio.isolamento as { operacionalNegado?: boolean })?.operacionalNegado },
    ficticios: relatorio.ficticios,
    confirmacao: relatorio.confirmacao,
    falha: relatorio.falha,
    logsServidor: relatorio.logsServidor,
    operacionalIntacto: relatorio.operacionalIntacto,
    evidencia: join(EVID, "resultado.json"),
  }, null, 2));

  if (relatorio.parecer === "DIVERGENCIA OPERACIONAL") process.exit(2);
}

main().catch(err => {
  const texto = msg(err);
  try {
    mkdirSync(EVID, { recursive: true });
    writeFileSync(join(EVID, "abort.json"), JSON.stringify({ erro: texto.slice(0, 800) }, null, 2));
  } catch { /* */ }
  console.error("[3e13i3f]", texto);
  process.exit(texto.includes("BLOQUEADO") || texto.startsWith("ABORT") ? 2 : 1);
});
