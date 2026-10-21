/**
 * Homologação 3C.4.6 — MySQL isolado. Não grava em fazenda_digital.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { existsSync, readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "../server/financeiroNucleo";
import {
  MSG_FIN_CONTA_INATIVA,
  MSG_FIN_OVERPAYMENT,
  MSG_FIN_TITULO_CANCELADO,
} from "../shared/financeiroNucleo";

const HOMOLOG = "fazenda_digital_homolog_3c46";
const OPERACIONAL = "fazenda_digital";
const USER_A = 910001;
const USER_B = 910002;
const TABELAS = [
  "pessoas",
  "fazendas",
  "financeiro_contas",
  "financeiro_categorias",
  "financeiro_centros_custo",
  "financeiro_titulos",
  "financeiro_parcelas",
  "financeiro_apropriacoes",
  "financeiro_liquidacoes",
  "financeiro_liquidacao_alocacoes",
  "financeiro_movimentos",
  "financeiro_transferencias",
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
  const host = u.hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("ABORT: host não é MySQL local");
  if ((u.pathname || "").replace(/^\//, "").split("?")[0] !== OPERACIONAL) {
    throw new Error("ABORT: URL operacional inesperada");
  }
  return {
    host,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    databaseNaUrl: (u.pathname || "").replace(/^\//, "").split("?")[0],
  };
}

async function q<T extends mysql.RowDataPacket[]>(conn: mysql.Connection | mysql.Pool, sqlText: string, params: unknown[] = []) {
  const [rows] = await conn.query(sqlText, params);
  return rows as T;
}

function assertHomolog(nome: string | null) {
  if (nome !== HOMOLOG) throw new Error(`ABORT: conexão em ${nome}, esperado ${HOMOLOG}`);
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

async function snapshotOperacional(admin: mysql.Connection) {
  const titulos = await q<{ id: number; estado: string; condicao_status: string; valor_original: string }[]>(
    admin,
    `SELECT id, estado, condicao_status, valor_original FROM \`${OPERACIONAL}\`.financeiro_titulos WHERE id IN (80,84) ORDER BY id`,
  );
  const contagens = {
    titulos: Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.financeiro_titulos`))[0]?.n),
    parcelas: Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.financeiro_parcelas`))[0]?.n),
    liquidacoes: Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.financeiro_liquidacoes`))[0]?.n),
    movimentos: Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.financeiro_movimentos`))[0]?.n),
    contasV2: Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.financeiro_contas`))[0]?.n),
    legado: Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.contas_financeiras`))[0]?.n),
  };
  const [chk] = await admin.query(
    `CHECKSUM TABLE \`${OPERACIONAL}\`.financeiro_titulos, \`${OPERACIONAL}\`.financeiro_parcelas, \`${OPERACIONAL}\`.financeiro_liquidacoes, \`${OPERACIONAL}\`.financeiro_movimentos, \`${OPERACIONAL}\`.financeiro_contas, \`${OPERACIONAL}\`.contas_financeiras`,
  );
  return {
    titulos80_84: titulos,
    contagens,
    checksums: Object.fromEntries(
      (chk as Array<{ Table: string; Checksum: number | null }>).map(r => [String(r.Table).split(".").pop(), r.Checksum]),
    ),
  };
}

function svcDe(pool: mysql.Pool) {
  const db = drizzle(pool, { schema, mode: "default" as const });
  return createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(db));
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
    const bancos = await q<{ Database: string }[]>(admin, "SHOW DATABASES");
    const nomesBancos = bancos.map(b => b.Database);
    const antes = await snapshotOperacional(admin);
    if (antes.titulos80_84.map(t => t.id).join(",") !== "80,84") {
      throw new Error("ABORT: títulos 80/84 não encontrados no operacional — isolamento não conferível");
    }

    await admin.query(`DROP DATABASE IF EXISTS \`${HOMOLOG}\``);
    await admin.query(`CREATE DATABASE \`${HOMOLOG}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    for (const tabela of TABELAS) {
      const existe = await q<{ n: number }[]>(
        admin,
        "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
        [OPERACIONAL, tabela],
      );
      if (Number(existe[0]?.n) !== 1) throw new Error(`Tabela operacional ${tabela} ausente`);
      await admin.query(`CREATE TABLE \`${HOMOLOG}\`.\`${tabela}\` LIKE \`${OPERACIONAL}\`.\`${tabela}\``);
      const linhas = Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${HOMOLOG}\`.\`${tabela}\``))[0]?.n);
      if (linhas !== 0) throw new Error(`Homolog ${tabela} não está vazio`);
    }

    const poolOpts = {
      host: cred.host,
      port: cred.port,
      user: cred.user,
      password: cred.password,
      database: HOMOLOG,
    };
    pool = mysql.createPool({ ...poolOpts, connectionLimit: 8 });
    pool2 = mysql.createPool({ ...poolOpts, connectionLimit: 4 });
    const [db1] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    const [db2] = await q<{ db: string }[]>(pool2, "SELECT DATABASE() db");
    assertHomolog(db1.db);
    assertHomolog(db2.db);

    await pool.query(
      "INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Fornecedor Homolog A', 'fornecedor', 1), (?, 'Fornecedor Homolog B', 'fornecedor', 1)",
      [USER_A, USER_B],
    );
    const pessoaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? LIMIT 1", [USER_A]))[0]?.id);
    const svc = svcDe(pool);
    const svc2 = svcDe(pool2);

    const conta = await svc.criarContaFinanceira(USER_A, {
      nome: "Caixa homolog 3C.4.6",
      tipo: "caixa",
      saldoAbertura: 10000,
      dataSaldoAbertura: "2026-01-01",
    });
    const contaDet = await svc.obterConta(USER_A, conta.id);
    reg({
      id: "A",
      nome: "Cadastro de conta financeira V2",
      ok: conta.id > 0 && Number(contaDet.saldoAtual) === 10000 && contaDet.ativa === true,
      detalhe: { contaId: conta.id, saldoAtual: contaDet.saldoAtual },
    });

    const tUnico = await svc.criarTitulo(USER_A, {
      tipo: "pagar",
      pessoaId: pessoaA,
      descricao: "Homolog único",
      dataCompetencia: "2026-10-01",
      valorOriginal: 300,
    });
    await svc.definirParcelas(USER_A, tUnico.id, [{ numero: 1, vencimento: "2026-11-10", valorOriginal: 300 }]);
    const dUnico = await svc.detalheTitulo(USER_A, tUnico.id);
    reg({
      id: "B",
      nome: "Definição de pagamento único",
      ok: dUnico.condicaoStatus === "definida" && dUnico.parcelas.length === 1 && Number(dUnico.parcelas[0]!.valorOriginal) === 300,
      detalhe: { tituloId: tUnico.id, parcelas: dUnico.parcelas.length, condicao: dUnico.condicaoStatus },
    });

    const tParc = await svc.criarTitulo(USER_A, {
      tipo: "pagar",
      pessoaId: pessoaA,
      descricao: "Homolog parcelado",
      dataCompetencia: "2026-10-01",
      valorOriginal: 100.01,
    });
    await svc.definirParcelas(USER_A, tParc.id, [
      { numero: 1, vencimento: "2026-11-01", valorOriginal: 50 },
      { numero: 2, vencimento: "2026-12-01", valorOriginal: 50.01 },
    ]);
    const dParc = await svc.detalheTitulo(USER_A, tParc.id);
    reg({
      id: "C",
      nome: "Definição de múltiplas parcelas",
      ok: dParc.parcelas.length === 2 && Number(dParc.parcelas[0]!.valorOriginal) === 50 && Number(dParc.parcelas[1]!.valorOriginal) === 50.01,
      detalhe: { tituloId: tParc.id, valores: dParc.parcelas.map(p => p.valorOriginal) },
    });

    const pagInt = await svc.criarPagamento(USER_A, {
      contaId: conta.id,
      dataLiquidacao: "2026-10-20",
      valorMovimentado: 300,
      idempotencyKey: "h3c46-integral",
      alocacoes: [{ parcelaId: dUnico.parcelas[0]!.id, principalLiquidado: 300 }],
    });
    const dUnicoPos = await svc.detalheTitulo(USER_A, tUnico.id);
    reg({
      id: "D",
      nome: "Pagamento integral",
      ok: pagInt.idempotente === false && dUnicoPos.parcelas[0]!.quitada === true && Number(dUnicoPos.parcelas[0]!.saldoPrincipal) === 0,
      detalhe: { liquidacaoId: pagInt.id, quitada: dUnicoPos.parcelas[0]!.quitada, saldo: dUnicoPos.parcelas[0]!.saldoPrincipal },
    });

    const pagPar = await svc.criarPagamento(USER_A, {
      contaId: conta.id,
      dataLiquidacao: "2026-10-20",
      valorMovimentado: 20,
      idempotencyKey: "h3c46-parcial",
      alocacoes: [{ parcelaId: dParc.parcelas[0]!.id, principalLiquidado: 20 }],
    });
    const dParc1 = await svc.detalheTitulo(USER_A, tParc.id);
    reg({
      id: "E",
      nome: "Pagamento parcial",
      ok: Number(dParc1.parcelas[0]!.saldoPrincipal) === 30 && dParc1.parcelas[0]!.quitada === false,
      detalhe: { liquidacaoId: pagPar.id, saldo: dParc1.parcelas[0]!.saldoPrincipal },
    });

    await svc.criarPagamento(USER_A, {
      contaId: conta.id,
      dataLiquidacao: "2026-10-21",
      valorMovimentado: 10,
      idempotencyKey: "h3c46-parcial-2",
      alocacoes: [{ parcelaId: dParc.parcelas[0]!.id, principalLiquidado: 10 }],
    });
    const dParc2 = await svc.detalheTitulo(USER_A, tParc.id);
    reg({
      id: "F",
      nome: "Múltiplos pagamentos na mesma parcela",
      ok: Number(dParc2.parcelas[0]!.saldoPrincipal) === 20 && Number(dParc2.parcelas[0]!.principalLiquidado) === 30,
      detalhe: { saldo: dParc2.parcelas[0]!.saldoPrincipal, pago: dParc2.parcelas[0]!.principalLiquidado },
    });

    reg({
      id: "G",
      nome: "Atualização do saldo da parcela",
      ok: Number(dParc2.parcelas[0]!.saldoPrincipal) === 20,
      detalhe: { saldoOficial: dParc2.parcelas[0]!.saldoPrincipal },
    });

    const contaPos = await svc.obterConta(USER_A, conta.id);
    reg({
      id: "H",
      nome: "Atualização do saldo da conta",
      ok: Number(contaPos.saldoAtual) === 9670,
      detalhe: { saldoAtual: contaPos.saldoAtual, esperado: 9670 },
    });

    const histUnico = await svc.historicoPagamentosTitulo(USER_A, tUnico.id);
    const histParc = await svc.historicoPagamentosTitulo(USER_A, tParc.id);
    const valoresParc = histParc.eventos.map(e => e.valorAlocadoNesteTitulo).sort((a, b) => a - b);
    reg({
      id: "I",
      nome: "Histórico oficial dos pagamentos",
      ok: histUnico.eventos.length === 1 && histParc.eventos.length === 2
        && histUnico.eventos[0]!.valorAlocadoNesteTitulo === 300
        && valoresParc.join(",") === "10,20",
      detalhe: { unico: histUnico.eventos.length, parcelado: histParc.eventos.length, valoresParc },
    });

    let jOk = false;
    let jMsg = "";
    try {
      await svc.criarPagamento(USER_A, {
        contaId: conta.id,
        dataLiquidacao: "2026-10-22",
        valorMovimentado: 1,
        idempotencyKey: "h3c46-quitada",
        alocacoes: [{ parcelaId: dUnico.parcelas[0]!.id, principalLiquidado: 1 }],
      });
    } catch (e) {
      jMsg = msg(e);
      jOk = jMsg.includes(MSG_FIN_OVERPAYMENT);
    }
    reg({ id: "J", nome: "Pagamento de parcela quitada", ok: jOk, detalhe: { mensagem: jMsg } });

    let kOk = false;
    let kMsg = "";
    try {
      await svc.criarPagamento(USER_A, {
        contaId: conta.id,
        dataLiquidacao: "2026-10-22",
        valorMovimentado: 50.02,
        idempotencyKey: "h3c46-acima",
        alocacoes: [{ parcelaId: dParc.parcelas[1]!.id, principalLiquidado: 50.02 }],
      });
    } catch (e) {
      kMsg = msg(e);
      kOk = kMsg.includes(MSG_FIN_OVERPAYMENT);
    }
    reg({ id: "K", nome: "Pagamento acima do saldo", ok: kOk, detalhe: { mensagem: kMsg } });

    const contaInat = await svc.criarContaFinanceira(USER_A, {
      nome: "Conta inativa homolog",
      tipo: "caixa",
      saldoAbertura: 500,
      dataSaldoAbertura: "2026-01-01",
    });
    await svc.inativarConta(USER_A, contaInat.id, "homolog");
    let lOk = false;
    let lMsg = "";
    try {
      await svc.criarPagamento(USER_A, {
        contaId: contaInat.id,
        dataLiquidacao: "2026-10-22",
        valorMovimentado: 10,
        idempotencyKey: "h3c46-inativa",
        alocacoes: [{ parcelaId: dParc.parcelas[1]!.id, principalLiquidado: 10 }],
      });
    } catch (e) {
      lMsg = msg(e);
      lOk = lMsg.includes(MSG_FIN_CONTA_INATIVA);
    }
    reg({ id: "L", nome: "Pagamento em conta inativa", ok: lOk, detalhe: { mensagem: lMsg } });

    const tCanc = await svc.criarTitulo(USER_A, {
      tipo: "pagar",
      pessoaId: pessoaA,
      descricao: "Homolog cancelado",
      dataCompetencia: "2026-10-01",
      valorOriginal: 40,
      parcelas: [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 40 }],
    });
    const dCanc = await svc.detalheTitulo(USER_A, tCanc.id);
    await svc.cancelarTitulo(USER_A, tCanc.id, "homolog");
    let mOk = false;
    let mMsg = "";
    try {
      await svc.criarPagamento(USER_A, {
        contaId: conta.id,
        dataLiquidacao: "2026-10-22",
        valorMovimentado: 40,
        idempotencyKey: "h3c46-canc",
        alocacoes: [{ parcelaId: dCanc.parcelas[0]!.id, principalLiquidado: 40 }],
      });
    } catch (e) {
      mMsg = msg(e);
      mOk = mMsg.includes(MSG_FIN_TITULO_CANCELADO);
    }
    reg({ id: "M", nome: "Título cancelado", ok: mOk, detalhe: { mensagem: mMsg } });

    let nNotFound = false;
    let nContaAlheia = false;
    try {
      await svc.detalheTitulo(USER_B, tParc.id);
    } catch {
      nNotFound = true;
    }
    const contaB = await svc.criarContaFinanceira(USER_B, {
      nome: "Caixa B",
      tipo: "caixa",
      saldoAbertura: 100,
      dataSaldoAbertura: "2026-01-01",
    });
    try {
      await svc.criarPagamento(USER_B, {
        contaId: conta.id,
        dataLiquidacao: "2026-10-22",
        valorMovimentado: 10,
        idempotencyKey: "h3c46-xuser",
        alocacoes: [{ parcelaId: dParc.parcelas[1]!.id, principalLiquidado: 10 }],
      });
    } catch {
      nContaAlheia = true;
    }
    const contaAinda = await svc.obterConta(USER_A, conta.id);
    reg({
      id: "N",
      nome: "Isolamento entre usuários",
      ok: nNotFound && nContaAlheia && Number(contaAinda.saldoAtual) === 9670 && contaB.id > 0,
      detalhe: { tituloBNaoViu: nNotFound, contaAlheiaRecusada: nContaAlheia, saldoA: contaAinda.saldoAtual },
    });

    const tIdem = await svc.criarTitulo(USER_A, {
      tipo: "pagar",
      pessoaId: pessoaA,
      descricao: "Homolog idem",
      dataCompetencia: "2026-10-01",
      valorOriginal: 80,
      parcelas: [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 80 }],
    });
    const dIdem = await svc.detalheTitulo(USER_A, tIdem.id);
    const cmd = {
      contaId: conta.id,
      dataLiquidacao: "2026-10-23",
      valorMovimentado: 80,
      idempotencyKey: "h3c46-retry-mesma-chave",
      alocacoes: [{ parcelaId: dIdem.parcelas[0]!.id, principalLiquidado: 80 }],
    };
    const r1 = await svc.criarPagamento(USER_A, cmd);
    const r2 = await svc.criarPagamento(USER_A, cmd);
    const liqIdem = await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE idempotency_key = ?", [cmd.idempotencyKey]);
    const movIdem = await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_movimentos WHERE liquidacao_id = ?", [r1.id]);
    const alocIdem = await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacao_alocacoes WHERE liquidacao_id = ?", [r1.id]);
    const dIdemPos = await svc.detalheTitulo(USER_A, tIdem.id);
    const idemOk = r1.id === r2.id && r2.idempotente === true && Number(liqIdem[0]?.n) === 1
      && Number(movIdem[0]?.n) === 1 && Number(alocIdem[0]?.n) === 1 && Number(dIdemPos.parcelas[0]!.saldoPrincipal) === 0;
    reg({
      id: "IDEM",
      nome: "Retry com a mesma chave após gravação",
      ok: idemOk,
      detalhe: {
        id1: r1.id,
        id2: r2.id,
        movimento1: r1.movimentoId,
        movimento2: r2.movimentoId,
        idempotente: r2.idempotente,
        liquidacoes: Number(liqIdem[0]?.n),
        movimentos: Number(movIdem[0]?.n),
        alocacoes: Number(alocIdem[0]?.n),
        saldoParcela: dIdemPos.parcelas[0]!.saldoPrincipal,
      },
    });

    const contaConc = await svc.criarContaFinanceira(USER_A, {
      nome: "Caixa concorrencia",
      tipo: "caixa",
      saldoAbertura: 50000,
      dataSaldoAbertura: "2026-01-01",
    });
    const tConc = await svc.criarTitulo(USER_A, {
      tipo: "pagar",
      pessoaId: pessoaA,
      descricao: "Homolog concorrencia",
      dataCompetencia: "2026-10-01",
      valorOriginal: 100,
      parcelas: [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 100 }],
    });
    const dConc = await svc.detalheTitulo(USER_A, tConc.id);
    const parcelaConc = dConc.parcelas[0]!.id;
    const resultados = await Promise.allSettled([
      svc.criarPagamento(USER_A, {
        contaId: contaConc.id,
        dataLiquidacao: "2026-10-24",
        valorMovimentado: 100,
        idempotencyKey: "h3c46-conc-a",
        alocacoes: [{ parcelaId: parcelaConc, principalLiquidado: 100 }],
      }),
      svc2.criarPagamento(USER_A, {
        contaId: contaConc.id,
        dataLiquidacao: "2026-10-24",
        valorMovimentado: 100,
        idempotencyKey: "h3c46-conc-b",
        alocacoes: [{ parcelaId: parcelaConc, principalLiquidado: 100 }],
      }),
    ]);
    const okConc = resultados.filter(r => r.status === "fulfilled");
    const failConc = resultados.filter(r => r.status === "rejected");
    const dConcPos = await svc.detalheTitulo(USER_A, tConc.id);
    const saldoConc = Number(dConcPos.parcelas[0]!.saldoPrincipal);
    const pagoConc = Number(dConcPos.parcelas[0]!.principalLiquidado);
    const concOk = okConc.length === 1 && failConc.length === 1 && saldoConc >= 0 && pagoConc === 100;
    reg({
      id: "CONC",
      nome: "Dois pagamentos simultâneos na mesma parcela",
      ok: concOk,
      detalhe: {
        fulfilled: okConc.length,
        rejected: failConc.length,
        motivo: failConc[0]?.status === "rejected" ? msg(failConc[0].reason) : null,
        saldoParcela: saldoConc,
        pago: pagoConc,
      },
    });

    const integ = await q<{
      liq: number; aloc: number; mov: number; tit: number; par: number; cta: number;
    }[]>(pool, `SELECT
      (SELECT COUNT(*) FROM financeiro_liquidacoes) liq,
      (SELECT COUNT(*) FROM financeiro_liquidacao_alocacoes) aloc,
      (SELECT COUNT(*) FROM financeiro_movimentos) mov,
      (SELECT COUNT(*) FROM financeiro_titulos) tit,
      (SELECT COUNT(*) FROM financeiro_parcelas) par,
      (SELECT COUNT(*) FROM financeiro_contas) cta`);
    const divergencias = await q<{ n: number }[]>(pool, `
      SELECT COUNT(*) n FROM financeiro_liquidacoes l
      LEFT JOIN financeiro_movimentos m ON m.liquidacao_id = l.id
      WHERE m.id IS NULL OR m.valor <> l.valor_movimentado OR m.conta_id <> l.conta_id
    `);
    const somaAloc = await q<{ n: number }[]>(pool, `
      SELECT COUNT(*) n FROM financeiro_liquidacoes l
      WHERE l.valor_movimentado <> (
        SELECT COALESCE(SUM(a.principal_liquidado - a.desconto + a.juros + a.multa), 0)
        FROM financeiro_liquidacao_alocacoes a WHERE a.liquidacao_id = l.id
      )
    `);
    const saldoNeg = await q<{ n: number }[]>(pool, `
      SELECT COUNT(*) n FROM (
        SELECT p.id,
          p.valor_original - COALESCE(SUM(
            CASE WHEN l.tipo = 'pagamento' THEN a.principal_liquidado
                 WHEN l.tipo = 'estorno_pagamento' THEN -a.principal_liquidado
                 ELSE 0 END
          ), 0) saldo
        FROM financeiro_parcelas p
        LEFT JOIN financeiro_liquidacao_alocacoes a ON a.parcela_id = p.id
        LEFT JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id
        GROUP BY p.id, p.valor_original
      ) x WHERE x.saldo < 0
    `);
    const integOk = Number(divergencias[0]?.n) === 0 && Number(somaAloc[0]?.n) === 0 && Number(saldoNeg[0]?.n) === 0
      && Number(integ[0]?.liq) === Number(integ[0]?.mov);
    reg({
      id: "INTEG",
      nome: "Integridade financeira no MySQL isolado",
      ok: integOk,
      detalhe: {
        ...integ[0],
        liquidacaoSemMovimentoOuDivergente: Number(divergencias[0]?.n),
        caixaDivergeAlocacao: Number(somaAloc[0]?.n),
        parcelaSaldoNegativo: Number(saldoNeg[0]?.n),
      },
    });

    const depois = await snapshotOperacional(admin);
    const isolamentoOk = JSON.stringify(antes.checksums) === JSON.stringify(depois.checksums)
      && JSON.stringify(antes.titulos80_84) === JSON.stringify(depois.titulos80_84)
      && antes.contagens.legado === depois.contagens.legado;
    if (!isolamentoOk) problemas.push("OPERACIONAL ALTERADO — checksum divergente");

    console.log(JSON.stringify({
      bancoIsolado: HOMOLOG,
      bancosVistos: nomesBancos.filter(n => n === OPERACIONAL || n.startsWith("fazenda_digital")),
      databaseNaUrl: cred.databaseNaUrl,
      naoEOperacional: HOMOLOG !== OPERACIONAL,
      isolamentoOperacional: isolamentoOk,
      operacionalAntes: antes,
      operacionalDepois: depois,
      cenarios,
      problemas,
    }, null, 2));
  } finally {
    if (pool) await pool.end();
    if (pool2) await pool2.end();
    try {
      await admin.query(`DROP DATABASE IF EXISTS \`${HOMOLOG}\``);
    } catch (e) {
      console.error("falha ao dropar homolog", msg(e));
    }
    await admin.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
