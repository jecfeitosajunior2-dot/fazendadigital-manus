/**
 * Homologação 3E.9B.1 — cancelamento protegido (vendas.cancelar).
 * Somente fazenda_digital_test_3e8e. Não apaga cenários anteriores.
 * Não ativa integração. Não aplica migration. Sem escrita no operacional.
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
import {
  createCancelarVendaFinanceiroService,
  MSG_VENDA_CANCELAR_COM_RECEBIMENTO,
  MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO,
} from "../server/cancelarVendaFinanceiro";
import { createCancelarVendaFinanceiroMysqlStore } from "../server/cancelarVendaFinanceiroMysql";
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "../server/financeiroNucleo";
import { MSG_VENDA_CANCELAR_JA_CANCELADA, MSG_VENDA_CANCELAR_NAO_ENCONTRADA } from "../server/cancelarVenda";
import { MSG_FIN_TITULO_CANCELADO } from "../shared/financeiroNucleo";
import { INTEGRACAO_CONFIRMACAO_VENDA_ATIVA } from "../client/src/lib/novaVendaPendencia";
import { UNAUTHED_ERR_MSG } from "../shared/const";

const TESTE = "fazenda_digital_test_3e8e";
const TESTE_3E5B = "fazenda_digital_test_3e5b";
const OPERACIONAL = "fazenda_digital";
const HOMOLOG_3C47 = "fazenda_digital_homolog_3c47";
const HOMOLOG_3B2A3 = "fazenda_digital_homolog_3b2a3";
const PROTEGIDOS = [OPERACIONAL, HOMOLOG_3C47, HOMOLOG_3B2A3, TESTE_3E5B] as const;
const USER_A = 940001;
const USER_B = 940002;
const PREFIXOS_ANTERIORES = ["ven-3e8e%", "ven-3e8f%", "ven-3e8g%", "ven-3e8h%", "ven-3e8i%"] as const;

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
  await pool.query("INSERT INTO animais (`userId`, `brinco`, `sexo`, `status`, `fazendaId`) VALUES (?, ?, 'macho', 'ativo', ?)", [userId, brinco, fazendaId]);
  return Number((await q<{ id: number }[]>(pool, "SELECT id FROM animais WHERE brinco = ? AND userId = ?", [brinco, userId]))[0]?.id);
}

async function vendaHistorica(pool: mysql.Pool, input: {
  userId: number;
  fazendaId: number;
  pessoaId: number;
  animalId: number;
  brinco: string;
  chave?: string | null;
}) {
  await pool.query(
    `INSERT INTO vendas (user_id, comprador, data, quantidade_animais, valor_total, status, fazenda_id, comprador_id, forma_precificacao, idempotency_key)
     VALUES (?, 'Histórico 3E9B1', '2026-10-20', 1, '1500.00', 'concluido', ?, ?, 'cabeca', ?)`,
    [input.userId, input.fazendaId, input.pessoaId, input.chave ?? null],
  );
  const vendaId = Number((await q<{ id: number }[]>(pool, "SELECT LAST_INSERT_ID() id"))[0]?.id);
  await pool.query(
    `INSERT INTO venda_itens (user_id, venda_id, animal_id, brinco_snapshot, forma_precificacao, preco_unitario, valor_item)
     VALUES (?, ?, ?, ?, 'cabeca', '1500.00', '1500.00')`,
    [input.userId, vendaId, input.animalId, input.brinco],
  );
  await pool.query("UPDATE animais SET status = 'vendido' WHERE id = ? AND userId = ?", [input.animalId, input.userId]);
  await pool.query(
    `INSERT INTO animal_baixas (userId, animalId, fazendaId, tipo, dataBaixa, destino, vendaId, status)
     VALUES (?, ?, ?, 'venda', '2026-10-20', 'Histórico 3E9B1', ?, 'ativa')`,
    [input.userId, input.animalId, input.fazendaId, vendaId],
  );
  return vendaId;
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
    const idxOp = Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendas' AND INDEX_NAME = 'vendas_idem_uq'`, [OPERACIONAL]))[0]?.n);
    const colTeste = Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendas' AND COLUMN_NAME = 'idempotency_key'`, [TESTE]))[0]?.n);

    const bancos = (await q<{ Database: string }[]>(admin, "SHOW DATABASES")).map(b => b.Database);
    if (!bancos.includes(TESTE)) throw new Error("ABORT: banco de teste 3e8e ausente");

    const likeAnteriores = PREFIXOS_ANTERIORES.map(() => "idempotency_key LIKE ?").join(" OR ");
    const vendasAnteriores = Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${TESTE}\`.vendas WHERE ${likeAnteriores}`, [...PREFIXOS_ANTERIORES]))[0]?.n);

    pool = mysql.createPool({ host: cred.host, port: cred.port, user: cred.user, password: cred.password, database: TESTE, connectionLimit: 8 });
    pool2 = mysql.createPool({ host: cred.host, port: cred.port, user: cred.user, password: cred.password, database: TESTE, connectionLimit: 4 });
    const [db1] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    const [db2] = await q<{ db: string }[]>(pool2, "SELECT DATABASE() db");
    assertTeste(db1.db);
    assertTeste(db2.db);

    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM fazendas WHERE userId = ?", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda 3E9B1 A')", [USER_A]);
    }
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM fazendas WHERE userId = ?", [USER_B]))[0]?.n)) {
      await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda 3E9B1 B')", [USER_B]);
    }
    const fazendaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    const fazendaB = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id LIMIT 1", [USER_B]))[0]?.id);
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM pessoas WHERE user_id = ? AND tipo = 'cliente'", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Cliente 3E9B1 A', 'cliente', 1)", [USER_A]);
    }
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM pessoas WHERE user_id = ? AND tipo = 'cliente'", [USER_B]))[0]?.n)) {
      await pool.query("INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Cliente 3E9B1 B', 'cliente', 1)", [USER_B]);
    }
    const pessoaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'cliente' ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    const pessoaB = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'cliente' ORDER BY id LIMIT 1", [USER_B]))[0]?.id);
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_contas WHERE user_id = ?", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO financeiro_contas (user_id, nome, tipo, saldo_abertura, data_saldo_abertura, ativa) VALUES (?, 'Caixa 3E9B1', 'caixa', '200000.00', '2026-10-01', 1)", [USER_A]);
    }
    const contaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM financeiro_contas WHERE user_id = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);

    const d1 = drizzle(pool, { schema, mode: "default" as const });
    const d2 = drizzle(pool2, { schema, mode: "default" as const });
    const conf = createConfirmarVendaFinanceiroService(createConfirmarVendaFinanceiroMysqlStore(d1));
    const canc = createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(d1));
    const canc2 = createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(d2));
    const nucleo = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(d1));
    const nucleo2 = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(d2));

    const cabeca = (key: string, animalId: number, extra: Partial<ConfirmarVendaFinanceiroInput> = {}): ConfirmarVendaFinanceiroInput => ({
      idempotencyKey: key, fazendaId: fazendaA, data: "2026-10-23", compradorId: pessoaA,
      formaPrecificacao: "cabeca", itens: [{ animalId, precoUnitario: 1500 }], condicao: "a_vista", ...extra,
    });

    async function statusAnimal(id: number) {
      return (await q<{ status: string }[]>(pool!, "SELECT status FROM animais WHERE id = ?", [id]))[0]?.status;
    }
    async function baixasAtivas(id: number) {
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
    const routerSrc = readFileSync(join(raiz, "../server/routers.ts"), "utf8");
    const cancSrc = readFileSync(join(raiz, "../server/cancelarVendaFinanceiro.ts"), "utf8");
    const mysqlSrc = readFileSync(join(raiz, "../server/cancelarVendaFinanceiroMysql.ts"), "utf8");
    const comercialSrc = readFileSync(join(raiz, "../server/cancelarVenda.ts"), "utf8");
    const trpcSrc = readFileSync(join(raiz, "../server/_core/trpc.ts"), "utf8");
    const pendSrc = readFileSync(join(raiz, "../client/src/lib/novaVendaPendencia.ts"), "utf8");
    const journal = readFileSync(join(raiz, "../drizzle/migrations/meta/_journal.json"), "utf8");

    const rotaCancelar = routerSrc.includes("createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(db)).cancelar");
    const rotaSemComercial = !routerSrc.includes("cancelarVendaComercial");
    const rotaConfirmarComercial = routerSrc.includes("confirmarVendaComercial") && !routerSrc.includes("confirmarVendaFinanceiro");
    const txUnica = cancSrc.includes("return await store.transaction(tx => cancelarVendaFinanceiroNoTx(tx, userId, input))")
      && mysqlSrc.includes("return drizzleDb.transaction(async drizzleTx => (")
      && !cancSrc.includes("cancelarVendaComercial")
      && !mysqlSrc.includes("cancelarVendaComercial");
    const forUpdate = mysqlSrc.includes("FOR UPDATE") && cancSrc.includes("lockTitulos") && cancSrc.includes("lockVenda");
    const retry = cancSrc.includes("for (let tentativa = 0; tentativa < 6; tentativa++)")
      && cancSrc.includes("isDeadlockMysql")
      && cancSrc.includes("isLockWaitTimeoutMysql");
    const adapterSemColuna = mysqlSrc.includes("FROM information_schema.COLUMNS")
      && mysqlSrc.includes("TABLE_SCHEMA = DATABASE()")
      && mysqlSrc.includes("SELECT id, user_id AS userId, status")
      && mysqlSrc.includes("idempotency_key AS idempotencyKey");

    reg({
      id: "TX",
      nome: "Auditoria transacional: uma transação, sem aninhamento",
      ok: rotaCancelar && rotaSemComercial && rotaConfirmarComercial && txUnica && forUpdate && retry
        && INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false
        && pendSrc.includes("INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = false")
        && !journal.includes("0061_vendas_idempotency")
        && db1.db === TESTE && db2.db === TESTE,
      detalhe: {
        db1: db1.db, db2: db2.db, rotaCancelar, rotaSemComercial, txUnica, forUpdate, retry,
        inicia: "cancelarVendaFinanceiroAtomico -> store.transaction -> drizzle BEGIN",
        forUpdateOrdem: "lockVenda -> lockTitulos (ids ordenados) -> parcelas no títuloTemLiquidacaoEfetiva",
        commit: "drizzle COMMIT ao fim de cancelarVendaFinanceiroNoTx; ROLLBACK em throw",
        retry: "6 tentativas, nova transação a cada 1213/1205; TRPCError não retenta",
        aninhada: false,
        comercialIndependente: comercialSrc.includes("return await db.transaction") && rotaSemComercial,
      },
    });

    reg({
      id: "OP",
      nome: "Compatibilidade operacional (somente leitura)",
      ok: colOp === 0 && idxOp === 0 && colTeste === 1 && adapterSemColuna
        && mysqlSrc.includes("if (cacheColunaIdempotency !== undefined) return cacheColunaIdempotency"),
      detalhe: { colOp, idxOp, colTeste, adapterSemColuna, consultaOperacional: "information_schema apenas; nenhum SELECT vendas.idempotency_key no operacional" },
    });

    const aAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B1-A01");
    const aVenda = await vendaHistorica(pool, { userId: USER_A, fazendaId: fazendaA, pessoaId: pessoaA, animalId: aAnim, brinco: "3E9B1-A01" });
    const aCanc = await canc.cancelar(USER_A, { vendaId: aVenda, motivo: "histórico sem V2", canceladoPorUserId: USER_A });
    const titA = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id = ?", [aVenda]))[0]?.n);
    const stA = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [aVenda]))[0]?.status;
    reg({
      id: "A",
      nome: "Venda histórica sem título V2",
      ok: aCanc.success && aCanc.vendaAntigaSemTitulo === true && aCanc.tituloId === null && titA === 0
        && stA === "cancelado" && await statusAnimal(aAnim) === "ativo" && await baixasAtivas(aAnim) === 0,
      detalhe: { aCanc, titA, stA },
    });

    const bAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B1-B01");
    const bVenda = await conf.confirmar(USER_A, cabeca("ven-3e9b1-b", bAnim));
    const bCanc = await canc.cancelar(USER_A, { vendaId: bVenda.vendaId, motivo: "integrada sem recebimento", canceladoPorUserId: USER_A });
    const titB = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [bVenda.tituloId]))[0]?.estado;
    const stB = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [bVenda.vendaId]))[0]?.status;
    reg({
      id: "B",
      nome: "Venda integrada com título V2",
      ok: bCanc.success && bCanc.tituloCancelado === true && titB === "cancelado" && stB === "cancelado"
        && await statusAnimal(bAnim) === "ativo" && INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false,
      detalhe: { bCanc, titB, stB, flag: INTEGRACAO_CONFIRMACAO_VENDA_ATIVA },
    });

    const cAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B1-C01");
    const cVenda = await conf.confirmar(USER_A, cabeca("ven-3e9b1-c", cAnim));
    const recC = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: "rec-3e9b1-c", alocacoes: [{ parcelaId: await parcela(cVenda.tituloId), principalLiquidado: 1500 }],
    });
    let cMsg = "";
    try { await canc.cancelar(USER_A, { vendaId: cVenda.vendaId, motivo: "com recebimento", canceladoPorUserId: USER_A }); }
    catch (e) { cMsg = msg(e); }
    const titC = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [cVenda.tituloId]))[0]?.estado;
    const stC = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [cVenda.vendaId]))[0]?.status;
    reg({
      id: "C",
      nome: "Venda integrada com recebimento efetivo",
      ok: cMsg.includes(MSG_VENDA_CANCELAR_COM_RECEBIMENTO) && titC === "ativo" && stC === "concluido"
        && await efetiva(cVenda.tituloId) === 1 && recC.id > 0 && await statusAnimal(cAnim) === "vendido",
      detalhe: { cMsg, titC, stC, recC: recC.id },
    });

    const dAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B1-D01");
    const dVenda = await conf.confirmar(USER_A, cabeca("ven-3e9b1-d", dAnim));
    const recD = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: "rec-3e9b1-d", alocacoes: [{ parcelaId: await parcela(dVenda.tituloId), principalLiquidado: 1500 }],
    });
    await nucleo.estornarLiquidacao(USER_A, { liquidacaoId: recD.id, idempotencyKey: "est-3e9b1-d", dataLiquidacao: "2026-10-24" });
    const dCanc = await canc.cancelar(USER_A, { vendaId: dVenda.vendaId, motivo: "após estorno", canceladoPorUserId: USER_A });
    const titD = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [dVenda.tituloId]))[0]?.estado;
    const liqD = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE id = ? OR liquidacao_original_id = ?", [recD.id, recD.id]))[0]?.n);
    reg({
      id: "D",
      nome: "Venda integrada após estorno completo",
      ok: dCanc.success && titD === "cancelado" && liqD === 2 && await efetiva(dVenda.tituloId) === 0
        && await statusAnimal(dAnim) === "ativo",
      detalhe: { dCanc, titD, liqD },
    });

    const eAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B1-E01");
    const eVenda = await vendaHistorica(pool, {
      userId: USER_A, fazendaId: fazendaA, pessoaId: pessoaA, animalId: eAnim, brinco: "3E9B1-E01", chave: "ven-3e9b1-e-semtit",
    });
    let eMsg = "";
    try { await canc.cancelar(USER_A, { vendaId: eVenda, motivo: "ven- sem título", canceladoPorUserId: USER_A }); }
    catch (e) { eMsg = msg(e); }
    const stE = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [eVenda]))[0]?.status;
    reg({
      id: "E",
      nome: "Venda com chave ven- e título ausente",
      ok: eMsg.includes(MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO) && stE === "concluido"
        && await statusAnimal(eAnim) === "vendido" && await baixasAtivas(eAnim) === 1,
      detalhe: { eMsg, stE },
    });

    const fAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B1-F01");
    const fVenda = await conf.confirmar(USER_A, cabeca("ven-3e9b1-f", fAnim));
    await pool.query(
      `INSERT INTO financeiro_titulos (user_id, tipo, estado, condicao_status, pessoa_id, contraparte_nome_snapshot, fazenda_origem_id, origem_tipo, origem_id, origem_item_chave, descricao, data_competencia, valor_original)
       SELECT user_id, tipo, estado, condicao_status, pessoa_id, contraparte_nome_snapshot, fazenda_origem_id, origem_tipo, origem_id, 'item-inconsistente', descricao, data_competencia, valor_original
       FROM financeiro_titulos WHERE id = ?`,
      [fVenda.tituloId],
    );
    await pool.query("DELETE FROM financeiro_titulos WHERE id = ?", [fVenda.tituloId]);
    let fMsg = "";
    try { await canc.cancelar(USER_A, { vendaId: fVenda.vendaId, motivo: "título inconsistente", canceladoPorUserId: USER_A }); }
    catch (e) { fMsg = msg(e); }
    const stF = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [fVenda.vendaId]))[0]?.status;
    const titF = (await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id = ?", [fVenda.vendaId]))[0]?.n;
    reg({
      id: "F",
      nome: "Venda com título V2 inconsistente",
      ok: fMsg.includes(MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO) && stF === "concluido" && Number(titF) === 1
        && await statusAnimal(fAnim) === "vendido",
      detalhe: { fMsg, stF, titF },
    });

    const gAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B1-G01");
    const gVenda = await conf.confirmar(USER_A, cabeca("ven-3e9b1-g", gAnim));
    const rG = await Promise.allSettled([
      canc.cancelar(USER_A, { vendaId: gVenda.vendaId, motivo: "primeiro", canceladoPorUserId: USER_A }),
      canc2.cancelar(USER_A, { vendaId: gVenda.vendaId, motivo: "segundo", canceladoPorUserId: USER_A }),
    ]);
    const g1 = settled(rG[0]!); const g2 = settled(rG[1]!);
    const stG = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [gVenda.vendaId]))[0]?.status;
    const titG = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [gVenda.tituloId]))[0]?.estado;
    const umOk = [g1, g2].filter(x => x.ok).length === 1;
    const outroJa = [g1, g2].some(x => !x.ok && x.erro.includes(MSG_VENDA_CANCELAR_JA_CANCELADA));
    reg({
      id: "G",
      nome: "Dois cancelamentos simultâneos",
      ok: umOk && outroJa && stG === "cancelado" && titG === "cancelado" && !g1.sqlCru && !g2.sqlCru,
      detalhe: { g1, g2, stG, titG },
    });

    const hAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B1-H01");
    const hVenda = await conf.confirmar(USER_A, cabeca("ven-3e9b1-h", hAnim));
    const parcH = await parcela(hVenda.tituloId);
    const rH = await Promise.allSettled([
      canc.cancelar(USER_A, { vendaId: hVenda.vendaId, motivo: "corrida rec", canceladoPorUserId: USER_A }),
      nucleo2.criarRecebimento(USER_A, {
        contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
        idempotencyKey: "rec-3e9b1-h", alocacoes: [{ parcelaId: parcH, principalLiquidado: 1500 }],
      }),
    ]);
    const hCanc = settled(rH[0]!); const hRec = settled(rH[1]!);
    const titH = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [hVenda.tituloId]))[0]?.estado;
    const efH = await efetiva(hVenda.tituloId);
    const recusaRec = !hRec.ok && hRec.erro.includes(MSG_FIN_TITULO_CANCELADO);
    const recusaCanc = !hCanc.ok && hCanc.erro.includes(MSG_VENDA_CANCELAR_COM_RECEBIMENTO);
    reg({
      id: "H",
      nome: "Cancelamento concorrente com recebimento",
      ok: !(titH === "cancelado" && efH > 0) && (hCanc.ok || hRec.ok) && (recusaCanc || recusaRec || (hCanc.ok && efH === 0))
        && !hCanc.sqlCru && !hRec.sqlCru,
      detalhe: { hCanc, hRec, titH, efH },
    });

    const iAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B1-I01");
    const iVenda = await conf.confirmar(USER_A, cabeca("ven-3e9b1-i", iAnim));
    const recI = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: "rec-3e9b1-i", alocacoes: [{ parcelaId: await parcela(iVenda.tituloId), principalLiquidado: 1500 }],
    });
    const rI = await Promise.allSettled([
      nucleo2.estornarLiquidacao(USER_A, { liquidacaoId: recI.id, idempotencyKey: "est-3e9b1-i", dataLiquidacao: "2026-10-24" }),
      canc.cancelar(USER_A, { vendaId: iVenda.vendaId, motivo: "corrida est", canceladoPorUserId: USER_A }),
    ]);
    const iEst = settled(rI[0]!); const iCanc = settled(rI[1]!);
    const titI = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [iVenda.tituloId]))[0]?.estado;
    const efI = await efetiva(iVenda.tituloId);
    const liqI = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE id = ? OR liquidacao_original_id = ?", [recI.id, recI.id]))[0]?.n);
    const cancelaComEfetivo = titI === "cancelado" && efI > 0;
    const recusaCancI = !iCanc.ok && iCanc.erro.includes(MSG_VENDA_CANCELAR_COM_RECEBIMENTO);
    const estornouECancelou = iEst.ok && iCanc.ok && titI === "cancelado" && efI === 0;
    const soEstorno = iEst.ok && recusaCancI && titI === "ativo";
    reg({
      id: "I",
      nome: "Cancelamento concorrente com estorno",
      ok: !cancelaComEfetivo && liqI <= 2 && (estornouECancelou || soEstorno || (iEst.ok || iCanc.ok))
        && !iEst.sqlCru && !iCanc.sqlCru,
      detalhe: { iEst, iCanc, titI, efI, liqI },
    });

    const jAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B1-J01");
    const jVenda = await conf.confirmar(USER_A, cabeca("ven-3e9b1-j", jAnim));
    const jCanc = await canc.cancelar(USER_A, { vendaId: jVenda.vendaId, motivo: "flag false + V2", canceladoPorUserId: USER_A });
    const titJ = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [jVenda.tituloId]))[0]?.estado;
    reg({
      id: "J",
      nome: "Flag false e venda integrada",
      ok: INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false && jCanc.tituloCancelado === true && titJ === "cancelado"
        && jCanc.vendaAntigaSemTitulo === false,
      detalhe: { flag: INTEGRACAO_CONFIRMACAO_VENDA_ATIVA, jCanc, titJ },
    });

    const kProtegida = trpcSrc.includes("if (!ctx.user)") && trpcSrc.includes("UNAUTHORIZED")
      && routerSrc.includes("cancelar: protectedProcedure");
    reg({
      id: "K",
      nome: "Usuário sem permissão (rota autenticada)",
      ok: kProtegida && UNAUTHED_ERR_MSG.length > 0,
      detalhe: { protectedProcedure: true, unauth: UNAUTHED_ERR_MSG, isolamento: "lockVenda filtra user_id" },
    });

    const lAnimA = await seedAnimal(pool, USER_A, fazendaA, "3E9B1-L-A");
    const lVendaA = await conf.confirmar(USER_A, cabeca("ven-3e9b1-l-a", lAnimA));
    const lAnimB = await seedAnimal(pool, USER_B, fazendaB, "3E9B1-L-B");
    const lVendaB = await conf.confirmar(USER_B, {
      idempotencyKey: "ven-3e9b1-l-b", fazendaId: fazendaB, data: "2026-10-23", compradorId: pessoaB,
      formaPrecificacao: "cabeca", itens: [{ animalId: lAnimB, precoUnitario: 1800 }], condicao: "a_vista",
    });
    let lMsgB = "";
    try { await canc.cancelar(USER_A, { vendaId: lVendaB.vendaId, motivo: "outra fazenda/usuário", canceladoPorUserId: USER_A }); }
    catch (e) { lMsgB = msg(e); }
    let lMsgA = "";
    try { await canc2.cancelar(USER_B, { vendaId: lVendaA.vendaId, motivo: "venda alheia", canceladoPorUserId: USER_B }); }
    catch (e) { lMsgA = msg(e); }
    const stLA = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [lVendaA.vendaId]))[0]?.status;
    const stLB = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [lVendaB.vendaId]))[0]?.status;
    reg({
      id: "L",
      nome: "Venda de outra fazenda ou usuário",
      ok: lMsgA.includes(MSG_VENDA_CANCELAR_NAO_ENCONTRADA) && lMsgB.includes(MSG_VENDA_CANCELAR_NAO_ENCONTRADA)
        && stLA === "concluido" && stLB === "concluido",
      detalhe: { lMsgA, lMsgB, stLA, stLB, nota: "isolamento por user_id, não por fazendaId" },
    });

    const orfaoTit = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM financeiro_titulos t
      LEFT JOIN vendas v ON v.id = t.origem_id
      WHERE t.user_id IN (?, ?) AND t.origem_tipo = 'venda_animais' AND t.origem_item_chave = 'principal' AND v.id IS NULL`, [USER_A, USER_B]))[0]?.n);
    const cancEfetiva = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM financeiro_titulos t
      WHERE t.estado = 'cancelado' AND t.origem_tipo = 'venda_animais'
        AND t.origem_id IN (SELECT id FROM vendas WHERE idempotency_key LIKE 'ven-3e9b1%')
        AND EXISTS (
          SELECT 1 FROM financeiro_parcelas p JOIN financeiro_liquidacao_alocacoes a ON a.parcela_id = p.id
          JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id
          WHERE p.titulo_id = t.id AND l.tipo IN ('recebimento','pagamento')
            AND NOT EXISTS (SELECT 1 FROM financeiro_liquidacoes e WHERE e.liquidacao_original_id = l.id)
        )`))[0]?.n);
    const dupBaixa = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM (
      SELECT animalId FROM animal_baixas WHERE status = 'ativa' AND animalId IN (SELECT id FROM animais WHERE brinco LIKE '3E9B1%')
      GROUP BY animalId HAVING COUNT(*) > 1) x`))[0]?.n);
    const dupEst = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM (
      SELECT liquidacao_original_id FROM financeiro_liquidacoes WHERE liquidacao_original_id IS NOT NULL AND idempotency_key LIKE '%3e9b1%'
      GROUP BY liquidacao_original_id HAVING COUNT(*) > 1) x`))[0]?.n);
    const animalInconsistente = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM vendas v
      JOIN venda_itens vi ON vi.venda_id = v.id
      JOIN animais a ON a.id = vi.animal_id
      WHERE v.idempotency_key LIKE 'ven-3e9b1%' AND v.status = 'cancelado' AND a.status = 'vendido'`))[0]?.n);
    const vendasAnterioresDepois = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM vendas WHERE ${likeAnteriores}`, [...PREFIXOS_ANTERIORES]))[0]?.n);

    reg({
      id: "INV",
      nome: "Invariantes 3E.9B.1",
      ok: orfaoTit === 0 && cancEfetiva === 0 && dupBaixa === 0 && dupEst === 0 && animalInconsistente === 0
        && vendasAnterioresDepois === vendasAnteriores,
      detalhe: { orfaoTit, cancEfetiva, dupBaixa, dupEst, animalInconsistente, vendasAnteriores, vendasAnterioresDepois },
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
      detalhe: { dbFinal: dbFinal.db, antesOp, depoisOp },
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
    parecer: ok ? "APTO — cancelamento protegido homologado" : "NECESSITA CORREÇÕES",
    problemas,
    cenarios: cenarios.map(c => ({ id: c.id, nome: c.nome, ok: c.ok, detalhe: c.detalhe, erro: c.erro })),
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
