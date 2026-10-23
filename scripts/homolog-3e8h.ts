/**
 * Homologação final 3E.8H — Vendas de animais + Financeiro V2.
 * Somente fazenda_digital_test_3e8e. Não apaga cenários anteriores.
 * Não ativa integração. Não aplica migration.
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
import { createCancelarVendaFinanceiroService, MSG_VENDA_CANCELAR_COM_RECEBIMENTO } from "../server/cancelarVendaFinanceiro";
import { createCancelarVendaFinanceiroMysqlStore } from "../server/cancelarVendaFinanceiroMysql";
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "../server/financeiroNucleo";
import { MSG_VENDA_CONFLITO_IDEMPOTENCIA } from "../shared/vendaFinanceiro";
import { MSG_FIN_LIQUIDACAO_JA_ESTORNADA, MSG_FIN_TITULO_CANCELADO } from "../shared/financeiroNucleo";
import { INTEGRACAO_CONFIRMACAO_VENDA_ATIVA } from "../client/src/lib/novaVendaPendencia";

const TESTE = "fazenda_digital_test_3e8e";
const TESTE_3E5B = "fazenda_digital_test_3e5b";
const OPERACIONAL = "fazenda_digital";
const HOMOLOG_3C47 = "fazenda_digital_homolog_3c47";
const HOMOLOG_3B2A3 = "fazenda_digital_homolog_3b2a3";
const PROTEGIDOS = [OPERACIONAL, HOMOLOG_3C47, HOMOLOG_3B2A3, TESTE_3E5B] as const;
const USER_A = 940001;
const USER_B = 940002;
const TABELAS = [
  "pessoas", "fazendas", "lotes", "animais", "animal_baixas", "vendas", "venda_itens",
  "financeiro_contas", "financeiro_categorias", "financeiro_centros_custo",
  "financeiro_titulos", "financeiro_parcelas", "financeiro_apropriacoes",
  "financeiro_liquidacoes", "financeiro_liquidacao_alocacoes",
  "financeiro_movimentos", "financeiro_transferencias",
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
  return /Failed query|ER_LOCK_DEADLOCK|Deadlock found when trying to get lock|ER_DUP_ENTRY|Duplicate entry/i.test(texto);
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
    if (!bancos.includes(TESTE)) throw new Error("ABORT: banco de teste 3e8e ausente");
    for (const tabela of TABELAS) {
      const existe = Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?", [TESTE, tabela]))[0]?.n);
      if (!existe) throw new Error(`ABORT: tabela ${tabela} ausente em ${TESTE}`);
    }

    const vendasAnteriores = Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${TESTE}\`.vendas WHERE idempotency_key LIKE 'ven-3e8e%' OR idempotency_key LIKE 'ven-3e8f%' OR idempotency_key LIKE 'ven-3e8g%'`))[0]?.n);

    pool = mysql.createPool({ host: cred.host, port: cred.port, user: cred.user, password: cred.password, database: TESTE, connectionLimit: 8 });
    pool2 = mysql.createPool({ host: cred.host, port: cred.port, user: cred.user, password: cred.password, database: TESTE, connectionLimit: 4 });
    const [db1] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    const [db2] = await q<{ db: string }[]>(pool2, "SELECT DATABASE() db");
    assertTeste(db1.db);
    assertTeste(db2.db);

    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM fazendas WHERE userId = ?", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda 3E8H A')", [USER_A]);
    }
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM fazendas WHERE userId = ?", [USER_B]))[0]?.n)) {
      await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda 3E8H B')", [USER_B]);
    }
    const fazendaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    const fazendaB = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id LIMIT 1", [USER_B]))[0]?.id);
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM pessoas WHERE user_id = ? AND tipo = 'cliente'", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Cliente 3E8H A', 'cliente', 1)", [USER_A]);
    }
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM pessoas WHERE user_id = ? AND tipo = 'cliente'", [USER_B]))[0]?.n)) {
      await pool.query("INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Cliente 3E8H B', 'cliente', 1)", [USER_B]);
    }
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM pessoas WHERE user_id = ? AND tipo = 'fornecedor'", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Fornecedor 3E8H A', 'fornecedor', 1)", [USER_A]);
    }
    const pessoaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'cliente' ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    const pessoaB = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'cliente' ORDER BY id LIMIT 1", [USER_B]))[0]?.id);
    const fornecedorA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'fornecedor' ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_contas WHERE user_id = ?", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO financeiro_contas (user_id, nome, tipo, saldo_abertura, data_saldo_abertura, ativa) VALUES (?, 'Caixa 3E8H', 'caixa', '200000.00', '2026-10-01', 1)", [USER_A]);
    }
    const contaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM financeiro_contas WHERE user_id = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);

    const d1 = drizzle(pool, { schema, mode: "default" as const });
    const d2 = drizzle(pool2, { schema, mode: "default" as const });
    const conf = createConfirmarVendaFinanceiroService(createConfirmarVendaFinanceiroMysqlStore(d1));
    const conf2 = createConfirmarVendaFinanceiroService(createConfirmarVendaFinanceiroMysqlStore(d2));
    const canc = createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(d1));
    const canc2 = createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(d2));
    const nucleo = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(d1));
    const nucleo2 = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(d2));

    const cabeca = (key: string, animalId: number, extra: Partial<ConfirmarVendaFinanceiroInput> = {}): ConfirmarVendaFinanceiroInput => ({
      idempotencyKey: key, fazendaId: fazendaA, data: "2026-10-23", compradorId: pessoaA,
      formaPrecificacao: "cabeca", itens: [{ animalId, precoUnitario: 1500 }], condicao: "a_vista", ...extra,
    });
    const kg = (key: string, a: number, b: number, extra: Partial<ConfirmarVendaFinanceiroInput> = {}): ConfirmarVendaFinanceiroInput => ({
      idempotencyKey: key, fazendaId: fazendaA, data: "2026-10-23", compradorId: pessoaA,
      formaPrecificacao: "kg", precoPadrao: 20, observacoes: "lote 3E8H",
      itens: [{ animalId: a, pesoVenda: 300, precoUnitario: 20 }, { animalId: b, pesoVenda: 250, precoUnitario: 20 }],
      condicao: "a_vista", ...extra,
    });

    async function titulosDaVenda(vendaId: number) {
      return Number((await q<{ n: number }[]>(pool!, "SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id = ? AND origem_item_chave = 'principal'", [vendaId]))[0]?.n);
    }
    async function statusAnimal(id: number) {
      return (await q<{ status: string }[]>(pool!, "SELECT status FROM animais WHERE id = ?", [id]))[0]?.status;
    }
    async function baixas(id: number) {
      return Number((await q<{ n: number }[]>(pool!, "SELECT COUNT(*) n FROM animal_baixas WHERE animalId = ? AND status = 'ativa'", [id]))[0]?.n);
    }
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
    const nucleoSrc = readFileSync(join(raiz, "../server/financeiroNucleo.ts"), "utf8");
    const confSrc = readFileSync(join(raiz, "../server/confirmarVendaFinanceiro.ts"), "utf8");
    const cancSrc = readFileSync(join(raiz, "../server/cancelarVendaFinanceiro.ts"), "utf8");
    const pendSrc = readFileSync(join(raiz, "../client/src/lib/novaVendaPendencia.ts"), "utf8");
    const journal = readFileSync(join(raiz, "../drizzle/migrations/meta/_journal.json"), "utf8");
    const mig0061 = readFileSync(join(raiz, "../drizzle/migrations/0061_vendas_idempotency.sql"), "utf8");
    const schemaVendas = readFileSync(join(raiz, "../drizzle/schema.ts"), "utf8");

    reg({
      id: "RR",
      nome: "Identidade do banco, flag desligada e retry no código",
      ok: db1.db === TESTE && db2.db === TESTE && INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false
        && nucleoSrc.includes("transacaoFinanceiroComRetry")
        && nucleoSrc.includes("isLockWaitTimeoutMysql")
        && nucleoSrc.includes("TENTATIVAS_DEADLOCK_FINANCEIRO = 6")
        && confSrc.includes("isDuplicateChaveIdempotenciaVenda")
        && confSrc.includes("lockTituloPrincipalDaVenda")
        && cancSrc.includes("isDeadlockMysql")
        && pendSrc.includes("INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = false")
        && !journal.includes("0061_vendas_idempotency")
        && mig0061.includes("vendas_idem_uq")
        && schemaVendas.includes('uniqueIndex("vendas_idem_uq")'),
      detalhe: { db1: db1.db, db2: db2.db, vendasAnteriores, journalSo0000: journal.includes("0000_omniscient_jigsaw") && !journal.includes("0061") },
    });

    const aAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-A01");
    const rA = await Promise.allSettled([
      conf.confirmar(USER_A, cabeca("ven-3e8h-a", aAnim)),
      conf2.confirmar(USER_A, cabeca("ven-3e8h-a", aAnim)),
    ]);
    const a1 = settled(rA[0]!); const a2 = settled(rA[1]!);
    const idsA = [a1, a2].filter(x => x.ok).map(x => x.ok ? x.value : null);
    const vendasA = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = 'ven-3e8h-a'"))[0]?.n);
    const mesmosA = idsA.length === 2 && idsA[0]?.vendaId === idsA[1]?.vendaId && idsA[0]?.tituloId === idsA[1]?.tituloId;
    reg({ id: "A", nome: "Mesma chave e mesmo payload", ok: mesmosA && vendasA === 1 && !a1.sqlCru && !a2.sqlCru, detalhe: { a1, a2, vendasA } });

    const bAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-B01");
    const bOk = await conf.confirmar(USER_A, cabeca("ven-3e8h-b", bAnim));
    let bMsg = "";
    try { await conf2.confirmar(USER_A, cabeca("ven-3e8h-b", bAnim, { condicao: "definir_depois", parcelas: [] })); }
    catch (e) { bMsg = msg(e); }
    const vendasB = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = 'ven-3e8h-b'"))[0]?.n);
    reg({ id: "B", nome: "Mesma chave e payload diferente", ok: bOk.success && vendasB === 1 && bMsg.includes(MSG_VENDA_CONFLITO_IDEMPOTENCIA), detalhe: { bOk, bMsg, vendasB } });

    const cAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-C01");
    const rC = await Promise.allSettled([
      conf.confirmar(USER_A, cabeca("ven-3e8h-c1", cAnim)),
      conf2.confirmar(USER_A, cabeca("ven-3e8h-c2", cAnim)),
    ]);
    const c1 = settled(rC[0]!); const c2 = settled(rC[1]!);
    const vendasC = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key IN ('ven-3e8h-c1','ven-3e8h-c2')"))[0]?.n);
    reg({ id: "C", nome: "Duas chaves no mesmo animal", ok: [c1, c2].filter(x => x.ok).length === 1 && vendasC === 1 && await baixas(cAnim) === 1 && !c1.sqlCru && !c2.sqlCru, detalhe: { c1, c2, vendasC } });

    const d1a = await seedAnimal(pool, USER_A, fazendaA, "3E8H-D01");
    const d1b = await seedAnimal(pool, USER_A, fazendaA, "3E8H-D02");
    const d = await conf.confirmar(USER_A, kg("ven-3e8h-d", d1b, d1a, {
      condicao: "parcelado",
      parcelas: [
        { numero: 1, vencimento: "2026-11-23", valorOriginal: 5000 },
        { numero: 2, vencimento: "2026-12-23", valorOriginal: 6000 },
      ],
    }));
    const itensD = await q<{ animal_id: number; valor_item: string }[]>(pool, "SELECT animal_id, valor_item FROM venda_itens WHERE venda_id = ? ORDER BY animal_id", [d.vendaId]);
    const parcD = await q<{ valor_original: string }[]>(pool, "SELECT valor_original FROM financeiro_parcelas WHERE titulo_id = ? ORDER BY numero", [d.tituloId]);
    reg({
      id: "D",
      nome: "Múltiplos animais e parcelas",
      ok: d.success && d.valorTotal === 11000 && await titulosDaVenda(d.vendaId) === 1
        && itensD.map(i => i.animal_id).join(",") === `${d1a},${d1b}`
        && parcD.map(p => Number(p.valor_original)).join(",") === "5000,6000"
        && await statusAnimal(d1a) === "vendido" && await statusAnimal(d1b) === "vendido",
      detalhe: { d, itensD, parcD },
    });

    const eAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-E01");
    const e1 = await conf.confirmar(USER_A, cabeca("ven-3e8h-e", eAnim));
    const e2 = await conf2.confirmar(USER_A, cabeca("ven-3e8h-e", eAnim));
    reg({ id: "E", nome: "Recuperação após resposta perdida", ok: e2.idempotente && e2.vendaId === e1.vendaId && e2.tituloId === e1.tituloId, detalhe: { e1, e2 } });

    const fAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-F01");
    const dAbort = {
      transaction(fn: (tx: unknown) => Promise<unknown>) {
        return d1.transaction(async tx => {
          await fn(tx);
          throw new Error("3E8H-F-ABORT");
        });
      },
    };
    const confFail = createConfirmarVendaFinanceiroService(createConfirmarVendaFinanceiroMysqlStore(dAbort as typeof d1));
    let fMsg = "";
    try { await confFail.confirmar(USER_A, cabeca("ven-3e8h-f", fAnim)); }
    catch (e) { fMsg = msg(e); }
    const vendasF = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = 'ven-3e8h-f'"))[0]?.n);
    const titF = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos WHERE documento_referencia = 'VENDA-F'"))[0]?.n);
    reg({
      id: "F",
      nome: "Falha antes do COMMIT",
      ok: fMsg.includes("3E8H-F-ABORT") && vendasF === 0 && await statusAnimal(fAnim) === "ativo" && await baixas(fAnim) === 0,
      detalhe: { fMsg, vendasF, titF, status: await statusAnimal(fAnim) },
    });

    const gAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-G01");
    const g1 = await conf.confirmar(USER_A, cabeca("ven-3e8h-g", gAnim));
    const g2 = await conf.confirmar(USER_A, cabeca("ven-3e8h-g", gAnim));
    const vendasG = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = 'ven-3e8h-g'"))[0]?.n);
    reg({ id: "G", nome: "Falha após COMMIT (retry da mesma chave)", ok: g2.idempotente && g2.vendaId === g1.vendaId && vendasG === 1, detalhe: { g1, g2, vendasG } });

    const hAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-H01");
    const hVenda = await conf.confirmar(USER_A, cabeca("ven-3e8h-h", hAnim));
    const hCanc = await canc.cancelar(USER_A, { vendaId: hVenda.vendaId, motivo: "sem recebimento 3E8H", canceladoPorUserId: USER_A });
    const titH = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [hVenda.tituloId]))[0]?.estado;
    const stH = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [hVenda.vendaId]))[0]?.status;
    reg({ id: "H", nome: "Cancelamento sem recebimento", ok: hCanc.success && titH === "cancelado" && stH === "cancelado" && await statusAnimal(hAnim) === "ativo" && await baixas(hAnim) === 0, detalhe: { hCanc, titH, stH } });

    const iAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-I01");
    const iVenda = await conf.confirmar(USER_A, cabeca("ven-3e8h-i", iAnim));
    const recI = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: "rec-3e8h-i", alocacoes: [{ parcelaId: await parcela(iVenda.tituloId), principalLiquidado: 1500 }],
    });
    let iMsg = "";
    try { await canc.cancelar(USER_A, { vendaId: iVenda.vendaId, motivo: "com recebimento", canceladoPorUserId: USER_A }); }
    catch (e) { iMsg = msg(e); }
    const titI = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [iVenda.tituloId]))[0]?.estado;
    reg({ id: "I", nome: "Cancelamento com recebimento efetivo", ok: iMsg.includes(MSG_VENDA_CANCELAR_COM_RECEBIMENTO) && titI === "ativo" && await efetiva(iVenda.tituloId) === 1 && recI.id > 0, detalhe: { iMsg, titI, recI: recI.id } });

    const jAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-J01");
    const jVenda = await conf.confirmar(USER_A, cabeca("ven-3e8h-j", jAnim));
    const recJ = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: "rec-3e8h-j", alocacoes: [{ parcelaId: await parcela(jVenda.tituloId), principalLiquidado: 1500 }],
    });
    await nucleo.estornarLiquidacao(USER_A, { liquidacaoId: recJ.id, idempotencyKey: "est-3e8h-j", dataLiquidacao: "2026-10-24" });
    const jCanc = await canc.cancelar(USER_A, { vendaId: jVenda.vendaId, motivo: "após estorno", canceladoPorUserId: USER_A });
    const titJ = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [jVenda.tituloId]))[0]?.estado;
    const liqJ = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE id = ? OR liquidacao_original_id = ?", [recJ.id, recJ.id]))[0]?.n);
    reg({ id: "J", nome: "Cancelamento após estorno", ok: jCanc.success && titJ === "cancelado" && await statusAnimal(jAnim) === "ativo" && liqJ === 2 && await efetiva(jVenda.tituloId) === 0, detalhe: { jCanc, titJ, liqJ } });

    const kAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-K01");
    const kVenda = await conf.confirmar(USER_A, cabeca("ven-3e8h-k", kAnim));
    const rK = await Promise.allSettled([
      canc.cancelar(USER_A, { vendaId: kVenda.vendaId, motivo: "primeiro", canceladoPorUserId: USER_A }),
      canc2.cancelar(USER_A, { vendaId: kVenda.vendaId, motivo: "segundo", canceladoPorUserId: USER_A }),
    ]);
    const k1 = settled(rK[0]!); const k2 = settled(rK[1]!);
    const stK = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [kVenda.vendaId]))[0]?.status;
    reg({ id: "K", nome: "Dois cancelamentos simultâneos", ok: [k1, k2].filter(x => x.ok).length === 1 && stK === "cancelado" && !k1.sqlCru && !k2.sqlCru, detalhe: { k1, k2, stK } });

    const lAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-L01");
    const lVenda = await conf.confirmar(USER_A, cabeca("ven-3e8h-l", lAnim));
    const parcL = await parcela(lVenda.tituloId);
    const rL = await Promise.allSettled([
      canc.cancelar(USER_A, { vendaId: lVenda.vendaId, motivo: "corrida rec", canceladoPorUserId: USER_A }),
      nucleo2.criarRecebimento(USER_A, {
        contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
        idempotencyKey: "rec-3e8h-l", alocacoes: [{ parcelaId: parcL, principalLiquidado: 1500 }],
      }),
    ]);
    const lCanc = settled(rL[0]!); const lRec = settled(rL[1]!);
    const titL = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [lVenda.tituloId]))[0]?.estado;
    const efL = await efetiva(lVenda.tituloId);
    const sqlL = Boolean(lCanc.sqlCru || lRec.sqlCru);
    const recusaRec = !lRec.ok && lRec.erro.includes(MSG_FIN_TITULO_CANCELADO);
    const recusaCanc = !lCanc.ok && lCanc.erro.includes(MSG_VENDA_CANCELAR_COM_RECEBIMENTO);
    reg({ id: "L", nome: "Cancelamento × recebimento", ok: !(titL === "cancelado" && efL > 0) && (lCanc.ok || lRec.ok) && (recusaCanc || recusaRec || (lCanc.ok && efL === 0)) && !sqlL, detalhe: { lCanc, lRec, titL, efL } });

    const mAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-M01");
    const mVenda = await conf.confirmar(USER_A, cabeca("ven-3e8h-m", mAnim));
    const recM = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: "rec-3e8h-m", alocacoes: [{ parcelaId: await parcela(mVenda.tituloId), principalLiquidado: 1500 }],
    });
    const rM = await Promise.allSettled([
      nucleo2.estornarLiquidacao(USER_A, { liquidacaoId: recM.id, idempotencyKey: "est-3e8h-m", dataLiquidacao: "2026-10-24" }),
      canc.cancelar(USER_A, { vendaId: mVenda.vendaId, motivo: "corrida est", canceladoPorUserId: USER_A }),
    ]);
    const mEst = settled(rM[0]!); const mCanc = settled(rM[1]!);
    const titM = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [mVenda.tituloId]))[0]?.estado;
    const efM = await efetiva(mVenda.tituloId);
    const liqM = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE id = ? OR liquidacao_original_id = ?", [recM.id, recM.id]))[0]?.n);
    reg({ id: "M", nome: "Cancelamento × estorno", ok: !(titM === "cancelado" && efM > 0) && liqM <= 2 && (mEst.ok || mCanc.ok) && !mEst.sqlCru && !mCanc.sqlCru, detalhe: { mEst, mCanc, titM, efM, liqM } });

    const nAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-N01");
    const nVenda = await conf.confirmar(USER_A, cabeca("ven-3e8h-n", nAnim));
    const recN = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: "rec-3e8h-n", alocacoes: [{ parcelaId: await parcela(nVenda.tituloId), principalLiquidado: 1500 }],
    });
    const movN = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_movimentos WHERE liquidacao_id = ?", [recN.id]))[0]?.n);
    reg({ id: "N", nome: "Recebimento normal", ok: recN.id > 0 && movN === 1 && await efetiva(nVenda.tituloId) === 1, detalhe: { recN, movN } });

    const oParc = await parcela(d.tituloId);
    const recO = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 4000,
      idempotencyKey: "rec-3e8h-o", alocacoes: [{ parcelaId: oParc, principalLiquidado: 4000 }],
    });
    const princO = Number((await q<{ s: string }[]>(pool, `SELECT COALESCE(SUM(CASE WHEN l.tipo IN ('recebimento','pagamento') THEN a.principal_liquidado WHEN l.tipo LIKE 'estorno_%' THEN -a.principal_liquidado ELSE 0 END),0) s
      FROM financeiro_liquidacao_alocacoes a JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id WHERE a.parcela_id = ?`, [oParc]))[0]?.s);
    reg({ id: "O", nome: "Recebimento parcial", ok: recO.id > 0 && princO === 4000, detalhe: { recO, princO } });

    const pAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-P01");
    const pVenda = await conf.confirmar(USER_A, cabeca("ven-3e8h-p", pAnim));
    const recP = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: "rec-3e8h-p", alocacoes: [{ parcelaId: await parcela(pVenda.tituloId), principalLiquidado: 1500 }],
    });
    const detP = await nucleo.detalheTitulo(USER_A, pVenda.tituloId);
    reg({ id: "P", nome: "Recebimento integral", ok: recP.id > 0 && detP.parcelas[0]?.quitada === true, detalhe: { recP, quitada: detP.parcelas[0]?.quitada } });

    const estQ = await nucleo.estornarLiquidacao(USER_A, { liquidacaoId: recP.id, idempotencyKey: "est-3e8h-q", dataLiquidacao: "2026-10-24" });
    const detQ = await nucleo.detalheTitulo(USER_A, pVenda.tituloId);
    reg({ id: "Q", nome: "Estorno de recebimento", ok: estQ.id > 0 && detQ.parcelas[0]?.quitada === false && Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_movimentos WHERE liquidacao_id = ?", [estQ.id]))[0]?.n) === 1, detalhe: { estQ } });

    const rAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-R01");
    const rVenda = await conf.confirmar(USER_A, cabeca("ven-3e8h-r", rAnim));
    const recR = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: "rec-3e8h-r", alocacoes: [{ parcelaId: await parcela(rVenda.tituloId), principalLiquidado: 1500 }],
    });
    const rHs = await Promise.allSettled([
      nucleo.estornarLiquidacao(USER_A, { liquidacaoId: recR.id, idempotencyKey: "est-3e8h-r", dataLiquidacao: "2026-10-24" }),
      nucleo2.estornarLiquidacao(USER_A, { liquidacaoId: recR.id, idempotencyKey: "est-3e8h-r", dataLiquidacao: "2026-10-24" }),
    ]);
    const r1 = settled(rHs[0]!); const r2 = settled(rHs[1]!);
    const idsR = [r1, r2].filter(x => x.ok).map(x => x.ok ? x.value.id : null);
    const estR = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE liquidacao_original_id = ?", [recR.id]))[0]?.n);
    reg({ id: "R", nome: "Dois estornos mesma chave", ok: estR === 1 && idsR.length === 2 && idsR[0] === idsR[1] && !r1.sqlCru && !r2.sqlCru, detalhe: { r1, r2, estR } });

    const sAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-S01");
    const sVenda = await conf.confirmar(USER_A, cabeca("ven-3e8h-s", sAnim));
    const recS = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: "rec-3e8h-s", alocacoes: [{ parcelaId: await parcela(sVenda.tituloId), principalLiquidado: 1500 }],
    });
    const rS = await Promise.allSettled([
      nucleo.estornarLiquidacao(USER_A, { liquidacaoId: recS.id, idempotencyKey: "est-3e8h-s1", dataLiquidacao: "2026-10-24" }),
      nucleo2.estornarLiquidacao(USER_A, { liquidacaoId: recS.id, idempotencyKey: "est-3e8h-s2", dataLiquidacao: "2026-10-24" }),
    ]);
    const s1 = settled(rS[0]!); const s2 = settled(rS[1]!);
    const estS = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE liquidacao_original_id = ?", [recS.id]))[0]?.n);
    const recusaS = [s1, s2].some(x => !x.ok && x.erro.includes(MSG_FIN_LIQUIDACAO_JA_ESTORNADA));
    reg({ id: "S", nome: "Dois estornos chaves diferentes", ok: estS === 1 && [s1, s2].filter(x => x.ok).length === 1 && recusaS && !s1.sqlCru && !s2.sqlCru, detalhe: { s1, s2, estS } });

    const t1a = await seedAnimal(pool, USER_A, fazendaA, "3E8H-T01");
    const t1b = await seedAnimal(pool, USER_A, fazendaA, "3E8H-T02");
    const tVenda = await conf.confirmar(USER_A, kg("ven-3e8h-t", t1a, t1b));
    const parcT = await parcela(tVenda.tituloId);
    const recT = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 4000,
      idempotencyKey: "rec-3e8h-t1", alocacoes: [{ parcelaId: parcT, principalLiquidado: 4000 }],
    });
    const rT = await Promise.allSettled([
      nucleo.estornarLiquidacao(USER_A, { liquidacaoId: recT.id, idempotencyKey: "est-3e8h-t", dataLiquidacao: "2026-10-24" }),
      nucleo2.criarRecebimento(USER_A, {
        contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 5000,
        idempotencyKey: "rec-3e8h-t2", alocacoes: [{ parcelaId: parcT, principalLiquidado: 5000 }],
      }),
    ]);
    const tEst = settled(rT[0]!); const tRec = settled(rT[1]!);
    const princT = Number((await q<{ s: string }[]>(pool, `SELECT COALESCE(SUM(CASE WHEN l.tipo IN ('recebimento','pagamento') THEN a.principal_liquidado WHEN l.tipo LIKE 'estorno_%' THEN -a.principal_liquidado ELSE 0 END),0) s
      FROM financeiro_liquidacao_alocacoes a JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id WHERE a.parcela_id = ?`, [parcT]))[0]?.s);
    const movT = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_movimentos m JOIN financeiro_liquidacoes l ON l.id = m.liquidacao_id JOIN financeiro_liquidacao_alocacoes a ON a.liquidacao_id = l.id WHERE a.parcela_id = ?", [parcT]))[0]?.n);
    const liqT = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes l JOIN financeiro_liquidacao_alocacoes a ON a.liquidacao_id = l.id WHERE a.parcela_id = ?", [parcT]))[0]?.n);
    reg({ id: "T", nome: "Estorno × novo recebimento", ok: princT >= 0 && princT <= 11000 && movT === liqT && (tEst.ok || tRec.ok) && !tEst.sqlCru && !tRec.sqlCru, detalhe: { tEst, tRec, princT, movT, liqT } });

    const uAnim = await seedAnimal(pool, USER_A, fazendaA, "3E8H-U01");
    const uVenda = await conf.confirmar(USER_A, cabeca("ven-3e8h-u", uAnim));
    const recU = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: "rec-3e8h-u", alocacoes: [{ parcelaId: await parcela(uVenda.tituloId), principalLiquidado: 1500 }],
    });
    await pool.query("UPDATE financeiro_titulos SET estado = 'cancelado' WHERE id = ? AND user_id = ?", [uVenda.tituloId, USER_A]);
    const estU = await nucleo.estornarLiquidacao(USER_A, { liquidacaoId: recU.id, idempotencyKey: "est-3e8h-u", dataLiquidacao: "2026-10-24" });
    let uNovo = false;
    try {
      await nucleo.criarRecebimento(USER_A, {
        contaId: contaA, dataLiquidacao: "2026-10-25", valorMovimentado: 1500,
        idempotencyKey: "rec-3e8h-u-novo", alocacoes: [{ parcelaId: await parcela(uVenda.tituloId), principalLiquidado: 1500 }],
      });
      uNovo = true;
    } catch (e) {
      if (!msg(e).includes(MSG_FIN_TITULO_CANCELADO)) throw e;
    }
    const origU = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE id = ?", [recU.id]))[0]?.n);
    reg({ id: "U", nome: "Estorno de título cancelado", ok: estU.id > 0 && !uNovo && origU === 1, detalhe: { estU, uNovo, origU } });

    const pagTit = await nucleo.criarTitulo(USER_A, {
      tipo: "pagar", pessoaId: fornecedorA, descricao: "Compra 3E8H V", dataCompetencia: "2026-10-23", valorOriginal: 8000,
      parcelas: [{ numero: 1, vencimento: "2026-11-23", valorOriginal: 8000 }],
    });
    const parcV = Number((await q<{ id: number }[]>(pool, "SELECT id FROM financeiro_parcelas WHERE titulo_id = ?", [pagTit.id]))[0]?.id);
    const pagV = await nucleo.criarPagamento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 8000,
      idempotencyKey: "pag-3e8h-v", alocacoes: [{ parcelaId: parcV, principalLiquidado: 8000 }],
    });
    const estV = await nucleo.estornarLiquidacao(USER_A, { liquidacaoId: pagV.id, idempotencyKey: "est-3e8h-v", dataLiquidacao: "2026-10-24" });
    const movV = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_movimentos WHERE liquidacao_id IN (?, ?)", [pagV.id, estV.id]))[0]?.n);
    reg({ id: "V", nome: "Pagamento e estorno em Contas a Pagar", ok: pagV.id > 0 && estV.id > 0 && movV === 2, detalhe: { pagV, estV, movV } });

    const contaDest = await nucleo.criarContaFinanceira(USER_A, { nome: "Banco 3E8H", tipo: "conta_corrente", saldoAbertura: 0, dataSaldoAbertura: "2026-10-01" });
    const tr = await nucleo.criarTransferencia(USER_A, {
      contaOrigemId: contaA, contaDestinoId: contaDest.id, dataTransferencia: "2026-10-23", valor: 1000, idempotencyKey: "tr-3e8h-w",
    });
    const tr2 = await nucleo.criarTransferencia(USER_A, {
      contaOrigemId: contaA, contaDestinoId: contaDest.id, dataTransferencia: "2026-10-23", valor: 1000, idempotencyKey: "tr-3e8h-w",
    });
    const pernas = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_movimentos WHERE transferencia_id = ?", [tr.id]))[0]?.n);
    const nTr = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_transferencias WHERE idempotency_key = 'tr-3e8h-w'"))[0]?.n);
    reg({ id: "W", nome: "Transferência financeira", ok: tr.id > 0 && tr2.idempotente && tr2.id === tr.id && pernas === 2 && nTr === 1, detalhe: { tr, tr2, pernas, nTr } });

    const isoAnim = await seedAnimal(pool, USER_B, fazendaB, "3E8H-ISO-B");
    await conf2.confirmar(USER_B, {
      idempotencyKey: "ven-3e8h-iso-b", fazendaId: fazendaB, data: "2026-10-23", compradorId: pessoaB,
      formaPrecificacao: "cabeca", itens: [{ animalId: isoAnim, precoUnitario: 1800 }], condicao: "definir_depois",
    });

    const dupVendaAnimal = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM (
      SELECT vi.animal_id FROM venda_itens vi JOIN vendas v ON v.id = vi.venda_id
      WHERE v.status = 'concluido' AND v.idempotency_key LIKE 'ven-3e8h%' GROUP BY vi.animal_id HAVING COUNT(*) > 1) x`))[0]?.n);
    const semTitulo = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM vendas v
      LEFT JOIN financeiro_titulos t ON t.origem_tipo = 'venda_animais' AND t.origem_id = v.id AND t.origem_item_chave = 'principal'
      WHERE v.idempotency_key LIKE 'ven-3e8h%' AND v.status = 'concluido' AND t.id IS NULL`))[0]?.n);
    const orfaoTit = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM financeiro_titulos t
      LEFT JOIN vendas v ON v.id = t.origem_id
      WHERE t.origem_tipo = 'venda_animais' AND t.origem_item_chave = 'principal' AND t.documento_referencia LIKE 'VENDA-%'
        AND t.id IN (SELECT id FROM financeiro_titulos WHERE user_id = ? AND origem_tipo = 'venda_animais')
        AND v.id IS NULL`, [USER_A]))[0]?.n);
    const dupTit = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM (
      SELECT origem_id FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_item_chave = 'principal'
        AND origem_id IN (SELECT id FROM vendas WHERE idempotency_key LIKE 'ven-3e8h%') GROUP BY origem_id HAVING COUNT(*) > 1) x`))[0]?.n);
    const dupBaixa = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM (
      SELECT animalId FROM animal_baixas WHERE status = 'ativa' AND animalId IN (SELECT id FROM animais WHERE brinco LIKE '3E8H%')
      GROUP BY animalId HAVING COUNT(*) > 1) x`))[0]?.n);
    const cancEfetiva = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM financeiro_titulos t WHERE t.estado = 'cancelado' AND t.origem_tipo = 'venda_animais'
      AND t.origem_id IN (SELECT id FROM vendas WHERE idempotency_key LIKE 'ven-3e8h%')
      AND EXISTS (
        SELECT 1 FROM financeiro_parcelas p JOIN financeiro_liquidacao_alocacoes a ON a.parcela_id = p.id
        JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id
        WHERE p.titulo_id = t.id AND l.tipo IN ('recebimento','pagamento')
          AND NOT EXISTS (SELECT 1 FROM financeiro_liquidacoes e WHERE e.liquidacao_original_id = l.id)
      )`))[0]?.n);
    const dupEst = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM (
      SELECT liquidacao_original_id FROM financeiro_liquidacoes WHERE liquidacao_original_id IS NOT NULL AND idempotency_key LIKE '%3e8h%'
      GROUP BY liquidacao_original_id HAVING COUNT(*) > 1) x`))[0]?.n);
    const movSemOrigem = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM financeiro_movimentos m
      WHERE m.user_id = ? AND m.liquidacao_id IS NULL AND m.transferencia_id IS NULL`, [USER_A]))[0]?.n);
    const saldo = await nucleo.calcularSaldoConta(USER_A, contaA);
    const movSum = Number((await q<{ s: string }[]>(pool, `SELECT COALESCE(SUM(CASE WHEN direcao = 'entrada' THEN valor WHEN direcao = 'saida' THEN -valor ELSE 0 END),0) s FROM financeiro_movimentos WHERE user_id = ? AND conta_id = ?`, [USER_A, contaA]))[0]?.s);
    const abertura = Number((await q<{ s: string }[]>(pool, "SELECT saldo_abertura s FROM financeiro_contas WHERE id = ?", [contaA]))[0]?.s);
    const isoB = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE user_id = ? AND idempotency_key = 'ven-3e8h-iso-b'", [USER_B]))[0]?.n);
    const vendasAnterioresDepois = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key LIKE 'ven-3e8e%' OR idempotency_key LIKE 'ven-3e8f%' OR idempotency_key LIKE 'ven-3e8g%'"))[0]?.n);

    const webLockLimitacao = pendSrc.includes("void webLocks.request") && pendSrc.includes("return obtido;");

    reg({
      id: "INV",
      nome: "Invariantes finais 3E.8H",
      ok: dupVendaAnimal === 0 && semTitulo === 0 && orfaoTit === 0 && dupTit === 0 && dupBaixa === 0
        && cancEfetiva === 0 && dupEst === 0 && Number(saldo) === abertura + movSum && isoB === 1
        && vendasAnterioresDepois === vendasAnteriores,
      detalhe: {
        dupVendaAnimal, semTitulo, orfaoTit, dupTit, dupBaixa, cancEfetiva, dupEst, movSemOrigem,
        saldo, movSum, abertura, isoB, vendasAnteriores, vendasAnterioresDepois, webLockLimitacao,
      },
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
    reg({ id: "ABORT", nome: "Execução", ok: false, detalhe: {}, erro: msg(e) });
  } finally {
    if (pool) await pool.end();
    if (pool2) await pool2.end();
    await admin.end();
  }

  const ok = problemas.length === 0;
  console.log(JSON.stringify({
    banco: TESTE,
    parecer: ok ? "APTO PARA PREPARAR ATIVAÇÃO" : "NECESSITA CORREÇÕES",
    problemas,
    cenarios,
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
