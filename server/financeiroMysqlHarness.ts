import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { config } from "dotenv";
import * as schema from "../drizzle/schema";
import { afirmarBancoDescartavel, BANCO_OPERACIONAL, CONTAINER_OPERACIONAL } from "./isolamentoMysql";
import { ensureFinanceiroNucleoSchema } from "./ensureFinanceiroNucleoSchema";
import { ensureEstoqueOperacoesSchema } from "./ensureEstoqueOperacoesSchema";
import { ensureEstoqueCapitalSchema } from "./ensureEstoqueCapitalSchema";
import { ensureSaudeEstoqueSchema } from "./ensureSaudeEstoqueSchema";
import { ensureManutencaoEstoqueSchema } from "./ensureManutencaoEstoqueSchema";
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "./financeiroNucleo";
import type { AcessoFinanceiro } from "./consultaFinanceiroAutorizada";

config({ path: ".env.local" });
config();

/** IDs sintéticos. Nunca usar IDs operacionais reais. */
export const FIN_USER_A = 910001;
export const FIN_USER_B = 910002;

export type FinanceiroMysqlHarness = {
  pool: mysql.Pool;
  service: ReturnType<typeof createFinanceiroNucleoService>;
  store: ReturnType<typeof createFinanceiroNucleoMysqlStore>;
  query: <T = mysql.RowDataPacket[]>(sql: string, params?: unknown[]) => Promise<T>;
  close: () => Promise<void>;
};

const FIN_USERS = [FIN_USER_A, FIN_USER_B] as const;

/** Principal da própria conta. O mesmo contrato da suíte do núcleo. */
export function escopoTitularFinanceiro(userId: number, fazendaIds: number[] = []): AcessoFinanceiro {
  return { titularUserId: userId, papel: "principal", fazendaIds };
}

export async function openFinanceiroMysqlHarness(suite: string): Promise<FinanceiroMysqlHarness> {
  if (!process.env.DATABASE_URL) {
    throw new Error("Preparação ausente: o banco descartável não foi informado.");
  }
  const container = process.env.FD_CONTAINER ?? "";
  if (!container || container === CONTAINER_OPERACIONAL) {
    throw new Error("Preparação recusada: container descartável não conferido.");
  }
  const alvo = new URL(process.env.DATABASE_URL);
  const modelo = alvo.pathname.replace(/^\//, "");
  const porta = Number(alvo.port || 3306);
  afirmarBancoDescartavel({
    host: alvo.hostname,
    port: porta,
    database: modelo,
    container,
  });
  const banco = `fd_suite_${suite.replace(/[^a-z0-9_]/gi, "").toLowerCase()}`;
  if (!banco || banco === BANCO_OPERACIONAL || banco === modelo) {
    throw new Error("Preparação recusada: suíte sem banco próprio.");
  }
  const admin = await mysql.createConnection({
    host: alvo.hostname,
    port: porta,
    user: decodeURIComponent(alvo.username),
    password: decodeURIComponent(alvo.password),
    multipleStatements: true,
  });
  try {
    const [modeloTabelas] = await admin.query<mysql.RowDataPacket[]>(
      "SELECT TABLE_NAME AS nome FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
      [modelo],
    );
    if (modeloTabelas.length === 0) {
      throw new Error("Preparação ausente: o modelo descartável não tem tabelas.");
    }
    await admin.query(`DROP DATABASE IF EXISTS \`${banco}\``);
    await admin.query(`CREATE DATABASE \`${banco}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.query("SET FOREIGN_KEY_CHECKS=0");
    for (const tabela of modeloTabelas) {
      const nome = String(tabela.nome);
      const [criacao] = await admin.query<mysql.RowDataPacket[]>(`SHOW CREATE TABLE \`${modelo}\`.\`${nome}\``);
      const sql = String(criacao[0]?.["Create Table"] ?? "");
      if (!sql) throw new Error(`Preparação falhou ao copiar ${nome}.`);
      await admin.query(`USE \`${banco}\``);
      await admin.query(sql);
    }
    await admin.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    await admin.end();
  }

  const pool = mysql.createPool({
    host: alvo.hostname,
    port: porta,
    user: decodeURIComponent(alvo.username),
    password: decodeURIComponent(alvo.password),
    database: banco,
    waitForConnections: true,
    connectionLimit: 8,
    multipleStatements: true,
  });
  try {
    await pool.query("SELECT 1");
    await ensureFinanceiroNucleoSchema(pool);
    await ensureEstoqueOperacoesSchema(pool);
    await ensureEstoqueCapitalSchema(pool);
    await ensureSaudeEstoqueSchema(pool);
    await ensureManutencaoEstoqueSchema(pool);
  } catch (erro) {
    await pool.end();
    throw new Error(`Preparação da suíte ${suite} falhou: ${erro instanceof Error ? erro.message : "erro"}`);
  }

  const drizzleDb = drizzle(pool, { schema, mode: "default" });
  const store = createFinanceiroNucleoMysqlStore(drizzleDb);
  const service = createFinanceiroNucleoService(store);

  return {
    pool,
    store,
    service,
    async query<T = mysql.RowDataPacket[]>(sqlText: string, params: unknown[] = []) {
      const [rows] = await pool.query(sqlText, params);
      return rows as T;
    },
    async close() {
      await pool.end();
    },
  };
}

export async function resetFinanceiroMysqlHarness(h: FinanceiroMysqlHarness) {
  await h.pool.query(
    `UPDATE \`financeiro_movimentos\` SET \`movimento_original_id\` = NULL WHERE \`user_id\` IN (?, ?)`,
    [...FIN_USERS],
  );
  await h.pool.query(
    `UPDATE \`financeiro_liquidacoes\` SET \`liquidacao_original_id\` = NULL WHERE \`user_id\` IN (?, ?)`,
    [...FIN_USERS],
  );
  await h.pool.query(
    `UPDATE \`financeiro_transferencias\` SET \`transferencia_original_id\` = NULL WHERE \`user_id\` IN (?, ?)`,
    [...FIN_USERS],
  );
  const tables = [
    "financeiro_movimentos",
    "financeiro_liquidacao_alocacoes",
    "financeiro_liquidacoes",
    "financeiro_transferencias",
    "financeiro_apropriacoes",
    "financeiro_parcelas",
    "financeiro_titulos",
    "financeiro_centros_custo",
    "financeiro_categorias",
    "financeiro_contas",
  ];
  for (const table of tables) {
    await h.pool.query(`DELETE FROM \`${table}\` WHERE \`user_id\` IN (?, ?)`, [...FIN_USERS]);
  }
  await h.pool.query(
    `DELETE em FROM \`estoque_movimentacoes\` em
     INNER JOIN \`estoque_operacoes\` eo ON eo.id = em.operacao_id
     WHERE eo.user_id IN (?, ?)`,
    [...FIN_USERS],
  );
  await h.pool.query(`DELETE FROM \`estoque_movimentacoes\` WHERE \`user_id\` IN (?, ?)`, [...FIN_USERS]);
  await h.pool.query(`DELETE FROM \`estoque_operacoes\` WHERE \`user_id\` IN (?, ?)`, [...FIN_USERS]);
  await h.pool.query(
    `DELETE e FROM \`estoque\` e
     INNER JOIN \`fazendas\` f ON f.id = e.fazenda_id
     WHERE f.userId IN (?, ?)`,
    [...FIN_USERS],
  );
  await h.pool.query(`DELETE FROM \`saude_registros\` WHERE \`userId\` IN (?, ?)`, [...FIN_USERS]);
  await h.pool.query(
    `DELETE pecas FROM \`manutencao_pecas\` pecas
     INNER JOIN \`manutencoes\` m ON m.id = pecas.manutencaoId
     WHERE m.userId IN (?, ?)`,
    [...FIN_USERS],
  );
  await h.pool.query(`DELETE FROM \`manutencoes\` WHERE \`userId\` IN (?, ?)`, [...FIN_USERS]);
  await h.pool.query(`DELETE FROM \`maquinas\` WHERE \`userId\` IN (?, ?)`, [...FIN_USERS]);
  await h.pool.query(`DELETE FROM \`animais\` WHERE \`userId\` IN (?, ?)`, [...FIN_USERS]);
  await h.pool.query(`DELETE FROM \`pessoas\` WHERE \`user_id\` IN (?, ?)`, [...FIN_USERS]);
  await h.pool.query(`DELETE FROM \`fazendas\` WHERE \`userId\` IN (?, ?)`, [...FIN_USERS]);
}

export async function seedFinanceiroMysqlUsers(h: FinanceiroMysqlHarness) {
  await h.pool.query(
    `INSERT INTO \`pessoas\` (\`user_id\`, \`nome\`, \`tipo\`, \`ativo\`) VALUES (?, 'Fornecedor A', 'fornecedor', 1), (?, 'Cliente A', 'cliente', 1), (?, 'Fornecedor B', 'fornecedor', 1)`,
    [FIN_USER_A, FIN_USER_A, FIN_USER_B],
  );
  await h.pool.query(
    `INSERT INTO \`fazendas\` (\`userId\`, \`nome\`) VALUES (?, 'Fazenda A1'), (?, 'Fazenda A2'), (?, 'Fazenda B')`,
    [FIN_USER_A, FIN_USER_A, FIN_USER_B],
  );
}

export async function pessoaIdDe(h: FinanceiroMysqlHarness, userId: number, nome: string): Promise<number> {
  const rows = await h.query<{ id: number }[]>(
    `SELECT id FROM pessoas WHERE user_id = ? AND nome = ? LIMIT 1`,
    [userId, nome],
  );
  return Number(rows[0]?.id);
}

export async function fazendaIdDe(h: FinanceiroMysqlHarness, userId: number, nome: string): Promise<number> {
  const rows = await h.query<{ id: number }[]>(
    `SELECT id FROM fazendas WHERE userId = ? AND nome = ? LIMIT 1`,
    [userId, nome],
  );
  return Number(rows[0]?.id);
}

export async function legadoIntacto(h: FinanceiroMysqlHarness) {
  const contas = await h.query<{ n: number }[]>(`SELECT COUNT(*) n FROM contas_financeiras`);
  const movs = await h.query<{ n: number }[]>(`SELECT COUNT(*) n FROM movimentacoes`);
  return { contas: Number(contas[0]?.n), movs: Number(movs[0]?.n) };
}

/** Três contas e oito lançamentos sintéticos. O núcleo novo não pode apagá-los. */
export async function semearLegadoSintetico(h: FinanceiroMysqlHarness) {
  const atual = await legadoIntacto(h);
  if (atual.contas !== 0 || atual.movs !== 0) {
    throw new Error("O legado sintético encontrou resíduo. A suíte não está limpa.");
  }
  await h.pool.query(
    `INSERT INTO contas_financeiras (nome, tipo, saldo_inicial, saldo_atual, ativa) VALUES
      ('Conta sintética 1', 'caixa', 0, 0, 1),
      ('Conta sintética 2', 'caixa', 0, 0, 1),
      ('Conta sintética 3', 'caixa', 0, 0, 1)`,
  );
  const contas = await h.query<{ id: number }[]>("SELECT id FROM contas_financeiras ORDER BY id");
  const contaId = Number(contas[0]?.id);
  const valores = [1, 2, 3, 4, 5, 6, 7, 8];
  for (const valor of valores) {
    await h.pool.query(
      `INSERT INTO movimentacoes (conta_id, tipo, descricao, valor, data, status) VALUES (?, 'despesa', ?, ?, '2020-01-01', 'confirmado')`,
      [contaId, `Lançamento sintético ${valor}`, valor],
    );
  }
}
