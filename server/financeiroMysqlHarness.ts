import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { config } from "dotenv";
import * as schema from "../drizzle/schema";
import { createMysqlPool } from "./_core/mysqlPool";
import { ensureFinanceiroNucleoSchema } from "./ensureFinanceiroNucleoSchema";
import { ensureEstoqueOperacoesSchema } from "./ensureEstoqueOperacoesSchema";
import { ensureEstoqueCapitalSchema } from "./ensureEstoqueCapitalSchema";
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "./financeiroNucleo";

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

export async function openFinanceiroMysqlHarness(): Promise<FinanceiroMysqlHarness | null> {
  if (!process.env.DATABASE_URL) return null;
  let pool: mysql.Pool;
  try {
    pool = createMysqlPool(8);
    await pool.query("SELECT 1");
    await ensureFinanceiroNucleoSchema(pool);
    await ensureEstoqueOperacoesSchema(pool);
    await ensureEstoqueCapitalSchema(pool);
  } catch {
    return null;
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
