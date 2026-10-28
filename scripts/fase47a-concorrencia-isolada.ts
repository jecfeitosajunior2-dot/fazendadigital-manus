/**
 * Fase 4.7A — concorrência em MySQL descartável + prova do snapshot REPEATABLE READ.
 * Não grava em fazenda_digital.
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema";
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "../server/financeiroNucleo";
import { MSG_FIN_SALDO_INSUFICIENTE } from "../shared/financeiroNucleo";

config({ path: ".env.local" });
config();

const OPERACIONAL = "fazenda_digital";
const TESTE = "fazenda_digital_test_fin47a";
const TEST_USER = "fd_fin47a";
const FIN_USER = 910047;
const TABELAS = [
  "pessoas",
  "fazendas",
  "financeiro_contas",
  "financeiro_titulos",
  "financeiro_parcelas",
  "financeiro_liquidacoes",
  "financeiro_liquidacao_alocacoes",
  "financeiro_movimentos",
  "financeiro_transferencias",
  "financeiro_categorias",
  "financeiro_centros_custo",
  "financeiro_apropriacoes",
] as const;

function credAdmin() {
  const raw = process.env.DATABASE_URL || "";
  const u = new URL(raw);
  const db = (u.pathname || "").replace(/^\//, "").split("?")[0];
  if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) throw new Error("ABORT: host não local");
  if (db !== OPERACIONAL) throw new Error(`ABORT: URL admin aponta para ${db}`);
  return {
    host: u.hostname === "localhost" ? "127.0.0.1" : u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}

async function q<T extends mysql.RowDataPacket[]>(c: mysql.Connection | mysql.Pool, sqlText: string, params: unknown[] = []) {
  const [rows] = await c.query(sqlText, params);
  return rows as T;
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

async function snapshotOp(admin: mysql.Connection) {
  const count = async (t: string) =>
    Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.\`${t}\``))[0]?.n);
  return {
    vendas: await count("vendas"),
    titulos: await count("financeiro_titulos"),
    parcelas: await count("financeiro_parcelas"),
    liquidacoes: await count("financeiro_liquidacoes"),
    movimentos: await count("financeiro_movimentos"),
    transferencias: await count("financeiro_transferencias"),
    legadoContas: await count("contas_financeiras"),
    legadoMovs: await count("movimentacoes"),
  };
}

type Cenario = { id: string; ok: boolean; detalhe: Record<string, unknown> };

function novoServico(cred: ReturnType<typeof credAdmin>, pass: string) {
  const pool = mysql.createPool({
    host: cred.host, port: cred.port, user: TEST_USER, password: pass, database: TESTE,
    waitForConnections: true, connectionLimit: 4,
  });
  const store = createFinanceiroNucleoMysqlStore(drizzle(pool, { schema, mode: "default" }));
  return { pool, svc: createFinanceiroNucleoService(store) };
}

async function main() {
  const cred = credAdmin();
  const pass = randomBytes(18).toString("base64url");
  const admin = await mysql.createConnection({
    host: cred.host, port: cred.port, user: cred.user, password: cred.password, multipleStatements: true,
  });
  const relatorio: Record<string, unknown> = { fase: "4.7A", schema: TESTE };
  const cenarios: Cenario[] = [];
  const pools: mysql.Pool[] = [];

  const reg = (c: Cenario) => {
    cenarios.push(c);
    console.error(JSON.stringify({ progresso: c.id, ok: c.ok }));
  };

  try {
    relatorio.operacionalAntes = await snapshotOp(admin);
    await admin.query(`DROP DATABASE IF EXISTS \`${TESTE}\``);
    await admin.query(`CREATE DATABASE \`${TESTE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    for (const host of ["localhost", "%"] as const) {
      await admin.query(`CREATE USER IF NOT EXISTS '${TEST_USER}'@'${host}' IDENTIFIED BY '${pass}'`);
      await admin.query(`ALTER USER '${TEST_USER}'@'${host}' IDENTIFIED BY '${pass}'`);
      try { await admin.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${TEST_USER}'@'${host}'`); } catch { /* */ }
      await admin.query(`GRANT ALL PRIVILEGES ON \`${TESTE}\`.* TO '${TEST_USER}'@'${host}'`);
    }
    await admin.query("FLUSH PRIVILEGES");
    for (const t of TABELAS) {
      await admin.query(`CREATE TABLE \`${TESTE}\`.\`${t}\` LIKE \`${OPERACIONAL}\`.\`${t}\``);
    }

    const probe = await mysql.createConnection({
      host: cred.host, port: cred.port, user: TEST_USER, password: pass, database: TESTE,
    });
    const dbName = (await q<{ db: string }[]>(probe, "SELECT DATABASE() db"))[0]?.db;
    const grants = [
      ...(await q<{ [k: string]: string }[]>(admin, `SHOW GRANTS FOR '${TEST_USER}'@'localhost'`)),
      ...(await q<{ [k: string]: string }[]>(admin, `SHOW GRANTS FOR '${TEST_USER}'@'%'`)),
    ].map((r) => String(Object.values(r)[0]).replace(/IDENTIFIED BY\s+'[^']*'/gi, "IDENTIFIED BY ***"));
    const tocaOp = grants.some((g) => /on\s+`?fazenda_digital`?(\.|\s)/i.test(g) && !/test_fin47a/i.test(g));
    let operacionalNegado = false;
    let operacionalErro = "";
    try {
      await probe.query(`SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.financeiro_titulos`);
    } catch (err) {
      operacionalErro = msg(err);
      operacionalNegado = /denied|1142|1044/i.test(operacionalErro);
    }
    const isolamento = { database: dbName, grants, tocaOp, operacionalNegado, operacionalErro };
    relatorio.isolamento = isolamento;
    await probe.end();
    if (dbName !== TESTE || tocaOp || !operacionalNegado) {
      throw new Error(`BLOQUEADO POR ISOLAMENTO: ${JSON.stringify(isolamento)}`);
    }

    const a = novoServico(cred, pass);
    const b = novoServico(cred, pass);
    pools.push(a.pool, b.pool);
    const adminSeed = a.pool;

    async function reset() {
      await adminSeed.query("SET FOREIGN_KEY_CHECKS = 0");
      for (const t of [...TABELAS].reverse()) await adminSeed.query(`DELETE FROM \`${t}\``);
      await adminSeed.query("SET FOREIGN_KEY_CHECKS = 1");
      await adminSeed.query(
        `INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Fornecedor A', 'fornecedor', 1), (?, 'Cliente A', 'cliente', 1)`,
        [FIN_USER, FIN_USER],
      );
      await adminSeed.query(`INSERT INTO fazendas (userId, nome) VALUES (?, 'Fazenda Isolada 47A')`, [FIN_USER]);
    }
    async function pessoaId(nome: string) {
      return Number((await q<{ id: number }[]>(adminSeed, "SELECT id FROM pessoas WHERE nome = ? LIMIT 1", [nome]))[0]?.id);
    }
    async function counts() {
      const one = async (t: string) => Number((await q<{ n: number }[]>(adminSeed, `SELECT COUNT(*) n FROM \`${t}\``))[0]?.n);
      return {
        titulos: await one("financeiro_titulos"),
        parcelas: await one("financeiro_parcelas"),
        liquidacoes: await one("financeiro_liquidacoes"),
        movimentos: await one("financeiro_movimentos"),
        transferencias: await one("financeiro_transferencias"),
      };
    }
    async function saldosNegativos() {
      const contas = await q<{ id: number }[]>(adminSeed, "SELECT id FROM financeiro_contas");
      const neg: Array<{ id: number; saldo: number }> = [];
      for (const c of contas) {
        const s = await a.svc.calcularSaldoConta(FIN_USER, c.id);
        if (s < 0) neg.push({ id: c.id, saldo: s });
      }
      return neg;
    }

    // Prova do diagnóstico: snapshot REPEATABLE READ vs locking read
    await reset();
    {
      const conta = await a.svc.criarContaFinanceira(FIN_USER, {
        nome: "Diag", tipo: "caixa", saldoAbertura: 10000, dataSaldoAbertura: "2026-10-01",
      });
      const c1 = await mysql.createConnection({
        host: cred.host, port: cred.port, user: TEST_USER, password: pass, database: TESTE,
      });
      const c2 = await mysql.createConnection({
        host: cred.host, port: cred.port, user: TEST_USER, password: pass, database: TESTE,
      });
      await c1.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await c1.beginTransaction();
      await c1.query("SELECT id FROM financeiro_contas WHERE id = ? FOR UPDATE", [conta.id]);
      const antes = Number((await q<{ n: number }[]>(c1, "SELECT COUNT(*) n FROM financeiro_movimentos WHERE conta_id = ?", [conta.id]))[0]?.n);
      await c2.beginTransaction();
      await c2.query(
        `INSERT INTO financeiro_movimentos (user_id, conta_id, data_movimento, direcao, natureza, valor, descricao)
         VALUES (?, ?, '2026-10-15', 'saida', 'pagamento', 10000, 'diag')`,
        [FIN_USER, conta.id],
      );
      await c2.commit();
      const snapshot = Number((await q<{ n: number }[]>(c1, "SELECT COUNT(*) n FROM financeiro_movimentos WHERE conta_id = ?", [conta.id]))[0]?.n);
      const locking = Number((await q<{ n: number }[]>(c1, "SELECT COUNT(*) n FROM financeiro_movimentos WHERE conta_id = ? FOR UPDATE", [conta.id]))[0]?.n);
      await c1.rollback();
      await c1.end();
      await c2.end();
      relatorio.diagnostico = {
        causa: "REPEATABLE READ: SELECT do extrato após FOR UPDATE da conta ainda vê o snapshot da primeira leitura; locking read vê o movimento já commitado.",
        antes,
        snapshotAposCommitAlheio: snapshot,
        lockingReadAposCommitAlheio: locking,
      };
      reg({
        id: "0-diagnostico-snapshot-rr",
        ok: antes === 0 && snapshot === 0 && locking === 1,
        detalhe: relatorio.diagnostico as Record<string, unknown>,
      });
    }

    // 1 — dois pagamentos, parcelas diferentes, mesmo saldo
    await reset();
    {
      const pessoa = await pessoaId("Fornecedor A");
      const conta = await a.svc.criarContaFinanceira(FIN_USER, {
        nome: "Caixa 1", tipo: "caixa", saldoAbertura: 10000, dataSaldoAbertura: "2026-10-01",
      });
      const t1 = await a.svc.criarTitulo(FIN_USER, {
        tipo: "pagar", pessoaId: pessoa, descricao: "P1", dataCompetencia: "2026-10-02",
        valorOriginal: 10000, parcelas: [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 10000 }],
      });
      const t2 = await a.svc.criarTitulo(FIN_USER, {
        tipo: "pagar", pessoaId: pessoa, descricao: "P2", dataCompetencia: "2026-10-02",
        valorOriginal: 10000, parcelas: [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 10000 }],
      });
      const p1 = (await a.svc.detalheTitulo(FIN_USER, t1.id)).parcelas[0]!.id;
      const p2 = (await a.svc.detalheTitulo(FIN_USER, t2.id)).parcelas[0]!.id;
      const r = await Promise.allSettled([
        a.svc.criarPagamento(FIN_USER, {
          contaId: conta.id, dataLiquidacao: "2026-10-15", valorMovimentado: 10000,
          idempotencyKey: "c1-a", alocacoes: [{ parcelaId: p1, principalLiquidado: 10000 }],
        }),
        b.svc.criarPagamento(FIN_USER, {
          contaId: conta.id, dataLiquidacao: "2026-10-15", valorMovimentado: 10000,
          idempotencyKey: "c1-b", alocacoes: [{ parcelaId: p2, principalLiquidado: 10000 }],
        }),
      ]);
      const ok = r.filter(x => x.status === "fulfilled").length;
      const fail = r.filter(x => x.status === "rejected");
      const c = await counts();
      const neg = await saldosNegativos();
      const saldo = await a.svc.calcularSaldoConta(FIN_USER, conta.id);
      const erroSaldo = fail.some(x => x.status === "rejected" && msg(x.reason).includes(MSG_FIN_SALDO_INSUFICIENTE));
      reg({
        id: "1-dois-pagamentos-parcelas-diferentes",
        ok: ok === 1 && fail.length === 1 && erroSaldo && c.liquidacoes === 1 && c.movimentos === 1 && saldo === 0 && neg.length === 0,
        detalhe: { ok, fail: fail.length, erroSaldo, ...c, saldo, neg, erros: fail.map(x => msg(x.reason)) },
      });
    }

    // 2 — pagamento × transferência
    await reset();
    {
      const pessoa = await pessoaId("Fornecedor A");
      const origem = await a.svc.criarContaFinanceira(FIN_USER, {
        nome: "Caixa 2", tipo: "caixa", saldoAbertura: 10000, dataSaldoAbertura: "2026-10-01",
      });
      const destino = await a.svc.criarContaFinanceira(FIN_USER, {
        nome: "Banco 2", tipo: "conta_corrente", saldoAbertura: 0, dataSaldoAbertura: "2026-10-01",
      });
      const titulo = await a.svc.criarTitulo(FIN_USER, {
        tipo: "pagar", pessoaId: pessoa, descricao: "Conc 2", dataCompetencia: "2026-10-02",
        valorOriginal: 10000, parcelas: [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 10000 }],
      });
      const parcelaId = (await a.svc.detalheTitulo(FIN_USER, titulo.id)).parcelas[0]!.id;
      const r = await Promise.allSettled([
        a.svc.criarPagamento(FIN_USER, {
          contaId: origem.id, dataLiquidacao: "2026-10-15", valorMovimentado: 10000,
          idempotencyKey: "c2-pag", alocacoes: [{ parcelaId, principalLiquidado: 10000 }],
        }),
        b.svc.criarTransferencia(FIN_USER, {
          contaOrigemId: origem.id, contaDestinoId: destino.id, dataTransferencia: "2026-10-15",
          valor: 10000, idempotencyKey: "c2-tr",
        }),
      ]);
      const ok = r.filter(x => x.status === "fulfilled").length;
      const fail = r.filter(x => x.status === "rejected");
      const c = await counts();
      const neg = await saldosNegativos();
      const so = await a.svc.calcularSaldoConta(FIN_USER, origem.id);
      const sd = await a.svc.calcularSaldoConta(FIN_USER, destino.id);
      const umaSaida = (c.liquidacoes === 1 && c.transferencias === 0) || (c.liquidacoes === 0 && c.transferencias === 1);
      reg({
        id: "2-pagamento-x-transferencia",
        ok: ok === 1 && fail.length === 1 && umaSaida && neg.length === 0 && so + sd === 0 && so >= 0,
        detalhe: { ok, fail: fail.length, ...c, so, sd, neg, erros: fail.map(x => msg(x.reason)) },
      });
    }

    // 3 — estorno recebimento × transferência
    await reset();
    {
      const pessoa = await pessoaId("Cliente A");
      const origem = await a.svc.criarContaFinanceira(FIN_USER, {
        nome: "Caixa 3", tipo: "caixa", saldoAbertura: 0, dataSaldoAbertura: "2026-10-01",
      });
      const destino = await a.svc.criarContaFinanceira(FIN_USER, {
        nome: "Banco 3", tipo: "conta_corrente", saldoAbertura: 0, dataSaldoAbertura: "2026-10-01",
      });
      const titulo = await a.svc.criarTitulo(FIN_USER, {
        tipo: "receber", pessoaId: pessoa, descricao: "Conc 3", dataCompetencia: "2026-10-02",
        valorOriginal: 10000, parcelas: [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 10000 }],
      });
      const parcelaId = (await a.svc.detalheTitulo(FIN_USER, titulo.id)).parcelas[0]!.id;
      const rec = await a.svc.criarRecebimento(FIN_USER, {
        contaId: origem.id, dataLiquidacao: "2026-10-10", valorMovimentado: 10000,
        idempotencyKey: "c3-rec", alocacoes: [{ parcelaId, principalLiquidado: 10000 }],
      });
      const r = await Promise.allSettled([
        a.svc.estornarLiquidacao(FIN_USER, {
          liquidacaoId: rec.id, idempotencyKey: "c3-est", dataLiquidacao: "2026-10-16",
        }),
        b.svc.criarTransferencia(FIN_USER, {
          contaOrigemId: origem.id, contaDestinoId: destino.id, dataTransferencia: "2026-10-16",
          valor: 10000, idempotencyKey: "c3-tr",
        }),
      ]);
      const ok = r.filter(x => x.status === "fulfilled").length;
      const fail = r.filter(x => x.status === "rejected");
      const c = await counts();
      const neg = await saldosNegativos();
      const so = await a.svc.calcularSaldoConta(FIN_USER, origem.id);
      const sd = await a.svc.calcularSaldoConta(FIN_USER, destino.id);
      const estornoVenceu = c.liquidacoes === 2 && c.transferencias === 0 && so === 0 && sd === 0 && c.movimentos === 2;
      const transfVenceu = c.liquidacoes === 1 && c.transferencias === 1 && so === 0 && sd === 10000 && c.movimentos === 3;
      reg({
        id: "3-estorno-x-transferencia",
        ok: ok === 1 && fail.length === 1 && neg.length === 0 && (estornoVenceu || transfVenceu),
        detalhe: { ok, fail: fail.length, estornoVenceu, transfVenceu, ...c, so, sd, neg, erros: fail.map(x => msg(x.reason)) },
      });
    }

    // 4 — duas transferências no mesmo saldo
    await reset();
    {
      const origem = await a.svc.criarContaFinanceira(FIN_USER, {
        nome: "Caixa 4", tipo: "caixa", saldoAbertura: 10000, dataSaldoAbertura: "2026-10-01",
      });
      const d1 = await a.svc.criarContaFinanceira(FIN_USER, {
        nome: "Banco 4A", tipo: "conta_corrente", saldoAbertura: 0, dataSaldoAbertura: "2026-10-01",
      });
      const d2 = await a.svc.criarContaFinanceira(FIN_USER, {
        nome: "Banco 4B", tipo: "conta_corrente", saldoAbertura: 0, dataSaldoAbertura: "2026-10-01",
      });
      const r = await Promise.allSettled([
        a.svc.criarTransferencia(FIN_USER, {
          contaOrigemId: origem.id, contaDestinoId: d1.id, dataTransferencia: "2026-10-15",
          valor: 10000, idempotencyKey: "c4-a",
        }),
        b.svc.criarTransferencia(FIN_USER, {
          contaOrigemId: origem.id, contaDestinoId: d2.id, dataTransferencia: "2026-10-15",
          valor: 10000, idempotencyKey: "c4-b",
        }),
      ]);
      const ok = r.filter(x => x.status === "fulfilled").length;
      const fail = r.filter(x => x.status === "rejected");
      const c = await counts();
      const neg = await saldosNegativos();
      const so = await a.svc.calcularSaldoConta(FIN_USER, origem.id);
      const s1 = await a.svc.calcularSaldoConta(FIN_USER, d1.id);
      const s2 = await a.svc.calcularSaldoConta(FIN_USER, d2.id);
      reg({
        id: "4-duas-transferencias",
        ok: ok === 1 && fail.length === 1 && c.transferencias === 1 && c.movimentos === 2 && neg.length === 0 && so + s1 + s2 === 10000 && so >= 0,
        detalhe: { ok, fail: fail.length, ...c, so, s1, s2, neg, erros: fail.map(x => msg(x.reason)) },
      });
    }

    // 5 — retry pagamento
    await reset();
    {
      const pessoa = await pessoaId("Fornecedor A");
      const conta = await a.svc.criarContaFinanceira(FIN_USER, {
        nome: "Caixa 5", tipo: "caixa", saldoAbertura: 4000, dataSaldoAbertura: "2026-10-01",
      });
      const titulo = await a.svc.criarTitulo(FIN_USER, {
        tipo: "pagar", pessoaId: pessoa, descricao: "R5", dataCompetencia: "2026-10-02",
        valorOriginal: 4000, parcelas: [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 4000 }],
      });
      const parcelaId = (await a.svc.detalheTitulo(FIN_USER, titulo.id)).parcelas[0]!.id;
      const cmd = {
        contaId: conta.id, dataLiquidacao: "2026-10-15", valorMovimentado: 4000,
        idempotencyKey: "c5-retry", alocacoes: [{ parcelaId, principalLiquidado: 4000 }],
      };
      const x = await a.svc.criarPagamento(FIN_USER, cmd);
      const y = await b.svc.criarPagamento(FIN_USER, cmd);
      const c = await counts();
      reg({
        id: "5-retry-pagamento",
        ok: x.id === y.id && y.idempotente === true && c.liquidacoes === 1 && c.movimentos === 1,
        detalhe: { x: x.id, y: y.id, idempotente: y.idempotente, ...c },
      });
    }

    // 6 — retry transferência
    await reset();
    {
      const origem = await a.svc.criarContaFinanceira(FIN_USER, {
        nome: "Caixa 6", tipo: "caixa", saldoAbertura: 8000, dataSaldoAbertura: "2026-10-01",
      });
      const destino = await a.svc.criarContaFinanceira(FIN_USER, {
        nome: "Banco 6", tipo: "conta_corrente", saldoAbertura: 0, dataSaldoAbertura: "2026-10-01",
      });
      const cmd = {
        contaOrigemId: origem.id, contaDestinoId: destino.id, dataTransferencia: "2026-10-15",
        valor: 2500, idempotencyKey: "c6-retry",
      };
      const x = await a.svc.criarTransferencia(FIN_USER, cmd);
      const y = await b.svc.criarTransferencia(FIN_USER, cmd);
      const c = await counts();
      reg({
        id: "6-retry-transferencia",
        ok: x.id === y.id && y.idempotente === true && c.transferencias === 1 && c.movimentos === 2,
        detalhe: { x: x.id, y: y.id, idempotente: y.idempotente, ...c },
      });
    }

    // 7 — retry estorno
    await reset();
    {
      const pessoa = await pessoaId("Cliente A");
      const conta = await a.svc.criarContaFinanceira(FIN_USER, {
        nome: "Caixa 7", tipo: "caixa", saldoAbertura: 0, dataSaldoAbertura: "2026-10-01",
      });
      const titulo = await a.svc.criarTitulo(FIN_USER, {
        tipo: "receber", pessoaId: pessoa, descricao: "R7", dataCompetencia: "2026-10-02",
        valorOriginal: 3000, parcelas: [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 3000 }],
      });
      const parcelaId = (await a.svc.detalheTitulo(FIN_USER, titulo.id)).parcelas[0]!.id;
      const rec = await a.svc.criarRecebimento(FIN_USER, {
        contaId: conta.id, dataLiquidacao: "2026-10-10", valorMovimentado: 3000,
        idempotencyKey: "c7-rec", alocacoes: [{ parcelaId, principalLiquidado: 3000 }],
      });
      const cmd = { liquidacaoId: rec.id, idempotencyKey: "c7-est", dataLiquidacao: "2026-10-16" };
      const x = await a.svc.estornarLiquidacao(FIN_USER, cmd);
      const y = await b.svc.estornarLiquidacao(FIN_USER, cmd);
      const c = await counts();
      const saldo = await a.svc.calcularSaldoConta(FIN_USER, conta.id);
      const neg = await saldosNegativos();
      reg({
        id: "7-retry-estorno",
        ok: x.id === y.id && y.idempotente === true && c.liquidacoes === 2 && saldo === 0 && neg.length === 0,
        detalhe: { x: x.id, y: y.id, idempotente: y.idempotente, ...c, saldo, neg },
      });
    }

    relatorio.cenarios = cenarios;
    relatorio.aprovados = cenarios.filter(c => c.ok).length;
    relatorio.reprovados = cenarios.filter(c => !c.ok).length;
  } finally {
    for (const p of pools) {
      try { await p.end(); } catch { /* */ }
    }
    try {
      await admin.query(`DROP DATABASE IF EXISTS \`${TESTE}\``);
      await admin.query(`DROP USER IF EXISTS '${TEST_USER}'@'localhost'`);
      await admin.query(`DROP USER IF EXISTS '${TEST_USER}'@'%'` );
      await admin.query("FLUSH PRIVILEGES");
    } catch (e) {
      relatorio.cleanupErro = msg(e);
    }
    relatorio.operacionalDepois = await snapshotOp(admin);
    await admin.end();
  }
  const antes = JSON.stringify(relatorio.operacionalAntes);
  const depois = JSON.stringify(relatorio.operacionalDepois);
  relatorio.operacionalIntacto = antes === depois;
  console.log(JSON.stringify(relatorio, null, 2));
  if (relatorio.reprovados || !relatorio.operacionalIntacto) process.exitCode = 1;
}

main().catch((e) => {
  console.error(JSON.stringify({ fatal: msg(e) }));
  process.exit(1);
});
