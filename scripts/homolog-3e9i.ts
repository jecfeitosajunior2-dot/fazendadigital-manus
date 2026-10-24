/**
 * Homologação 3E.9I — proteção das rotas de confirmação (3E.9H).
 * Escritas somente em fazenda_digital_test_3e8e.
 * Não altera a constante da flag. Não aplica 0061. Não usa server/db (operacional).
 * confirmarVendaComercial não é chamado: com flag false gravaria no operacional.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import type { ConfirmarVendaFinanceiroInput } from "../server/confirmarVendaFinanceiro";
import { createConfirmarVendaFinanceiroMysqlStore } from "../server/confirmarVendaFinanceiroMysql";
import { createCancelarVendaFinanceiroService } from "../server/cancelarVendaFinanceiro";
import { createCancelarVendaFinanceiroMysqlStore } from "../server/cancelarVendaFinanceiroMysql";
import {
  confirmarVendaComercialSePermitida,
  confirmarVendaIntegradaSeAtiva,
} from "../server/vendaConfirmacaoIntegrada";
import {
  INTEGRACAO_CONFIRMACAO_VENDA_ATIVA,
  MSG_VENDA_CONFIRMACAO_COMERCIAL_BLOQUEADA,
  MSG_VENDA_CONFIRMACAO_INTEGRADA_DESLIGADA,
  autorizarRotaConfirmacaoVenda,
} from "../shared/vendaIntegracao";

const TESTE = "fazenda_digital_test_3e8e";
const TESTE_3E5B = "fazenda_digital_test_3e5b";
const OPERACIONAL = "fazenda_digital";
const HOMOLOG_3C47 = "fazenda_digital_homolog_3c47";
const HOMOLOG_3B2A3 = "fazenda_digital_homolog_3b2a3";
const PROTEGIDOS = [OPERACIONAL, HOMOLOG_3C47, HOMOLOG_3B2A3, TESTE_3E5B] as const;
const USER_A = 940001;
const RUN = Date.now().toString(36);
const PREFIXOS_ANTERIORES = [
  "ven-3e8e%", "ven-3e8f%", "ven-3e8g%", "ven-3e8h%", "ven-3e8i%",
  "ven-3e9b1%", "ven-3e9b2%", "ven-3e9e%", "ven-3e9f%",
] as const;

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

function credenciais() {
  const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };
  const raw = env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL ausente");
  const u = new URL(raw);
  if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) throw new Error("ABORT: host não é MySQL local");
  if ((u.pathname || "").replace(/^\//, "").split("?")[0] !== OPERACIONAL) {
    throw new Error("ABORT: URL operacional inesperada");
  }
  return { host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
}

async function q<T extends mysql.RowDataPacket[]>(conn: mysql.Connection | mysql.Pool, sqlText: string, params: unknown[] = []) {
  const [rows] = await conn.query(sqlText, params);
  return rows as T;
}

function assertTeste(nome: string | null) {
  if (nome !== TESTE) throw new Error(`ABORT: conexão em ${nome}, esperado ${TESTE}`);
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

async function snapshotBanco(admin: mysql.Connection, schemaName: string) {
  const existe = Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [schemaName]))[0]?.n);
  if (!existe) return { existe: false as const, schemaName };
  const count = async (tabela: string) => {
    const tem = Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?", [schemaName, tabela]))[0]?.n);
    if (!tem) return null;
    return Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${schemaName}\`.\`${tabela}\``))[0]?.n);
  };
  const [chk] = await admin.query(
    `CHECKSUM TABLE \`${schemaName}\`.vendas, \`${schemaName}\`.animais, \`${schemaName}\`.financeiro_titulos, \`${schemaName}\`.financeiro_movimentos, \`${schemaName}\`.financeiro_liquidacoes`,
  );
  return {
    existe: true as const, schemaName,
    vendas: await count("vendas"), animais: await count("animais"),
    titulos: await count("financeiro_titulos"), movimentos: await count("financeiro_movimentos"),
    liquidacoes: await count("financeiro_liquidacoes"),
    checksums: Object.fromEntries((chk as Array<{ Table: string; Checksum: number | null }>).map(r => [String(r.Table).split(".").pop(), r.Checksum])),
  };
}

async function seedAnimal(pool: mysql.Pool, userId: number, fazendaId: number, brinco: string) {
  const brincoRun = `${brinco}-${RUN}`;
  await pool.query(
    "INSERT INTO animais (`userId`, `brinco`, `sexo`, `status`, `fazendaId`) VALUES (?, ?, 'macho', 'ativo', ?)",
    [userId, brincoRun, fazendaId],
  );
  return Number((await q<{ id: number }[]>(pool, "SELECT id FROM animais WHERE brinco = ? AND userId = ? ORDER BY id DESC LIMIT 1", [brincoRun, userId]))[0]?.id);
}

function wrapStore(inner: ReturnType<typeof createConfirmarVendaFinanceiroMysqlStore>) {
  let transacoes = 0;
  return {
    transacoes: () => transacoes,
    store: {
      transaction<T>(fn: Parameters<typeof inner.transaction>[0]) {
        transacoes += 1;
        return inner.transaction(fn);
      },
    },
  };
}

async function main() {
  if (INTEGRACAO_CONFIRMACAO_VENDA_ATIVA !== false) {
    throw new Error("ABORT: constante de produção não está false");
  }

  const cenarios: Cenario[] = [];
  const problemas: string[] = [];
  const cred = credenciais();
  const admin = await mysql.createConnection({ host: cred.host, port: cred.port, user: cred.user, password: cred.password });
  let pool: mysql.Pool | null = null;
  const reg = (c: Cenario) => {
    cenarios.push(c);
    if (!c.ok) problemas.push(`${c.id}: ${c.erro || JSON.stringify(c.detalhe)}`);
  };

  try {
    const [adminDb] = await q<{ db: string | null }[]>(admin, "SELECT DATABASE() db");
    if (adminDb.db && (PROTEGIDOS as readonly string[]).includes(adminDb.db)) {
      throw new Error(`ABORT: admin conectado em protegido ${adminDb.db}`);
    }
    const antesOp = await snapshotBanco(admin, OPERACIONAL);
    const antes47 = await snapshotBanco(admin, HOMOLOG_3C47);
    const antesB2 = await snapshotBanco(admin, HOMOLOG_3B2A3);
    const antes5b = await snapshotBanco(admin, TESTE_3E5B);
    if (!antesOp.existe || !antes47.existe || !antes5b.existe) throw new Error("ABORT: banco protegido ausente");

    const colOp = Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendas' AND COLUMN_NAME = 'idempotency_key'`, [OPERACIONAL]))[0]?.n);
    const likeAnteriores = PREFIXOS_ANTERIORES.map(() => "idempotency_key LIKE ?").join(" OR ");
    const vendasAnteriores = Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${TESTE}\`.vendas WHERE ${likeAnteriores}`, [...PREFIXOS_ANTERIORES]))[0]?.n);

    pool = mysql.createPool({ host: cred.host, port: cred.port, user: cred.user, password: cred.password, database: TESTE, connectionLimit: 8 });
    const [db1] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    assertTeste(db1.db);
    const connCheck = await pool.getConnection();
    try {
      const [dbConn] = await q<{ db: string }[]>(connCheck, "SELECT DATABASE() db");
      assertTeste(dbConn.db);
    } finally {
      connCheck.release();
    }

    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM fazendas WHERE userId = ?", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda 3E9I A')", [USER_A]);
    }
    const fazendaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM pessoas WHERE user_id = ? AND tipo = 'cliente'", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Cliente 3E9I A', 'cliente', 1)", [USER_A]);
    }
    const pessoaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'cliente' ORDER BY id LIMIT 1", [USER_A]))[0]?.id);

    const d1 = drizzle(pool, { schema, mode: "default" as const });
    const mysqlStore = createConfirmarVendaFinanceiroMysqlStore(d1);
    const canc = createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(d1));

    const k = (s: string) => `ven-3e9i-${RUN}-${s}`;
    const cabeca = (key: string, animalId: number, extra: Partial<ConfirmarVendaFinanceiroInput> = {}): ConfirmarVendaFinanceiroInput => ({
      idempotencyKey: k(key), fazendaId: fazendaA, data: "2026-10-24", compradorId: pessoaA,
      formaPrecificacao: "cabeca", itens: [{ animalId, precoUnitario: 1500 }], condicao: "a_vista", ...extra,
    });
    const comercialInput = (animalId: number) => ({
      fazendaId: fazendaA,
      data: "2026-10-24",
      compradorId: pessoaA,
      formaPrecificacao: "cabeca" as const,
      itens: [{ animalId, precoUnitario: 1500 }],
    });

    async function statusAnimal(id: number) {
      return (await q<{ status: string }[]>(pool!, "SELECT status FROM animais WHERE id = ?", [id]))[0]?.status;
    }
    async function baixasAtivas(id: number) {
      return Number((await q<{ n: number }[]>(pool!, "SELECT COUNT(*) n FROM animal_baixas WHERE animalId = ? AND status = 'ativa'", [id]))[0]?.n);
    }
    async function nVendas(chave: string) {
      return Number((await q<{ n: number }[]>(pool!, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = ?", [k(chave)]))[0]?.n);
    }
    async function nTitulos(vendaId: number) {
      return Number((await q<{ n: number }[]>(pool!, "SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id = ?", [vendaId]))[0]?.n);
    }

    const raiz = dirname(fileURLToPath(import.meta.url));
    const flagSrc = readFileSync(join(raiz, "../shared/vendaIntegracao.ts"), "utf8");
    const portaSrc = readFileSync(join(raiz, "../server/vendaConfirmacaoIntegrada.ts"), "utf8");
    const routerSrc = readFileSync(join(raiz, "../server/routers.ts"), "utf8");
    const comercialSrc = readFileSync(join(raiz, "../server/confirmarVenda.ts"), "utf8");
    const pageSrc = readFileSync(join(raiz, "../client/src/pages/NovaVendaPage.tsx"), "utf8");
    const frontSrc = readFileSync(join(raiz, "../client/src/lib/novaVendaConfirmacao.ts"), "utf8");
    const journal = readFileSync(join(raiz, "../drizzle/migrations/meta/_journal.json"), "utf8");

    const vendasRouter = routerSrc.slice(routerSrc.indexOf("const vendasRouter"));
    const confirmarTrpc = vendasRouter.slice(
      vendasRouter.indexOf("confirmar: protectedProcedure"),
      vendasRouter.indexOf("cancelar: protectedProcedure"),
    );
    const integradaTrpc = vendasRouter.slice(
      vendasRouter.indexOf("confirmarIntegrada: protectedProcedure"),
      vendasRouter.indexOf("documentosAnexar: protectedProcedure"),
    );

    const chamadaComercialNoRouter = (confirmarTrpc.match(/confirmarVendaComercial/g) || []).length;
    const chamadaDiretaComercial = confirmarTrpc.includes("confirmarVendaComercial(");
    const portaChamaComercialDepoisDoGate = portaSrc.includes("recusarSeRotaNegada(\"comercial\"")
      && portaSrc.includes("return confirmarVendaComercial(userId, input)");

    reg({
      id: "ROTAS",
      nome: "tRPC comercial só pela porta; integrada só pela porta; constante false",
      ok: INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false
        && flagSrc.includes("INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = false")
        && !flagSrc.includes("process.env")
        && confirmarTrpc.includes("confirmarVendaComercialSePermitida")
        && !chamadaDiretaComercial
        && integradaTrpc.includes("confirmarVendaIntegradaSeAtiva")
        && !integradaTrpc.includes("createConfirmarVendaFinanceiroService")
        && portaChamaComercialDepoisDoGate
        && comercialSrc.includes("export async function confirmarVendaComercial")
        && pageSrc.includes("flag: flagConfirmacao")
        && pageSrc.includes("estadoConsultaFlagConfirmacaoVenda")
        && !pageSrc.includes("confirmarVendaComercial")
        && frontSrc.includes("MSG_VENDA_CONFIRMACAO_SEM_FALLBACK")
        && colOp === 0
        && !journal.includes("0061_vendas_idempotency")
        && db1.db === TESTE
        && autorizarRotaConfirmacaoVenda("comercial").ok
        && !autorizarRotaConfirmacaoVenda("integrada").ok,
      detalhe: { chamadaComercialNoRouter, chamadaDiretaComercial, db1: db1.db, colOp },
    });

    const wrapFalse = wrapStore(mysqlStore);
    let msgIntegradaFalse = "";
    try {
      await confirmarVendaIntegradaSeAtiva(wrapFalse.store, USER_A, cabeca("rota-off", 1));
    } catch (e) { msgIntegradaFalse = msg(e); }
    const [dbAposFalse] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    assertTeste(dbAposFalse.db);

    reg({
      id: "FLAG-FALSE",
      nome: "A/B/C — comercial autorizado na regra; integrada recusada; zero TX",
      ok: autorizarRotaConfirmacaoVenda("comercial", { integracaoAtiva: false }).ok
        && msgIntegradaFalse.includes(MSG_VENDA_CONFIRMACAO_INTEGRADA_DESLIGADA)
        && wrapFalse.transacoes() === 0
        && INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false,
      detalhe: { msgIntegradaFalse, txs: wrapFalse.transacoes() },
    });

    const bloqAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9I-BLOQ");
    const vendasAntesBloq = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE user_id = ?", [USER_A]))[0]?.n);
    let msgComercialTrue = "";
    let msgAbaAntiga = "";
    let msgApiDireta = "";
    try {
      await confirmarVendaComercialSePermitida(USER_A, comercialInput(bloqAnim), { integracaoAtiva: true });
    } catch (e) { msgComercialTrue = msg(e); }
    try {
      await confirmarVendaComercialSePermitida(USER_A, comercialInput(bloqAnim), { integracaoAtiva: true });
    } catch (e) { msgAbaAntiga = msg(e); }
    try {
      await confirmarVendaComercialSePermitida(USER_A, comercialInput(bloqAnim), { integracaoAtiva: true });
    } catch (e) { msgApiDireta = msg(e); }
    const [dbAposBloq] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    assertTeste(dbAposBloq.db);
    const vendasDepoisBloq = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE user_id = ?", [USER_A]))[0]?.n);

    reg({
      id: "FLAG-TRUE-COM",
      nome: "D/F/G/H — comercial recusado (aba antiga e API); não grava venda; animal ativo",
      ok: msgComercialTrue.includes(MSG_VENDA_CONFIRMACAO_COMERCIAL_BLOQUEADA)
        && msgAbaAntiga.includes(MSG_VENDA_CONFIRMACAO_COMERCIAL_BLOQUEADA)
        && msgApiDireta.includes(MSG_VENDA_CONFIRMACAO_COMERCIAL_BLOQUEADA)
        && vendasDepoisBloq === vendasAntesBloq
        && await statusAnimal(bloqAnim) === "ativo"
        && await baixasAtivas(bloqAnim) === 0
        && INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false,
      detalhe: { msgComercialTrue, vendasAntesBloq, vendasDepoisBloq, animal: bloqAnim },
    });

    const wrapTrue = wrapStore(mysqlStore);
    const intAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9I-INT");
    const integrada = await confirmarVendaIntegradaSeAtiva(
      wrapTrue.store,
      USER_A,
      cabeca("int", intAnim),
      { integracaoAtiva: true },
    );
    const [dbAposInt] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    assertTeste(dbAposInt.db);
    const retry = await confirmarVendaIntegradaSeAtiva(
      wrapTrue.store,
      USER_A,
      cabeca("int", intAnim),
      { integracaoAtiva: true },
    );
    const stInt = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [integrada.vendaId]))[0]?.status;
    const titInt = await nTitulos(integrada.vendaId);

    reg({
      id: "FLAG-TRUE-INT",
      nome: "E — integrada com flag injetada gera venda+título; retry idempotente",
      ok: integrada.success && integrada.tituloId > 0
        && wrapTrue.transacoes() > 0
        && retry.idempotente && retry.vendaId === integrada.vendaId && retry.tituloId === integrada.tituloId
        && await nVendas("int") === 1 && titInt === 1
        && stInt === "concluido"
        && await statusAnimal(intAnim) === "vendido"
        && await baixasAtivas(intAnim) === 1
        && INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false,
      detalhe: { integrada, retry, txs: wrapTrue.transacoes(), stInt, titInt },
    });

    const cancInt = await canc.cancelar(USER_A, {
      vendaId: integrada.vendaId,
      motivo: "3E9I cancelamento protegido",
      canceladoPorUserId: USER_A,
    });
    const stCanc = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [integrada.vendaId]))[0]?.status;
    const titEstado = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [integrada.tituloId]))[0]?.estado;

    reg({
      id: "CANC",
      nome: "Cancelamento protegido após confirmação integrada",
      ok: cancInt.success && stCanc === "cancelado" && titEstado === "cancelado"
        && await statusAnimal(intAnim) === "ativo" && await baixasAtivas(intAnim) === 0
        && await nTitulos(integrada.vendaId) === 1,
      detalhe: { cancInt, stCanc, titEstado },
    });

    const semTituloFlagTrue = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM vendas v
      WHERE v.idempotency_key LIKE ? AND v.status = 'concluido'
        AND NOT EXISTS (
          SELECT 1 FROM financeiro_titulos t
          WHERE t.origem_tipo = 'venda_animais' AND t.origem_id = v.id AND t.origem_item_chave = 'principal'
        )`, [`ven-3e9i-${RUN}%`]))[0]?.n);
    const dupBaixa = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM (
      SELECT animalId FROM animal_baixas WHERE status = 'ativa' AND animalId IN (
        SELECT vi.animal_id FROM venda_itens vi JOIN vendas v ON v.id = vi.venda_id
        WHERE v.idempotency_key LIKE ?) GROUP BY animalId HAVING COUNT(*) > 1) x`, [`ven-3e9i-${RUN}%`]))[0]?.n);
    const vendasAnterioresDepois = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM vendas WHERE ${likeAnteriores}`, [...PREFIXOS_ANTERIORES]))[0]?.n);

    reg({
      id: "INV",
      nome: "Invariantes: sem venda sem título nesta run; sem baixa duplicada; testes anteriores preservados",
      ok: semTituloFlagTrue === 0 && dupBaixa === 0
        && vendasAnterioresDepois === vendasAnteriores
        && INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false,
      detalhe: { semTituloFlagTrue, dupBaixa, vendasAnteriores, vendasAnterioresDepois },
    });

    const depoisOp = await snapshotBanco(admin, OPERACIONAL);
    const depois47 = await snapshotBanco(admin, HOMOLOG_3C47);
    const depoisB2 = await snapshotBanco(admin, HOMOLOG_3B2A3);
    const depois5b = await snapshotBanco(admin, TESTE_3E5B);
    const [dbFinal] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    assertTeste(dbFinal.db);
    reg({
      id: "ISO",
      nome: "Bancos protegidos preservados; 0061 ausente no operacional",
      ok: dbFinal.db === TESTE
        && JSON.stringify(antesOp) === JSON.stringify(depoisOp)
        && JSON.stringify(antes47) === JSON.stringify(depois47)
        && JSON.stringify(antesB2) === JSON.stringify(depoisB2)
        && JSON.stringify(antes5b) === JSON.stringify(depois5b)
        && colOp === 0,
      detalhe: { dbFinal: dbFinal.db, colOp },
    });
  } catch (e) {
    reg({ id: "ABORT", nome: "Execução", ok: false, detalhe: {}, erro: msg(e) });
  } finally {
    if (pool) await pool.end();
    await admin.end();
  }

  const ok = problemas.length === 0;
  console.log(JSON.stringify({
    banco: TESTE,
    flag: INTEGRACAO_CONFIRMACAO_VENDA_ATIVA,
    parecer: ok ? "APTO COM INTEGRAÇÃO DESLIGADA" : "NECESSITA CORREÇÕES",
    problemas,
    cenarios,
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
