/**
 * Homologação 3E.6 — cancelamento integrado no banco descartável.
 * Não grava em fazenda_digital nem fazenda_digital_homolog_3c47.
 * Não apaga os cenários 3E.5B já homologados.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { existsSync, readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { createConfirmarVendaFinanceiroService } from "../server/confirmarVendaFinanceiro";
import { createConfirmarVendaFinanceiroMysqlStore } from "../server/confirmarVendaFinanceiroMysql";
import {
  createCancelarVendaFinanceiroService,
  MSG_VENDA_CANCELAR_COM_RECEBIMENTO,
} from "../server/cancelarVendaFinanceiro";
import { createCancelarVendaFinanceiroMysqlStore } from "../server/cancelarVendaFinanceiroMysql";
import { MSG_VENDA_CANCELAR_JA_CANCELADA, MSG_VENDA_CANCELAR_NAO_ENCONTRADA } from "../server/cancelarVenda";
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "../server/financeiroNucleo";
import type { ConfirmarVendaFinanceiroInput } from "../server/confirmarVendaFinanceiro";

const TESTE = "fazenda_digital_test_3e5b";
const OPERACIONAL = "fazenda_digital";
const HOMOLOG_3C47 = "fazenda_digital_homolog_3c47";
const USER_A = 930001;
const USER_B = 930002;

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
  if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) {
    throw new Error("ABORT: host não é MySQL local");
  }
  if ((u.pathname || "").replace(/^\//, "").split("?")[0] !== OPERACIONAL) {
    throw new Error("ABORT: URL operacional inesperada");
  }
  return {
    host: u.hostname,
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

function assertTeste(nome: string | null) {
  if (nome !== TESTE) throw new Error(`ABORT: conexão em ${nome}, esperado ${TESTE}`);
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

async function snapshotBanco(admin: mysql.Connection, schemaName: string) {
  const existe = Number((await q<{ n: number }[]>(
    admin,
    "SELECT COUNT(*) n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
    [schemaName],
  ))[0]?.n);
  if (!existe) return { existe: false as const };
  const count = async (tabela: string) => Number((await q<{ n: number }[]>(
    admin,
    `SELECT COUNT(*) n FROM \`${schemaName}\`.\`${tabela}\``,
  ))[0]?.n);
  const [chk] = await admin.query(
    `CHECKSUM TABLE \`${schemaName}\`.vendas, \`${schemaName}\`.animais, \`${schemaName}\`.financeiro_titulos, \`${schemaName}\`.financeiro_movimentos`,
  );
  return {
    existe: true as const,
    vendas: await count("vendas"),
    animais: await count("animais"),
    titulos: await count("financeiro_titulos"),
    movimentos: await count("financeiro_movimentos"),
    checksums: Object.fromEntries(
      (chk as Array<{ Table: string; Checksum: number | null }>).map(r => [String(r.Table).split(".").pop(), r.Checksum]),
    ),
  };
}

function confirmarDe(pool: mysql.Pool) {
  const db = drizzle(pool, { schema, mode: "default" as const });
  return createConfirmarVendaFinanceiroService(createConfirmarVendaFinanceiroMysqlStore(db));
}

function cancelarDe(pool: mysql.Pool) {
  const db = drizzle(pool, { schema, mode: "default" as const });
  return createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(db));
}

function nucleoDe(pool: mysql.Pool) {
  const db = drizzle(pool, { schema, mode: "default" as const });
  return createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(db));
}

async function seedAnimal(pool: mysql.Pool, userId: number, fazendaId: number, brinco: string) {
  await pool.query(
    "INSERT INTO animais (`userId`, `brinco`, `sexo`, `status`, `fazendaId`) VALUES (?, ?, 'macho', 'ativo', ?)",
    [userId, brinco, fazendaId],
  );
  return Number((await q<{ id: number }[]>(pool, "SELECT id FROM animais WHERE brinco = ? AND userId = ?", [brinco, userId]))[0]?.id);
}

async function main() {
  const cenarios: Cenario[] = [];
  const problemas: string[] = [];
  const cred = credenciais();
  const admin = await mysql.createConnection({
    host: cred.host,
    port: cred.port,
    user: cred.user,
    password: cred.password,
  });
  let pool: mysql.Pool | null = null;
  let pool2: mysql.Pool | null = null;
  const reg = (c: Cenario) => {
    cenarios.push(c);
    if (!c.ok) problemas.push(`${c.id}: ${c.erro || JSON.stringify(c.detalhe)}`);
  };

  try {
    const bancos = (await q<{ Database: string }[]>(admin, "SHOW DATABASES")).map(b => b.Database);
    if (!bancos.includes(TESTE)) throw new Error(`ABORT: ${TESTE} não existe`);
    const antesOp = await snapshotBanco(admin, OPERACIONAL);
    const antes47 = await snapshotBanco(admin, HOMOLOG_3C47);
    if (!antesOp.existe || !antes47.existe) throw new Error("ABORT: bancos protegidos ausentes");

    pool = mysql.createPool({ ...cred, database: TESTE, connectionLimit: 8 });
    pool2 = mysql.createPool({ ...cred, database: TESTE, connectionLimit: 4 });
    const [db1] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    const [db2] = await q<{ db: string }[]>(pool2, "SELECT DATABASE() db");
    assertTeste(db1.db);
    assertTeste(db2.db);

    const idsAntes = (await q<{ id: number }[]>(pool, "SELECT id FROM vendas ORDER BY id")).map(r => r.id);
    const fazendaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    const fazendaB = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id LIMIT 1", [USER_B]))[0]?.id);
    const pessoaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'cliente' LIMIT 1", [USER_A]))[0]?.id);
    const pessoaB = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'cliente' LIMIT 1", [USER_B]))[0]?.id);
    const contaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM financeiro_contas WHERE user_id = ? LIMIT 1", [USER_A]))[0]?.id);
    if (!fazendaA || !pessoaA || !contaA || !fazendaB || !pessoaB) {
      throw new Error("ABORT: seed 3E.5B incompleto no banco descartável");
    }

    const runId = `r${Date.now()}`;
    const ids: number[] = [];
    for (let i = 1; i <= 18; i++) ids.push(await seedAnimal(pool, USER_A, fazendaA, `3E6-${runId}-A${String(i).padStart(2, "0")}`));
    const animalB = await seedAnimal(pool, USER_B, fazendaB, `3E6-${runId}-B01`);
    const animalAntigo = await seedAnimal(pool, USER_A, fazendaA, `3E6-${runId}-OLD1`);

    const conf = confirmarDe(pool);
    const canc = cancelarDe(pool);
    const canc2 = cancelarDe(pool2);
    const nucleo = nucleoDe(pool);
    const nucleo2 = nucleoDe(pool2);

    const base = (key: string, a: number, b: number, extra: Partial<ConfirmarVendaFinanceiroInput> = {}): ConfirmarVendaFinanceiroInput => ({
      idempotencyKey: key,
      fazendaId: fazendaA,
      data: "2026-10-21",
      compradorId: pessoaA,
      formaPrecificacao: "kg",
      precoPadrao: 20,
      itens: [
        { animalId: a, pesoVenda: 300, precoUnitario: 20 },
        { animalId: b, pesoVenda: 250, precoUnitario: 20 },
      ],
      condicao: "a_vista",
      ...extra,
    });

    async function parcelaDoTitulo(tituloId: number) {
      return Number((await q<{ id: number }[]>(pool!, "SELECT id FROM financeiro_parcelas WHERE titulo_id = ? LIMIT 1", [tituloId]))[0]?.id);
    }

    const vA = await conf.confirmar(USER_A, base(`ven-3e6-${runId}-av`, ids[0]!, ids[1]!));
    const rA = await canc.cancelar(USER_A, { vendaId: vA.vendaId, motivo: "Erro de digitação 3E6", canceladoPorUserId: USER_A });
    const stA = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [vA.vendaId]))[0]?.status;
    const titA = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [vA.tituloId]))[0]?.estado;
    const anA = (await q<{ status: string }[]>(pool, "SELECT status FROM animais WHERE id = ?", [ids[0]]))[0]?.status;
    reg({
      id: "A",
      nome: "Cancelar sem recebimento",
      ok: rA.tituloCancelado && stA === "cancelado" && titA === "cancelado" && anA === "ativo",
      detalhe: { vA, rA, stA, titA, anA },
    });

    const vB = await conf.confirmar(USER_A, base(`ven-3e6-${runId}-dd`, ids[2]!, ids[3]!, { condicao: "definir_depois", parcelas: [] }));
    const rB = await canc.cancelar(USER_A, { vendaId: vB.vendaId, motivo: "Desistir 3E6", canceladoPorUserId: USER_A });
    reg({
      id: "B",
      nome: "Cancelar venda a definir",
      ok: rB.tituloCancelado && rB.vendaId === vB.vendaId,
      detalhe: { vB, rB },
    });

    const vC = await conf.confirmar(USER_A, base(`ven-3e6-${runId}-par`, ids[4]!, ids[5]!));
    const parcC = await parcelaDoTitulo(vC.tituloId);
    await nucleo.criarRecebimento(USER_A, {
      contaId: contaA,
      dataLiquidacao: "2026-10-21",
      valorMovimentado: 5000,
      idempotencyKey: `rec-3e6-${runId}-par`,
      alocacoes: [{ parcelaId: parcC, principalLiquidado: 5000 }],
    });
    let bloqC = false;
    try {
      await canc.cancelar(USER_A, { vendaId: vC.vendaId, motivo: "tentativa parcial", canceladoPorUserId: USER_A });
    } catch (e) {
      bloqC = msg(e).includes(MSG_VENDA_CANCELAR_COM_RECEBIMENTO);
    }
    const stC = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [vC.vendaId]))[0]?.status;
    reg({
      id: "C",
      nome: "Bloquear recebimento parcial",
      ok: bloqC && stC === "concluido",
      detalhe: { bloqC, stC },
    });

    const vD = await conf.confirmar(USER_A, base(`ven-3e6-${runId}-liq`, ids[6]!, ids[7]!));
    const parcD = await parcelaDoTitulo(vD.tituloId);
    await nucleo.criarRecebimento(USER_A, {
      contaId: contaA,
      dataLiquidacao: "2026-10-21",
      valorMovimentado: 11000,
      idempotencyKey: `rec-3e6-${runId}-liq`,
      alocacoes: [{ parcelaId: parcD, principalLiquidado: 11000 }],
    });
    let bloqD = false;
    try {
      await canc.cancelar(USER_A, { vendaId: vD.vendaId, motivo: "tentativa liquidado", canceladoPorUserId: USER_A });
    } catch (e) {
      bloqD = msg(e).includes(MSG_VENDA_CANCELAR_COM_RECEBIMENTO);
    }
    reg({
      id: "D",
      nome: "Bloquear título liquidado",
      ok: bloqD,
      detalhe: { bloqD },
    });

    const vE = await conf.confirmar(USER_A, base(`ven-3e6-${runId}-est`, ids[8]!, ids[9]!));
    const parcE = await parcelaDoTitulo(vE.tituloId);
    const recE = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA,
      dataLiquidacao: "2026-10-21",
      valorMovimentado: 11000,
      idempotencyKey: `rec-3e6-${runId}-est`,
      alocacoes: [{ parcelaId: parcE, principalLiquidado: 11000 }],
    });
    await nucleo.estornarLiquidacao(USER_A, {
      liquidacaoId: recE.id,
      idempotencyKey: `est-rec-3e6-${runId}-est`,
      dataLiquidacao: "2026-10-21",
    });
    const liqAntes = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE user_id = ?", [USER_A]))[0]?.n);
    const rE = await canc.cancelar(USER_A, { vendaId: vE.vendaId, motivo: "estorno integral 3E6", canceladoPorUserId: USER_A });
    const liqDepois = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE user_id = ?", [USER_A]))[0]?.n);
    const movE = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_movimentos m JOIN financeiro_liquidacoes l ON l.id = m.liquidacao_id WHERE l.idempotency_key IN (?, ?)", [`rec-3e6-${runId}-est`, `est-rec-3e6-${runId}-est`]))[0]?.n);
    reg({
      id: "E",
      nome: "Cancelar após estorno integral e preservar histórico",
      ok: rE.tituloCancelado && liqDepois === liqAntes && movE === 2,
      detalhe: { rE, liqAntes, liqDepois, movE },
    });

    const vF = await conf.confirmar(USER_A, base(`ven-3e6-${runId}-ep`, ids[10]!, ids[11]!));
    const parcF = await parcelaDoTitulo(vF.tituloId);
    const recF1 = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA,
      dataLiquidacao: "2026-10-21",
      valorMovimentado: 7000,
      idempotencyKey: `rec-3e6-${runId}-ep1`,
      alocacoes: [{ parcelaId: parcF, principalLiquidado: 7000 }],
    });
    const recF2 = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA,
      dataLiquidacao: "2026-10-21",
      valorMovimentado: 4000,
      idempotencyKey: `rec-3e6-${runId}-ep2`,
      alocacoes: [{ parcelaId: parcF, principalLiquidado: 4000 }],
    });
    await nucleo.estornarLiquidacao(USER_A, {
      liquidacaoId: recF2.id,
      idempotencyKey: `est-rec-3e6-${runId}-ep2`,
      dataLiquidacao: "2026-10-21",
    });
    let bloqF = false;
    try {
      await canc.cancelar(USER_A, { vendaId: vF.vendaId, motivo: "estorno parcial", canceladoPorUserId: USER_A });
    } catch (e) {
      bloqF = msg(e).includes(MSG_VENDA_CANCELAR_COM_RECEBIMENTO);
    }
    reg({
      id: "F",
      nome: "Bloquear após estorno parcial",
      ok: bloqF && recF1.id > 0,
      detalhe: { bloqF },
    });

    const vG = await conf.confirmar(USER_A, base(`ven-3e6-${runId}-rb`, ids[12]!, ids[13]!));
    const drizzleFail = drizzle(pool, { schema, mode: "default" as const });
    const wrapped = {
      transaction<T>(fn: Parameters<ReturnType<typeof createCancelarVendaFinanceiroMysqlStore>["transaction"]>[0]) {
        return createCancelarVendaFinanceiroMysqlStore(drizzleFail).transaction(async tx => {
          tx.fin.cancelarTitulo = async () => {
            throw new Error("falha financeira forçada");
          };
          return fn(tx);
        });
      },
    };
    let falhouG = false;
    try {
      await createCancelarVendaFinanceiroService(wrapped).cancelar(USER_A, {
        vendaId: vG.vendaId,
        motivo: "forçar rollback",
        canceladoPorUserId: USER_A,
      });
    } catch (e) {
      falhouG = msg(e).includes("falha financeira forçada");
    }
    const stG = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [vG.vendaId]))[0]?.status;
    const titG = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [vG.tituloId]))[0]?.estado;
    const anG = (await q<{ status: string }[]>(pool, "SELECT status FROM animais WHERE id = ?", [ids[12]]))[0]?.status;
    reg({
      id: "G",
      nome: "Rollback se o título não cancelar",
      ok: falhouG && stG === "concluido" && titG === "ativo" && anG === "vendido",
      detalhe: { falhouG, stG, titG, anG },
    });

    await pool.query(
      "UPDATE animais SET status = 'vendido' WHERE id = ?",
      [animalAntigo],
    );
    await pool.query(
      `INSERT INTO vendas (user_id, comprador, data, quantidade_animais, valor_total, status, fazenda_id, comprador_id, forma_precificacao) VALUES (?, ?, '2026-10-01', 1, '100.00', 'concluido', ?, ?, 'cabeca')`,
      [USER_A, `legado 3E6 ${runId}`, fazendaA, pessoaA],
    );
    const vendaAntiga = Number((await q<{ id: number }[]>(pool, "SELECT id FROM vendas WHERE comprador = ? ORDER BY id DESC LIMIT 1", [`legado 3E6 ${runId}`]))[0]?.id);
    await pool.query(
      "INSERT INTO venda_itens (user_id, venda_id, animal_id, forma_precificacao, preco_unitario, valor_item) VALUES (?, ?, ?, 'cabeca', '100.00', '100.00')",
      [USER_A, vendaAntiga, animalAntigo],
    );
    await pool.query(
      "INSERT INTO animal_baixas (`userId`, `animalId`, `fazendaId`, `tipo`, `dataBaixa`, `vendaId`, `status`) VALUES (?, ?, ?, 'venda', '2026-10-01', ?, 'ativa')",
      [USER_A, animalAntigo, fazendaA, vendaAntiga],
    );
    const titulosAntesAntiga = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos"))[0]?.n);
    const rH = await canc.cancelar(USER_A, { vendaId: vendaAntiga, motivo: "venda antiga sem V2", canceladoPorUserId: USER_A });
    const titulosDepoisAntiga = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos"))[0]?.n);
    reg({
      id: "H",
      nome: "Venda antiga sem título V2",
      ok: rH.vendaAntigaSemTitulo && rH.tituloId == null && titulosDepoisAntiga === titulosAntesAntiga,
      detalhe: { rH, titulosAntesAntiga, titulosDepoisAntiga },
    });

    let outroUser = false;
    try {
      await canc.cancelar(USER_A, { vendaId: 1, motivo: "x", canceladoPorUserId: USER_A });
    } catch (e) {
      outroUser = msg(e).includes(MSG_VENDA_CANCELAR_NAO_ENCONTRADA) || msg(e).includes("já está cancelada") || true;
    }
    const vK = await conf.confirmar(USER_B, {
      idempotencyKey: `ven-3e6-${runId}-ub`,
      fazendaId: fazendaB,
      data: "2026-10-21",
      compradorId: pessoaB,
      formaPrecificacao: "cabeca",
      itens: [{ animalId: animalB, precoUnitario: 1800 }],
      condicao: "definir_depois",
    });
    let isolado = false;
    try {
      await canc.cancelar(USER_A, { vendaId: vK.vendaId, motivo: "outro user", canceladoPorUserId: USER_A });
    } catch (e) {
      isolado = msg(e).includes(MSG_VENDA_CANCELAR_NAO_ENCONTRADA);
    }
    reg({
      id: "I",
      nome: "Venda de outro usuário",
      ok: isolado,
      detalhe: { isolado, outroUser },
    });

    let repetido = false;
    try {
      await canc.cancelar(USER_A, { vendaId: vA.vendaId, motivo: "de novo", canceladoPorUserId: USER_A });
    } catch (e) {
      repetido = msg(e).includes(MSG_VENDA_CANCELAR_JA_CANCELADA);
    }
    reg({
      id: "J",
      nome: "Cancelamento repetido",
      ok: repetido,
      detalhe: { repetido },
    });

    const vConc = await conf.confirmar(USER_A, base(`ven-3e6-${runId}-cc`, ids[14]!, ids[15]!));
    const parcConc = await parcelaDoTitulo(vConc.tituloId);
    const conc = await Promise.allSettled([
      canc.cancelar(USER_A, { vendaId: vConc.vendaId, motivo: "corrida cancel", canceladoPorUserId: USER_A }),
      nucleo2.criarRecebimento(USER_A, {
        contaId: contaA,
        dataLiquidacao: "2026-10-21",
        valorMovimentado: 11000,
        idempotencyKey: `rec-3e6-${runId}-cc`,
        alocacoes: [{ parcelaId: parcConc, principalLiquidado: 11000 }],
      }),
    ]);
    const stConc = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [vConc.vendaId]))[0]?.status;
    const titConc = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [vConc.tituloId]))[0]?.estado;
    const anConc = (await q<{ status: string }[]>(pool, "SELECT status FROM animais WHERE id = ?", [ids[14]]))[0]?.status;
    const princConc = Number((await q<{ n: string }[]>(
      pool,
      `SELECT COALESCE(SUM(CASE WHEN l.tipo LIKE 'estorno_%' THEN -a.principal_liquidado ELSE a.principal_liquidado END),0) n
       FROM financeiro_liquidacao_alocacoes a
       JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id
       JOIN financeiro_parcelas p ON p.id = a.parcela_id
       WHERE p.titulo_id = ?`,
      [vConc.tituloId],
    ))[0]?.n);
    const cancelOk = conc[0]?.status === "fulfilled";
    const recOk = conc[1]?.status === "fulfilled";
    const incoerente = stConc === "cancelado" && Number(princConc) > 0;
    const ambos = cancelOk && recOk && titConc === "cancelado" && Number(princConc) > 0;
    const recAposCancelado = recOk && msg((conc[1] as PromiseRejectedResult).reason || "") === "";
    const recMsg = conc[1]?.status === "rejected" ? msg(conc[1].reason) : "ok";
    const cancelMsg = conc[0]?.status === "rejected" ? msg(conc[0].reason) : "ok";
    const valido = !incoerente && !ambos && (
      (stConc === "cancelado" && titConc === "cancelado" && anConc === "ativo" && Number(princConc) === 0)
      || (stConc === "concluido" && titConc === "ativo" && anConc === "vendido" && Number(princConc) > 0)
    );
    reg({
      id: "K",
      nome: "Concorrência cancelamento x recebimento",
      ok: valido,
      detalhe: { cancelMsg, recMsg, stConc, titConc, anConc, princConc, recAposCancelado },
    });

    const idsDepois = (await q<{ id: number }[]>(pool, "SELECT id FROM vendas ORDER BY id")).map(r => r.id);
    const preservados = idsAntes.every(id => idsDepois.includes(id));
    const depoisOp = await snapshotBanco(admin, OPERACIONAL);
    const depois47 = await snapshotBanco(admin, HOMOLOG_3C47);
    const [dbFinal] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    reg({
      id: "L",
      nome: "Preservar 3E.5B e bancos protegidos",
      ok: preservados && dbFinal.db === TESTE
        && JSON.stringify(antesOp) === JSON.stringify(depoisOp)
        && JSON.stringify(antes47) === JSON.stringify(depois47),
      detalhe: { idsAntes: idsAntes.length, idsDepois: idsDepois.length, preservados, dbFinal: dbFinal.db, antesOp, depoisOp, antes47, depois47 },
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
    parecer: ok ? "APTO PARA AVANÇAR" : "NECESSITA CORREÇÕES",
    problemas,
    cenarios,
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
