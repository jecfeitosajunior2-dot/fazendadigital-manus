/**
 * Homologação 3E.8G — recuperação de deadlocks no núcleo financeiro V2.
 * Banco exclusivo: fazenda_digital_test_3e8e. Não apaga cenários anteriores.
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
import { MSG_FIN_LIQUIDACAO_JA_ESTORNADA, MSG_FIN_TITULO_CANCELADO } from "../shared/financeiroNucleo";
import { MSG_VENDA_CANCELAR_COM_RECEBIMENTO } from "../server/cancelarVendaFinanceiro";
import { INTEGRACAO_CONFIRMACAO_VENDA_ATIVA } from "../client/src/lib/novaVendaPendencia";

const TESTE = "fazenda_digital_test_3e8e";
const TESTE_3E5B = "fazenda_digital_test_3e5b";
const OPERACIONAL = "fazenda_digital";
const HOMOLOG_3C47 = "fazenda_digital_homolog_3c47";
const HOMOLOG_3B2A3 = "fazenda_digital_homolog_3b2a3";
const PROTEGIDOS = [OPERACIONAL, HOMOLOG_3C47, HOMOLOG_3B2A3, TESTE_3E5B] as const;
const USER_A = 940001;
const RODADAS = 6;
const TABELAS = [
  "pessoas", "fazendas", "lotes", "animais", "animal_baixas", "vendas", "venda_itens",
  "financeiro_contas", "financeiro_categorias", "financeiro_centros_custo",
  "financeiro_titulos", "financeiro_parcelas", "financeiro_apropriacoes",
  "financeiro_liquidacoes", "financeiro_liquidacao_alocacoes",
  "financeiro_movimentos", "financeiro_transferencias",
] as const;

type Cenario = { id: string; nome: string; ok: boolean; detalhe: Record<string, unknown>; erro?: string };
const stats = { deadlock: 0, lockWait: 0, dup: 0, sqlCru: 0 };

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
  if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) {
    throw new Error("ABORT: host não é MySQL local");
  }
  if ((u.pathname || "").replace(/^\//, "").split("?")[0] !== OPERACIONAL) {
    throw new Error("ABORT: URL operacional inesperada — recusando para não gravar no banco da URL");
  }
  return {
    host: u.hostname, port: Number(u.port || 3306),
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  };
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

function errnoDe(e: unknown): number | null {
  let atual: unknown = e;
  for (let i = 0; i < 8 && atual; i++) {
    if (typeof atual === "object" && atual != null) {
      const n = Number((atual as { errno?: number }).errno);
      if (Number.isInteger(n) && n > 0) return n;
      atual = (atual as { cause?: unknown }).cause ?? (atual as { original?: unknown }).original;
    } else break;
  }
  return null;
}

function erroSqlCru(texto: string) {
  return /Failed query|ER_LOCK_DEADLOCK|Deadlock found when trying to get lock|ER_DUP_ENTRY|Duplicate entry/i.test(texto);
}

function anotar(e: unknown) {
  const n = errnoDe(e);
  const t = msg(e);
  if (n === 1213 || /deadlock/i.test(t)) stats.deadlock += 1;
  if (n === 1205 || /lock wait timeout/i.test(t)) stats.lockWait += 1;
  if (n === 1062 || /duplicate/i.test(t)) stats.dup += 1;
  if (erroSqlCru(t)) stats.sqlCru += 1;
}

function settled<T>(r: PromiseSettledResult<T>) {
  if (r.status === "fulfilled") return { ok: true as const, value: r.value };
  anotar(r.reason);
  return { ok: false as const, erro: msg(r.reason) };
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
  await pool.query("INSERT INTO animais (`userId`, `brinco`, `sexo`, `status`, `fazendaId`) VALUES (?, ?, 'macho', 'ativo', ?)", [userId, brinco, fazendaId]);
  return Number((await q<{ id: number }[]>(pool, "SELECT id FROM animais WHERE brinco = ? AND userId = ?", [brinco, userId]))[0]?.id);
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

    const bancos = (await q<{ Database: string }[]>(admin, "SHOW DATABASES")).map(b => b.Database);
    if (!bancos.includes(TESTE)) await admin.query(`CREATE DATABASE \`${TESTE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    for (const tabela of TABELAS) {
      const existeTeste = Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?", [TESTE, tabela]))[0]?.n);
      if (!existeTeste) await admin.query(`CREATE TABLE \`${TESTE}\`.\`${tabela}\` LIKE \`${OPERACIONAL}\`.\`${tabela}\``);
    }

    const vendasAntes = Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${TESTE}\`.vendas WHERE idempotency_key LIKE 'ven-3e8e%' OR idempotency_key LIKE 'ven-3e8f%'`))[0]?.n);

    pool = mysql.createPool({ host: cred.host, port: cred.port, user: cred.user, password: cred.password, database: TESTE, connectionLimit: 8 });
    pool2 = mysql.createPool({ host: cred.host, port: cred.port, user: cred.user, password: cred.password, database: TESTE, connectionLimit: 4 });
    const [db1] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    const [db2] = await q<{ db: string }[]>(pool2, "SELECT DATABASE() db");
    assertTeste(db1.db);
    assertTeste(db2.db);

    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM fazendas WHERE userId = ?", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda 3E8G A')", [USER_A]);
    }
    const fazendaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM pessoas WHERE user_id = ? AND tipo = 'cliente'", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Cliente sintético 3E8G A', 'cliente', 1)", [USER_A]);
    }
    const pessoaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'cliente' ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_contas WHERE user_id = ?", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO financeiro_contas (user_id, nome, tipo, saldo_abertura, data_saldo_abertura, ativa) VALUES (?, 'Caixa 3E8G', 'caixa', '200000.00', '2026-10-01', 1)", [USER_A]);
    }
    const contaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM financeiro_contas WHERE user_id = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);

    const drizzle1 = drizzle(pool, { schema, mode: "default" as const });
    const drizzle2 = drizzle(pool2, { schema, mode: "default" as const });
    const conf = createConfirmarVendaFinanceiroService(createConfirmarVendaFinanceiroMysqlStore(drizzle1));
    const canc = createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(drizzle1));
    const nucleo = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(drizzle1));
    const nucleo2 = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(drizzle2));

    const cabeca = (key: string, animalId: number): ConfirmarVendaFinanceiroInput => ({
      idempotencyKey: key, fazendaId: fazendaA, data: "2026-10-23", compradorId: pessoaA,
      formaPrecificacao: "cabeca", itens: [{ animalId, precoUnitario: 1500 }], condicao: "a_vista",
    });
    const kg = (key: string, a: number, b: number): ConfirmarVendaFinanceiroInput => ({
      idempotencyKey: key, fazendaId: fazendaA, data: "2026-10-23", compradorId: pessoaA,
      formaPrecificacao: "kg", precoPadrao: 20,
      itens: [{ animalId: a, pesoVenda: 300, precoUnitario: 20 }, { animalId: b, pesoVenda: 250, precoUnitario: 20 }],
      condicao: "a_vista",
    });

    async function parcela(tituloId: number) {
      return Number((await q<{ id: number }[]>(pool!, "SELECT id FROM financeiro_parcelas WHERE titulo_id = ? ORDER BY numero LIMIT 1", [tituloId]))[0]?.id);
    }
    async function efetiva(tituloId: number) {
      return Number((await q<{ n: number }[]>(pool!, `SELECT COUNT(*) n FROM financeiro_parcelas p
        JOIN financeiro_liquidacao_alocacoes a ON a.parcela_id = p.id
        JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id
        WHERE p.titulo_id = ? AND l.tipo IN ('recebimento','pagamento')
          AND NOT EXISTS (SELECT 1 FROM financeiro_liquidacoes e WHERE e.liquidacao_original_id = l.id)`, [tituloId]))[0]?.n);
    }

    const raiz = dirname(fileURLToPath(import.meta.url));
    const flagOff = INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false;
    const nucleoSrc = readFileSync(join(raiz, "../server/financeiroNucleo.ts"), "utf8");
    const novaVenda = readFileSync(join(raiz, "../client/src/pages/NovaVendaPage.tsx"), "utf8");
    reg({
      id: "RR",
      nome: "Conexões no banco de teste e integração desativada",
      ok: db1.db === TESTE && db2.db === TESTE && flagOff
        && nucleoSrc.includes("transacaoFinanceiroComRetry")
        && nucleoSrc.includes("isDeadlockMysql")
        && !novaVenda.includes("confirmarVendaFinanceiro"),
      detalhe: { db1: db1.db, db2: db2.db, flagOff, vendasAntes },
    });

    const h2: Array<Record<string, unknown>> = [];
    let h2Ok = true;
    for (let i = 1; i <= RODADAS; i++) {
      const animalId = await seedAnimal(pool, USER_A, fazendaA, `3E8G-H2-${i}`);
      const venda = await conf.confirmar(USER_A, cabeca(`ven-3e8g-h2-${i}`, animalId));
      const parc = await parcela(venda.tituloId);
      const rec = await nucleo.criarRecebimento(USER_A, {
        contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
        idempotencyKey: `rec-3e8g-h2-${i}`, alocacoes: [{ parcelaId: parc, principalLiquidado: 1500 }],
      });
      const key = `est-3e8g-h2-${i}`;
      const r = await Promise.allSettled([
        nucleo.estornarLiquidacao(USER_A, { liquidacaoId: rec.id, idempotencyKey: key, dataLiquidacao: "2026-10-24" }),
        nucleo2.estornarLiquidacao(USER_A, { liquidacaoId: rec.id, idempotencyKey: key, dataLiquidacao: "2026-10-24" }),
      ]);
      const a = settled(r[0]!);
      const b = settled(r[1]!);
      const est = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE liquidacao_original_id = ?", [rec.id]))[0]?.n);
      const ids = [a, b].filter(x => x.ok).map(x => x.ok ? x.value.id : null);
      const mesmos = ids.length === 2 && ids[0] === ids[1];
      const sqlCru = [a, b].some(x => !x.ok && erroSqlCru(x.erro));
      const ok = est === 1 && mesmos && !sqlCru;
      if (!ok) h2Ok = false;
      h2.push({ i, a, b, est, mesmos, sqlCru });
    }
    reg({ id: "H2", nome: `Dois estornos mesma chave em ${RODADAS} rodadas`, ok: h2Ok, detalhe: { rodadas: RODADAS, falhas: h2.filter(x => x.mesmos !== true || x.sqlCru) } });

    const iRows: Array<Record<string, unknown>> = [];
    let iOk = true;
    for (let i = 1; i <= RODADAS; i++) {
      const animalId = await seedAnimal(pool, USER_A, fazendaA, `3E8G-I-${i}`);
      const venda = await conf.confirmar(USER_A, cabeca(`ven-3e8g-i-${i}`, animalId));
      const parc = await parcela(venda.tituloId);
      const rec = await nucleo.criarRecebimento(USER_A, {
        contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
        idempotencyKey: `rec-3e8g-i-${i}`, alocacoes: [{ parcelaId: parc, principalLiquidado: 1500 }],
      });
      const r = await Promise.allSettled([
        nucleo2.estornarLiquidacao(USER_A, { liquidacaoId: rec.id, idempotencyKey: `est-3e8g-i-${i}`, dataLiquidacao: "2026-10-24" }),
        canc.cancelar(USER_A, { vendaId: venda.vendaId, motivo: `corrida 3E8G I ${i}`, canceladoPorUserId: USER_A }),
      ]);
      const est = settled(r[0]!);
      const can = settled(r[1]!);
      const tit = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [venda.tituloId]))[0]?.estado;
      const ef = await efetiva(venda.tituloId);
      const liq = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE id = ? OR liquidacao_original_id = ?", [rec.id, rec.id]))[0]?.n);
      const sqlCru = [est, can].some(x => !x.ok && erroSqlCru(x.erro));
      const recusaLegitima = !can.ok && (can.erro.includes(MSG_VENDA_CANCELAR_COM_RECEBIMENTO));
      const ok = !(tit === "cancelado" && ef > 0) && liq <= 2 && (est.ok || can.ok) && !sqlCru
        && (can.ok || recusaLegitima || (!can.ok && !erroSqlCru(can.erro)));
      if (!ok) iOk = false;
      iRows.push({ i, est, can, tit, ef, liq, sqlCru });
    }
    reg({ id: "I", nome: `Estorno × cancelamento em ${RODADAS} rodadas`, ok: iOk, detalhe: { rodadas: RODADAS, falhas: iRows.filter(x => x.sqlCru || (x.tit === "cancelado" && Number(x.ef) > 0)) } });

    const jRows: Array<Record<string, unknown>> = [];
    let jOk = true;
    for (let i = 1; i <= RODADAS; i++) {
      const aId = await seedAnimal(pool, USER_A, fazendaA, `3E8G-J-${i}A`);
      const bId = await seedAnimal(pool, USER_A, fazendaA, `3E8G-J-${i}B`);
      const venda = await conf.confirmar(USER_A, kg(`ven-3e8g-j-${i}`, aId, bId));
      const parc = await parcela(venda.tituloId);
      const rec = await nucleo.criarRecebimento(USER_A, {
        contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 4000,
        idempotencyKey: `rec-3e8g-j1-${i}`, alocacoes: [{ parcelaId: parc, principalLiquidado: 4000 }],
      });
      const r = await Promise.allSettled([
        nucleo.estornarLiquidacao(USER_A, { liquidacaoId: rec.id, idempotencyKey: `est-3e8g-j-${i}`, dataLiquidacao: "2026-10-24" }),
        nucleo2.criarRecebimento(USER_A, {
          contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 5000,
          idempotencyKey: `rec-3e8g-j2-${i}`, alocacoes: [{ parcelaId: parc, principalLiquidado: 5000 }],
        }),
      ]);
      const est = settled(r[0]!);
      const rec2 = settled(r[1]!);
      const mov = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_movimentos m JOIN financeiro_liquidacoes l ON l.id = m.liquidacao_id JOIN financeiro_liquidacao_alocacoes a ON a.liquidacao_id = l.id WHERE a.parcela_id = ?", [parc]))[0]?.n);
      const liq = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes l JOIN financeiro_liquidacao_alocacoes a ON a.liquidacao_id = l.id WHERE a.parcela_id = ?", [parc]))[0]?.n);
      const princ = Number((await q<{ s: string }[]>(pool, `SELECT COALESCE(SUM(CASE
        WHEN l.tipo IN ('recebimento','pagamento') THEN a.principal_liquidado
        WHEN l.tipo LIKE 'estorno_%' THEN -a.principal_liquidado ELSE 0 END), 0) s
        FROM financeiro_liquidacao_alocacoes a JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id WHERE a.parcela_id = ?`, [parc]))[0]?.s);
      const sqlCru = [est, rec2].some(x => !x.ok && erroSqlCru(x.erro));
      const recusaTitulo = !rec2.ok && rec2.erro.includes(MSG_FIN_TITULO_CANCELADO);
      const ok = princ >= 0 && princ <= 11000 && mov === liq && (est.ok || rec2.ok || recusaTitulo) && !sqlCru;
      if (!ok) jOk = false;
      jRows.push({ i, est, rec2, mov, liq, princ, sqlCru });
    }
    reg({ id: "J", nome: `Estorno × recebimento em ${RODADAS} rodadas`, ok: jOk, detalhe: { rodadas: RODADAS, falhas: jRows.filter(x => x.sqlCru || Number(x.princ) < 0 || Number(x.princ) > 11000) } });

    const dupEst = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM (
      SELECT liquidacao_original_id FROM financeiro_liquidacoes WHERE liquidacao_original_id IS NOT NULL
        AND idempotency_key LIKE 'est-3e8g%' GROUP BY liquidacao_original_id HAVING COUNT(*) > 1) x`))[0]?.n);
    const vendasDepois = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key LIKE 'ven-3e8e%' OR idempotency_key LIKE 'ven-3e8f%'"))[0]?.n);
    const orfaos = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM financeiro_liquidacoes l
      LEFT JOIN financeiro_movimentos m ON m.liquidacao_id = l.id
      WHERE l.idempotency_key LIKE '%3e8g%' AND m.id IS NULL`))[0]?.n);
    const saldo = await nucleo.calcularSaldoConta(USER_A, contaA);
    const movSum = Number((await q<{ s: string }[]>(pool, `SELECT COALESCE(SUM(CASE WHEN direcao = 'entrada' THEN valor WHEN direcao = 'saida' THEN -valor ELSE 0 END), 0) s FROM financeiro_movimentos WHERE user_id = ? AND conta_id = ?`, [USER_A, contaA]))[0]?.s);
    const abertura = Number((await q<{ s: string }[]>(pool, "SELECT saldo_abertura s FROM financeiro_contas WHERE id = ?", [contaA]))[0]?.s);

    reg({
      id: "INV",
      nome: "Invariantes financeiros 3E.8G",
      ok: dupEst === 0 && orfaos === 0 && vendasDepois === vendasAntes && Number(saldo) === abertura + movSum,
      detalhe: { dupEst, orfaos, vendasAntes, vendasDepois, saldo, movSum, abertura, stats },
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
        && JSON.stringify(antes5b) === JSON.stringify(depois5b),
      detalhe: { dbFinal: dbFinal.db, antesOp, depoisOp, antes47, depois47, antesB2, depoisB2, antes5b, depois5b },
    });
  } catch (e) {
    reg({ id: "ABORT", nome: "Execução", ok: false, detalhe: { stats }, erro: msg(e) });
  } finally {
    if (pool) await pool.end();
    if (pool2) await pool2.end();
    await admin.end();
  }

  const ok = problemas.length === 0;
  console.log(JSON.stringify({
    banco: TESTE,
    parecer: ok ? "APTO PARA AVANÇAR" : "NECESSITA CORREÇÕES",
    rodadas: RODADAS,
    stats,
    problemas,
    cenarios,
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
