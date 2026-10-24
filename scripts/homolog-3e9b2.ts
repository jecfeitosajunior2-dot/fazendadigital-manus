/**
 * Homologação 3E.9B.2 — endurecimento do cancelamento protegido.
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
import {
  createCancelarVendaFinanceiroService,
  MSG_VENDA_CANCELAR_COM_RECEBIMENTO,
  MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO,
  MSG_VENDA_CANCELAR_TITULOS_DUPLICADOS,
} from "../server/cancelarVendaFinanceiro";
import { createCancelarVendaFinanceiroMysqlStore } from "../server/cancelarVendaFinanceiroMysql";
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "../server/financeiroNucleo";
import { MSG_VENDA_CANCELAR_JA_CANCELADA } from "../server/cancelarVenda";
import { MSG_FIN_TITULO_CANCELADO } from "../shared/financeiroNucleo";
import { INTEGRACAO_CONFIRMACAO_VENDA_ATIVA } from "../client/src/lib/novaVendaPendencia";

const TESTE = "fazenda_digital_test_3e8e";
const TESTE_3E5B = "fazenda_digital_test_3e5b";
const OPERACIONAL = "fazenda_digital";
const HOMOLOG_3C47 = "fazenda_digital_homolog_3c47";
const HOMOLOG_3B2A3 = "fazenda_digital_homolog_3b2a3";
const PROTEGIDOS = [OPERACIONAL, HOMOLOG_3C47, HOMOLOG_3B2A3, TESTE_3E5B] as const;
const USER_A = 940001;
const PREFIXOS_ANTERIORES = ["ven-3e8e%", "ven-3e8f%", "ven-3e8g%", "ven-3e8h%", "ven-3e8i%", "ven-3e9b1%"] as const;

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

function isLockWait(texto: string) {
  return /ER_LOCK_WAIT_TIMEOUT|Lock wait timeout exceeded|1205/i.test(texto);
}

function settled<T>(r: PromiseSettledResult<T>) {
  if (r.status === "fulfilled") return { ok: true as const, value: r.value };
  return { ok: false as const, erro: msg(r.reason), sqlCru: erroSqlCru(msg(r.reason)), lockWait: isLockWait(msg(r.reason)) };
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
  userId: number; fazendaId: number; pessoaId: number; animalId: number; brinco: string; chave?: string | null;
}) {
  await pool.query(
    `INSERT INTO vendas (user_id, comprador, data, quantidade_animais, valor_total, status, fazenda_id, comprador_id, forma_precificacao, idempotency_key)
     VALUES (?, 'Histórico 3E9B2', '2026-10-20', 1, '1500.00', 'concluido', ?, ?, 'cabeca', ?)`,
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
     VALUES (?, ?, ?, 'venda', '2026-10-20', 'Histórico 3E9B2', ?, 'ativa')`,
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
  let hold: mysql.Connection | null = null;
  let waiter: mysql.Connection | null = null;
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

    const likeAnteriores = PREFIXOS_ANTERIORES.map(() => "idempotency_key LIKE ?").join(" OR ");
    const vendasAnteriores = Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${TESTE}\`.vendas WHERE ${likeAnteriores}`, [...PREFIXOS_ANTERIORES]))[0]?.n);

    pool = mysql.createPool({ host: cred.host, port: cred.port, user: cred.user, password: cred.password, database: TESTE, connectionLimit: 8 });
    pool2 = mysql.createPool({ host: cred.host, port: cred.port, user: cred.user, password: cred.password, database: TESTE, connectionLimit: 4 });
    const [db1] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    const [db2] = await q<{ db: string }[]>(pool2, "SELECT DATABASE() db");
    assertTeste(db1.db);
    assertTeste(db2.db);

    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM fazendas WHERE userId = ?", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda 3E9B2 A')", [USER_A]);
    }
    const fazendaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM pessoas WHERE user_id = ? AND tipo = 'cliente'", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Cliente 3E9B2 A', 'cliente', 1)", [USER_A]);
    }
    const pessoaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'cliente' ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_contas WHERE user_id = ?", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO financeiro_contas (user_id, nome, tipo, saldo_abertura, data_saldo_abertura, ativa) VALUES (?, 'Caixa 3E9B2', 'caixa', '200000.00', '2026-10-01', 1)", [USER_A]);
    }
    const contaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM financeiro_contas WHERE user_id = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);

    const d1 = drizzle(pool, { schema, mode: "default" as const });
    const d2 = drizzle(pool2, { schema, mode: "default" as const });
    const conf = createConfirmarVendaFinanceiroService(createConfirmarVendaFinanceiroMysqlStore(d1));
    const canc = createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(d1));
    const canc2 = createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(d2));
    const nucleo = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(d1));
    const nucleo2 = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(d2));

    const cabeca = (key: string, animalId: number): ConfirmarVendaFinanceiroInput => ({
      idempotencyKey: key, fazendaId: fazendaA, data: "2026-10-23", compradorId: pessoaA,
      formaPrecificacao: "cabeca", itens: [{ animalId, precoUnitario: 1500 }], condicao: "a_vista",
    });

    async function statusAnimal(id: number) {
      return (await q<{ status: string }[]>(pool!, "SELECT status FROM animais WHERE id = ?", [id]))[0]?.status;
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
    async function inserirExtra(tituloId: number, chave: string) {
      await pool!.query(
        `INSERT INTO financeiro_titulos (user_id, tipo, estado, condicao_status, pessoa_id, contraparte_nome_snapshot, fazenda_origem_id, origem_tipo, origem_id, origem_item_chave, descricao, data_competencia, valor_original)
         SELECT user_id, tipo, estado, condicao_status, pessoa_id, contraparte_nome_snapshot, fazenda_origem_id, origem_tipo, origem_id, ?, descricao, data_competencia, valor_original
         FROM financeiro_titulos WHERE id = ?`,
        [chave, tituloId],
      );
    }

    const raiz = dirname(fileURLToPath(import.meta.url));
    const cancSrc = readFileSync(join(raiz, "../server/cancelarVendaFinanceiro.ts"), "utf8");
    const mysqlSrc = readFileSync(join(raiz, "../server/cancelarVendaFinanceiroMysql.ts"), "utf8");
    const pendSrc = readFileSync(join(raiz, "../client/src/lib/novaVendaPendencia.ts"), "utf8");
    const journal = readFileSync(join(raiz, "../drizzle/migrations/meta/_journal.json"), "utf8");

    reg({
      id: "RR",
      nome: "Código: lock por origem, extras bloqueados, retry completo",
      ok: db1.db === TESTE && INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false
        && pendSrc.includes("INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = false")
        && !journal.includes("0061_vendas_idempotency")
        && cancSrc.includes("lockTitulosDaVenda")
        && cancSrc.includes("titulos.length > 1")
        && cancSrc.includes("for (let tentativa = 0; tentativa < 6; tentativa++)")
        && !cancSrc.includes("listarTitulosPorOrigemNoTx")
        && mysqlSrc.includes("ORDER BY id FOR UPDATE")
        && mysqlSrc.includes('.for("update")'),
      detalhe: { db1: db1.db, db2: db2.db },
    });

    const aAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B2-A01");
    const aVenda = await conf.confirmar(USER_A, cabeca("ven-3e9b2-a", aAnim));
    const aCanc = await canc.cancelar(USER_A, { vendaId: aVenda.vendaId, motivo: "principal único", canceladoPorUserId: USER_A });
    const titA = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [aVenda.tituloId]))[0]?.estado;
    reg({
      id: "A",
      nome: "Cancelamento com título principal único",
      ok: aCanc.success && aCanc.tituloCancelado && titA === "cancelado" && await statusAnimal(aAnim) === "ativo",
      detalhe: { aCanc, titA },
    });

    const bAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B2-B01");
    const bVenda = await conf.confirmar(USER_A, cabeca("ven-3e9b2-b", bAnim));
    await inserirExtra(bVenda.tituloId, "item-extra");
    let bMsg = "";
    try { await canc.cancelar(USER_A, { vendaId: bVenda.vendaId, motivo: "principal + extra", canceladoPorUserId: USER_A }); }
    catch (e) { bMsg = msg(e); }
    const titB = await q<{ id: number; estado: string; origem_item_chave: string }[]>(pool, "SELECT id, estado, origem_item_chave FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id = ?", [bVenda.vendaId]);
    const stB = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [bVenda.vendaId]))[0]?.status;
    reg({
      id: "B",
      nome: "Cancelamento com título principal + extra",
      ok: bMsg.includes(MSG_VENDA_CANCELAR_TITULOS_DUPLICADOS) && stB === "concluido"
        && titB.length === 2 && titB.every(t => t.estado === "ativo") && await statusAnimal(bAnim) === "vendido",
      detalhe: { bMsg, stB, titB },
    });

    const cAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B2-C01");
    const cVenda = await conf.confirmar(USER_A, cabeca("ven-3e9b2-c", cAnim));
    await inserirExtra(cVenda.tituloId, "item-so-extra");
    await pool.query("DELETE FROM financeiro_parcelas WHERE titulo_id = ?", [cVenda.tituloId]);
    await pool.query("DELETE FROM financeiro_titulos WHERE id = ?", [cVenda.tituloId]);
    let cMsg = "";
    try { await canc.cancelar(USER_A, { vendaId: cVenda.vendaId, motivo: "extra sem principal", canceladoPorUserId: USER_A }); }
    catch (e) { cMsg = msg(e); }
    const titC = await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id = ?", [cVenda.vendaId]);
    const stC = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [cVenda.vendaId]))[0]?.status;
    reg({
      id: "C",
      nome: "Cancelamento com título extra sem principal",
      ok: cMsg.includes(MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO) && stC === "concluido"
        && titC.length === 1 && titC[0]?.estado === "ativo" && await statusAnimal(cAnim) === "vendido",
      detalhe: { cMsg, stC, titC },
    });

    const dAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B2-D01");
    const dVenda = await conf.confirmar(USER_A, cabeca("ven-3e9b2-d", dAnim));
    const rD = await Promise.allSettled([
      canc.cancelar(USER_A, { vendaId: dVenda.vendaId, motivo: "corrida rec", canceladoPorUserId: USER_A }),
      nucleo2.criarRecebimento(USER_A, {
        contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
        idempotencyKey: "rec-3e9b2-d", alocacoes: [{ parcelaId: await parcela(dVenda.tituloId), principalLiquidado: 1500 }],
      }),
    ]);
    const dCanc = settled(rD[0]!); const dRec = settled(rD[1]!);
    const titD = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [dVenda.tituloId]))[0]?.estado;
    const efD = await efetiva(dVenda.tituloId);
    const recusaRec = !dRec.ok && dRec.erro.includes(MSG_FIN_TITULO_CANCELADO);
    const recusaCanc = !dCanc.ok && dCanc.erro.includes(MSG_VENDA_CANCELAR_COM_RECEBIMENTO);
    reg({
      id: "D",
      nome: "Cancelamento concorrente com recebimento",
      ok: !(titD === "cancelado" && efD > 0) && (dCanc.ok || dRec.ok) && (recusaCanc || recusaRec || (dCanc.ok && efD === 0))
        && !dCanc.sqlCru && !dRec.sqlCru,
      detalhe: { dCanc, dRec, titD, efD },
    });

    const eAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B2-E01");
    const eVenda = await conf.confirmar(USER_A, cabeca("ven-3e9b2-e", eAnim));
    const recE = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: "rec-3e9b2-e", alocacoes: [{ parcelaId: await parcela(eVenda.tituloId), principalLiquidado: 1500 }],
    });
    const rE = await Promise.allSettled([
      nucleo2.estornarLiquidacao(USER_A, { liquidacaoId: recE.id, idempotencyKey: "est-3e9b2-e", dataLiquidacao: "2026-10-24" }),
      canc.cancelar(USER_A, { vendaId: eVenda.vendaId, motivo: "corrida est", canceladoPorUserId: USER_A }),
    ]);
    const eEst = settled(rE[0]!); const eCanc = settled(rE[1]!);
    const titE = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [eVenda.tituloId]))[0]?.estado;
    const efE = await efetiva(eVenda.tituloId);
    reg({
      id: "E",
      nome: "Cancelamento concorrente com estorno",
      ok: !(titE === "cancelado" && efE > 0) && (eEst.ok || eCanc.ok) && !eEst.sqlCru && !eCanc.sqlCru,
      detalhe: { eEst, eCanc, titE, efE },
    });

    const fAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B2-F01");
    const fVenda = await conf.confirmar(USER_A, cabeca("ven-3e9b2-f", fAnim));
    const rF = await Promise.allSettled([
      canc.cancelar(USER_A, { vendaId: fVenda.vendaId, motivo: "primeiro", canceladoPorUserId: USER_A }),
      canc2.cancelar(USER_A, { vendaId: fVenda.vendaId, motivo: "segundo", canceladoPorUserId: USER_A }),
    ]);
    const f1 = settled(rF[0]!); const f2 = settled(rF[1]!);
    const stF = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [fVenda.vendaId]))[0]?.status;
    const umOk = [f1, f2].filter(x => x.ok).length === 1;
    const outroJa = [f1, f2].some(x => !x.ok && x.erro.includes(MSG_VENDA_CANCELAR_JA_CANCELADA));
    reg({
      id: "F",
      nome: "Dois cancelamentos simultâneos",
      ok: umOk && outroJa && stF === "cancelado" && !f1.sqlCru && !f2.sqlCru,
      detalhe: { f1, f2, stF },
    });

    const gAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B2-G01");
    const gVenda = await vendaHistorica(pool, { userId: USER_A, fazendaId: fazendaA, pessoaId: pessoaA, animalId: gAnim, brinco: "3E9B2-G01" });
    const gCanc = await canc.cancelar(USER_A, { vendaId: gVenda, motivo: "histórico", canceladoPorUserId: USER_A });
    const titG = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id = ?", [gVenda]))[0]?.n);
    reg({
      id: "G",
      nome: "Venda histórica sem título",
      ok: gCanc.vendaAntigaSemTitulo === true && titG === 0 && await statusAnimal(gAnim) === "ativo",
      detalhe: { gCanc, titG },
    });

    const hAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B2-H01");
    const hVenda = await vendaHistorica(pool, {
      userId: USER_A, fazendaId: fazendaA, pessoaId: pessoaA, animalId: hAnim, brinco: "3E9B2-H01", chave: "ven-3e9b2-h-semtit",
    });
    let hMsg = "";
    try { await canc.cancelar(USER_A, { vendaId: hVenda, motivo: "ven- sem título", canceladoPorUserId: USER_A }); }
    catch (e) { hMsg = msg(e); }
    const stH = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [hVenda]))[0]?.status;
    reg({
      id: "H",
      nome: "Venda com chave ven- sem título",
      ok: hMsg.includes(MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO) && stH === "concluido" && await statusAnimal(hAnim) === "vendido",
      detalhe: { hMsg, stH },
    });

    const iAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B2-I01");
    const iVenda = await conf.confirmar(USER_A, cabeca("ven-3e9b2-i", iAnim));
    hold = await mysql.createConnection({ host: cred.host, port: cred.port, user: cred.user, password: cred.password, database: TESTE });
    waiter = await mysql.createConnection({ host: cred.host, port: cred.port, user: cred.user, password: cred.password, database: TESTE });
    const [holdDb] = await q<{ db: string }[]>(hold, "SELECT DATABASE() db");
    const [waitDb] = await q<{ db: string }[]>(waiter, "SELECT DATABASE() db");
    assertTeste(holdDb.db);
    assertTeste(waitDb.db);
    await waiter.query("SET SESSION innodb_lock_wait_timeout = 2");
    await hold.beginTransaction();
    await hold.query(
      "SELECT id FROM financeiro_titulos WHERE user_id = ? AND origem_tipo = 'venda_animais' AND origem_id = ? ORDER BY id FOR UPDATE",
      [USER_A, iVenda.vendaId],
    );
    let iMsg = "";
    try {
      await waiter.query(
        `INSERT INTO financeiro_titulos (user_id, tipo, estado, condicao_status, pessoa_id, contraparte_nome_snapshot, fazenda_origem_id, origem_tipo, origem_id, origem_item_chave, descricao, data_competencia, valor_original)
         SELECT user_id, tipo, estado, condicao_status, pessoa_id, contraparte_nome_snapshot, fazenda_origem_id, origem_tipo, origem_id, 'item-corrida', descricao, data_competencia, valor_original
         FROM financeiro_titulos WHERE id = ?`,
        [iVenda.tituloId],
      );
    } catch (e) { iMsg = msg(e); }
    await hold.rollback();
    const titI = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id = ?", [iVenda.vendaId]))[0]?.n);
    const iCanc = await canc.cancelar(USER_A, { vendaId: iVenda.vendaId, motivo: "após corrida título", canceladoPorUserId: USER_A });
    reg({
      id: "I",
      nome: "Alteração concorrente de títulos (FOR UPDATE / 1205)",
      ok: isLockWait(iMsg) && titI === 1 && iCanc.tituloCancelado === true,
      detalhe: { iMsg, titI, iCanc },
    });

    const jAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9B2-J01");
    const jVenda = await conf.confirmar(USER_A, cabeca("ven-3e9b2-j", jAnim));
    await hold.beginTransaction();
    await hold.query("SELECT id FROM animais WHERE id = ? AND userId = ? ORDER BY id FOR UPDATE", [jAnim, USER_A]);
    await hold.query("SELECT id FROM animal_baixas WHERE animalId = ? AND status = 'ativa' ORDER BY id FOR UPDATE", [jAnim]);
    let jMsg = "";
    try {
      await waiter.query("UPDATE animais SET status = 'ativo' WHERE id = ?", [jAnim]);
    } catch (e) { jMsg = msg(e); }
    await hold.rollback();
    const jCanc = await canc.cancelar(USER_A, { vendaId: jVenda.vendaId, motivo: "após lock animal", canceladoPorUserId: USER_A });
    reg({
      id: "J",
      nome: "Animais e baixas concorrentes (FOR UPDATE / 1205)",
      ok: isLockWait(jMsg) && jCanc.success && await statusAnimal(jAnim) === "ativo",
      detalhe: { jMsg, jCanc },
    });

    const orfaoTit = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM financeiro_titulos t
      LEFT JOIN vendas v ON v.id = t.origem_id
      WHERE t.user_id = ? AND t.origem_tipo = 'venda_animais' AND t.origem_item_chave = 'principal' AND v.id IS NULL`, [USER_A]))[0]?.n);
    const cancEfetiva = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM financeiro_titulos t
      WHERE t.estado = 'cancelado' AND t.origem_tipo = 'venda_animais'
        AND t.origem_id IN (SELECT id FROM vendas WHERE idempotency_key LIKE 'ven-3e9b2%')
        AND EXISTS (
          SELECT 1 FROM financeiro_parcelas p JOIN financeiro_liquidacao_alocacoes a ON a.parcela_id = p.id
          JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id
          WHERE p.titulo_id = t.id AND l.tipo IN ('recebimento','pagamento')
            AND NOT EXISTS (SELECT 1 FROM financeiro_liquidacoes e WHERE e.liquidacao_original_id = l.id)
        )`))[0]?.n);
    const extraCancelado = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM financeiro_titulos
      WHERE origem_item_chave LIKE 'item-%' AND estado = 'cancelado' AND origem_id IN (SELECT id FROM vendas WHERE idempotency_key LIKE 'ven-3e9b2%')`))[0]?.n);
    const vendasAnterioresDepois = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM vendas WHERE ${likeAnteriores}`, [...PREFIXOS_ANTERIORES]))[0]?.n);

    reg({
      id: "INV",
      nome: "Invariantes 3E.9B.2",
      ok: orfaoTit === 0 && cancEfetiva === 0 && extraCancelado === 0 && vendasAnterioresDepois === vendasAnteriores,
      detalhe: { orfaoTit, cancEfetiva, extraCancelado, vendasAnteriores, vendasAnterioresDepois },
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
      detalhe: { dbFinal: dbFinal.db },
    });
  } catch (e) {
    reg({ id: "ABORT", nome: "Execução", ok: false, detalhe: {}, erro: msg(e) });
  } finally {
    try { if (hold) await hold.rollback(); } catch { /* ignore */ }
    if (hold) await hold.end();
    if (waiter) await waiter.end();
    if (pool) await pool.end();
    if (pool2) await pool2.end();
    await admin.end();
  }

  const ok = problemas.length === 0;
  console.log(JSON.stringify({
    banco: TESTE,
    parecer: ok ? "APTO — cancelamento endurecido" : "NECESSITA CORREÇÕES",
    problemas,
    cenarios: cenarios.map(c => ({ id: c.id, nome: c.nome, ok: c.ok, detalhe: c.detalhe, erro: c.erro })),
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
