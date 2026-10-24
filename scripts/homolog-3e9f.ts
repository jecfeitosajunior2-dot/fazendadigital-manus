/**
 * Homologação 3E.9F — recuperação idempotente após cancelamento.
 * Somente fazenda_digital_test_3e8e. Não altera a flag. Não aplica migration.
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
import { createConfirmarVendaFinanceiroService } from "../server/confirmarVendaFinanceiro";
import { createConfirmarVendaFinanceiroMysqlStore } from "../server/confirmarVendaFinanceiroMysql";
import type { ConfirmarVendaFinanceiroInput } from "../server/confirmarVendaFinanceiro";
import { createCancelarVendaFinanceiroService } from "../server/cancelarVendaFinanceiro";
import { createCancelarVendaFinanceiroMysqlStore } from "../server/cancelarVendaFinanceiroMysql";
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "../server/financeiroNucleo";
import { confirmarVendaIntegradaSeAtiva } from "../server/vendaConfirmacaoIntegrada";
import {
  MSG_VENDA_CONFIRMACAO_INTEGRIDADE_TITULO,
  MSG_VENDA_CONFIRMACAO_JA_CANCELADA,
  MSG_VENDA_CONFLITO_IDEMPOTENCIA,
} from "../shared/vendaFinanceiro";
import {
  INTEGRACAO_CONFIRMACAO_VENDA_ATIVA,
  MSG_VENDA_CONFIRMACAO_INTEGRADA_DESLIGADA,
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
  "ven-3e8e%", "ven-3e8f%", "ven-3e8g%", "ven-3e8h%", "ven-3e8i%", "ven-3e9b1%", "ven-3e9b2%", "ven-3e9e%",
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

function erroSqlCru(texto: string) {
  return /Failed query|ER_LOCK_DEADLOCK|Deadlock found when trying to get lock|ER_DUP_ENTRY|Duplicate entry|Unknown column/i.test(texto);
}

function settled<T>(r: PromiseSettledResult<T>) {
  if (r.status === "fulfilled") return { ok: true as const, value: r.value };
  return { ok: false as const, erro: msg(r.reason), sqlCru: erroSqlCru(msg(r.reason)) };
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

async function main() {
  const cenarios: Cenario[] = [];
  const problemas: string[] = [];
  const cred = credenciais();
  const admin = await mysql.createConnection({ host: cred.host, port: cred.port, user: cred.user, password: cred.password });
  let pool: mysql.Pool | null = null;
  let pool2: mysql.Pool | null = null;
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
    pool2 = mysql.createPool({ host: cred.host, port: cred.port, user: cred.user, password: cred.password, database: TESTE, connectionLimit: 4 });
    const [db1] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    const [db2] = await q<{ db: string }[]>(pool2, "SELECT DATABASE() db");
    assertTeste(db1.db);
    assertTeste(db2.db);

    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM fazendas WHERE userId = ?", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda 3E9F A')", [USER_A]);
    }
    const fazendaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM pessoas WHERE user_id = ? AND tipo = 'cliente'", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Cliente 3E9F A', 'cliente', 1)", [USER_A]);
    }
    const pessoaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'cliente' ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_contas WHERE user_id = ?", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO financeiro_contas (user_id, nome, tipo, saldo_abertura, data_saldo_abertura, ativa) VALUES (?, 'Caixa 3E9F', 'caixa', '200000.00', '2026-10-01', 1)", [USER_A]);
    }
    const contaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM financeiro_contas WHERE user_id = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);

    const d1 = drizzle(pool, { schema, mode: "default" as const });
    const d2 = drizzle(pool2, { schema, mode: "default" as const });
    const conf = createConfirmarVendaFinanceiroService(createConfirmarVendaFinanceiroMysqlStore(d1));
    const conf2 = createConfirmarVendaFinanceiroService(createConfirmarVendaFinanceiroMysqlStore(d2));
    const canc = createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(d1));
    const nucleo = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(d1));

    const k = (s: string) => `ven-3e9f-${RUN}-${s}`;
    const cabeca = (key: string, animalId: number, extra: Partial<ConfirmarVendaFinanceiroInput> = {}): ConfirmarVendaFinanceiroInput => ({
      idempotencyKey: k(key), fazendaId: fazendaA, data: "2026-10-23", compradorId: pessoaA,
      formaPrecificacao: "cabeca", itens: [{ animalId, precoUnitario: 1500 }], condicao: "a_vista", ...extra,
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
    async function nLiqs(tituloId: number) {
      return Number((await q<{ n: number }[]>(pool!, `SELECT COUNT(*) n FROM financeiro_liquidacoes l
        JOIN financeiro_liquidacao_alocacoes a ON a.liquidacao_id = l.id
        JOIN financeiro_parcelas p ON p.id = a.parcela_id WHERE p.titulo_id = ?`, [tituloId]))[0]?.n);
    }

    const raiz = dirname(fileURLToPath(import.meta.url));
    const confSrc = readFileSync(join(raiz, "../server/confirmarVendaFinanceiro.ts"), "utf8");
    const mysqlSrc = readFileSync(join(raiz, "../server/confirmarVendaFinanceiroMysql.ts"), "utf8");
    const flagSrc = readFileSync(join(raiz, "../shared/vendaIntegracao.ts"), "utf8");
    const journal = readFileSync(join(raiz, "../drizzle/migrations/meta/_journal.json"), "utf8");

    let rotaRecusou = "";
    try {
      await confirmarVendaIntegradaSeAtiva(createConfirmarVendaFinanceiroMysqlStore(d1), USER_A, cabeca("rota", 1));
    } catch (e) { rotaRecusou = msg(e); }

    reg({
      id: "SEG",
      nome: "Flag desligada, 0061 ausente no operacional, FOR UPDATE na recuperação",
      ok: INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false
        && flagSrc.includes("INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = false")
        && colOp === 0 && !journal.includes("0061_vendas_idempotency")
        && db1.db === TESTE && db2.db === TESTE
        && rotaRecusou.includes(MSG_VENDA_CONFIRMACAO_INTEGRADA_DESLIGADA)
        && confSrc.includes("MSG_VENDA_CONFIRMACAO_JA_CANCELADA")
        && confSrc.includes("vendaConfirmacaoEstaCancelada")
        && mysqlSrc.includes("FOR UPDATE")
        && mysqlSrc.includes("findVendaPorIdempotency"),
      detalhe: { flag: INTEGRACAO_CONFIRMACAO_VENDA_ATIVA, colOp, db1: db1.db, rotaRecusou },
    });

    const aAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9F-A");
    const a = await conf.confirmar(USER_A, cabeca("a", aAnim));
    const b = await conf.confirmar(USER_A, cabeca("a", aAnim));
    const liqsAntes = await nLiqs(a.tituloId);
    const histAntes = await nucleo.historicoPagamentosTitulo(USER_A, a.tituloId);
    const cancA = await canc.cancelar(USER_A, { vendaId: a.vendaId, motivo: "3E9F após confirmar", canceladoPorUserId: USER_A });
    let dMsg = "";
    try { await conf.confirmar(USER_A, cabeca("a", aAnim)); }
    catch (e) { dMsg = msg(e); }
    const stVenda = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [a.vendaId]))[0]?.status;
    const stTit = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [a.tituloId]))[0]?.estado;
    const histDepois = await nucleo.historicoPagamentosTitulo(USER_A, a.tituloId);
    reg({
      id: "A-H",
      nome: "Confirmar, retry, cancelar, retry recusa; sem venda/título novos; animal ativo; histórico igual",
      ok: a.success && b.idempotente && b.vendaId === a.vendaId && cancA.success
        && dMsg.includes(MSG_VENDA_CONFIRMACAO_JA_CANCELADA)
        && await nVendas("a") === 1 && await nTitulos(a.vendaId) === 1
        && stVenda === "cancelado" && stTit === "cancelado"
        && await statusAnimal(aAnim) === "ativo" && await baixasAtivas(aAnim) === 0
        && await nLiqs(a.tituloId) === liqsAntes
        && histDepois.eventos.length === histAntes.eventos.length,
      detalhe: { a, b, cancA, dMsg, stVenda, stTit, liqsAntes },
    });

    const iAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9F-I");
    const iVenda = await conf.confirmar(USER_A, cabeca("i", iAnim));
    const rI = await Promise.allSettled([
      canc.cancelar(USER_A, { vendaId: iVenda.vendaId, motivo: "corrida retry", canceladoPorUserId: USER_A }),
      conf2.confirmar(USER_A, cabeca("i", iAnim)),
    ]);
    const iCanc = settled(rI[0]!); const iRetry = settled(rI[1]!);
    const stI = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [iVenda.vendaId]))[0]?.status;
    const retrySucessoEmCancelada = iRetry.ok && stI === "cancelado";
    const retryRecusou = !iRetry.ok && iRetry.erro.includes(MSG_VENDA_CONFIRMACAO_JA_CANCELADA);
    const retryAntes = iRetry.ok && stI === "concluido";
    reg({
      id: "I",
      nome: "Retry concorrente com cancelamento: nunca sucesso sobre venda cancelada",
      ok: await nVendas("i") === 1 && await nTitulos(iVenda.vendaId) === 1 && !retrySucessoEmCancelada
        && (retryRecusou || retryAntes || iCanc.ok) && !iCanc.sqlCru && !iRetry.sqlCru,
      detalhe: { iCanc, iRetry, stI, retrySucessoEmCancelada },
    });

    const jAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9F-J");
    const j1 = await conf.confirmar(USER_A, cabeca("j", jAnim));
    const j2 = await conf2.confirmar(USER_A, cabeca("j", jAnim));
    await canc.cancelar(USER_A, { vendaId: j1.vendaId, motivo: "depois da resposta perdida", canceladoPorUserId: USER_A });
    const rJ = await Promise.allSettled([
      conf.confirmar(USER_A, cabeca("j", jAnim)),
      conf2.confirmar(USER_A, cabeca("j", jAnim)),
    ]);
    const j3 = settled(rJ[0]!); const j4 = settled(rJ[1]!);
    reg({
      id: "J",
      nome: "Dois retries após cancelamento confirmado",
      ok: j2.idempotente && j2.vendaId === j1.vendaId
        && !j3.ok && !j4.ok
        && j3.erro.includes(MSG_VENDA_CONFIRMACAO_JA_CANCELADA)
        && j4.erro.includes(MSG_VENDA_CONFIRMACAO_JA_CANCELADA)
        && await nVendas("j") === 1 && await nTitulos(j1.vendaId) === 1
        && await statusAnimal(jAnim) === "ativo",
      detalhe: { j1, j2, j3, j4 },
    });

    const kAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9F-K");
    const kVenda = await conf.confirmar(USER_A, cabeca("k", kAnim));
    await canc.cancelar(USER_A, { vendaId: kVenda.vendaId, motivo: "payload diferente", canceladoPorUserId: USER_A });
    let kMsg = "";
    try { await conf.confirmar(USER_A, cabeca("k", kAnim, { condicao: "definir_depois", parcelas: [] })); }
    catch (e) { kMsg = msg(e); }
    reg({
      id: "K",
      nome: "Mesma chave e payload diferente após cancelar: conflito",
      ok: kMsg.includes(MSG_VENDA_CONFLITO_IDEMPOTENCIA) && await nVendas("k") === 1 && await nTitulos(kVenda.vendaId) === 1,
      detalhe: { kMsg },
    });

    const lAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9F-L");
    const lVenda = await conf.confirmar(USER_A, cabeca("l", lAnim));
    await pool.query("UPDATE financeiro_titulos SET estado = 'cancelado' WHERE id = ? AND user_id = ?", [lVenda.tituloId, USER_A]);
    const stL = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [lVenda.vendaId]))[0]?.status;
    let lMsg = "";
    try { await conf.confirmar(USER_A, cabeca("l", lAnim)); }
    catch (e) { lMsg = msg(e); }
    reg({
      id: "L",
      nome: "Venda concluída com título cancelado: integridade",
      ok: stL === "concluido" && lMsg.includes(MSG_VENDA_CONFIRMACAO_INTEGRIDADE_TITULO)
        && await nVendas("l") === 1 && await nTitulos(lVenda.vendaId) === 1,
      detalhe: { stL, lMsg },
    });

    const recAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9F-REC");
    const recVenda = await conf.confirmar(USER_A, cabeca("rec", recAnim));
    const parcId = Number((await q<{ id: number }[]>(pool, "SELECT id FROM financeiro_parcelas WHERE titulo_id = ? ORDER BY numero LIMIT 1", [recVenda.tituloId]))[0]?.id);
    const rec = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: `rec-3e9f-${RUN}`, alocacoes: [{ parcelaId: parcId, principalLiquidado: 1500 }],
    });
    const est = await nucleo.estornarLiquidacao(USER_A, {
      liquidacaoId: rec.id, idempotencyKey: `est-3e9f-${RUN}`, dataLiquidacao: "2026-10-24",
    });
    const liqsRec = await nLiqs(recVenda.tituloId);
    await canc.cancelar(USER_A, { vendaId: recVenda.vendaId, motivo: "após estorno 3E9F", canceladoPorUserId: USER_A });
    let recMsg = "";
    try { await conf.confirmar(USER_A, cabeca("rec", recAnim)); }
    catch (e) { recMsg = msg(e); }
    reg({
      id: "HIST",
      nome: "Histórico de liquidação/estorno intacto após recusa da mesma chave",
      ok: recMsg.includes(MSG_VENDA_CONFIRMACAO_JA_CANCELADA) && await nLiqs(recVenda.tituloId) === liqsRec && est.id > 0,
      detalhe: { recMsg, liqsRec },
    });

    const dupVenda = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM (
      SELECT vi.animal_id FROM venda_itens vi JOIN vendas v ON v.id = vi.venda_id
      WHERE v.status = 'concluido' AND v.idempotency_key LIKE ? GROUP BY vi.animal_id HAVING COUNT(*) > 1) x`, [`ven-3e9f-${RUN}%`]))[0]?.n);
    const dupTit = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM (
      SELECT origem_id FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_item_chave = 'principal'
        AND origem_id IN (SELECT id FROM vendas WHERE idempotency_key LIKE ?) GROUP BY origem_id HAVING COUNT(*) > 1) x`, [`ven-3e9f-${RUN}%`]))[0]?.n);
    const sucessoCancelada = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM vendas v
      JOIN financeiro_titulos t ON t.origem_tipo = 'venda_animais' AND t.origem_id = v.id AND t.origem_item_chave = 'principal'
      WHERE v.idempotency_key LIKE ? AND v.status = 'cancelado' AND t.estado = 'ativo'`, [`ven-3e9f-${RUN}%`]))[0]?.n);
    const reativada = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM vendas WHERE idempotency_key LIKE ? AND status = 'concluido'
      AND id IN (SELECT vendaId FROM animal_baixas WHERE status <> 'ativa')`, [`ven-3e9f-${RUN}%`]))[0]?.n);
    const vendasAnterioresDepois = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM vendas WHERE ${likeAnteriores}`, [...PREFIXOS_ANTERIORES]))[0]?.n);

    reg({
      id: "INV",
      nome: "Invariantes 3E.9F",
      ok: dupVenda === 0 && dupTit === 0 && sucessoCancelada === 0 && reativada === 0
        && vendasAnterioresDepois === vendasAnteriores
        && INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false,
      detalhe: { dupVenda, dupTit, sucessoCancelada, reativada, vendasAnteriores, vendasAnterioresDepois },
    });

    const depoisOp = await snapshotBanco(admin, OPERACIONAL);
    const depois47 = await snapshotBanco(admin, HOMOLOG_3C47);
    const depoisB2 = await snapshotBanco(admin, HOMOLOG_3B2A3);
    const depois5b = await snapshotBanco(admin, TESTE_3E5B);
    const [dbFinal] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    reg({
      id: "ISO",
      nome: "Bancos protegidos preservados",
      ok: dbFinal.db === TESTE
        && JSON.stringify(antesOp) === JSON.stringify(depoisOp)
        && JSON.stringify(antes47) === JSON.stringify(depois47)
        && JSON.stringify(antesB2) === JSON.stringify(depoisB2)
        && JSON.stringify(antes5b) === JSON.stringify(depois5b)
        && colOp === 0,
      detalhe: { dbFinal: dbFinal.db },
    });
  } catch (e) {
    reg({ id: "ABORT", nome: "Execução", ok: false, detalhe: {}, erro: msg(e) });
  } finally {
    if (pool) await pool.end();
    if (pool2) await pool2.end();
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
