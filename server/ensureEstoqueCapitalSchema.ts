import type mysql from "mysql2/promise";

async function tableExists(pool: mysql.Pool, table: string): Promise<boolean> {
  const [rows] = await pool.query(`SHOW TABLES LIKE ?`, [table]);
  return (rows as unknown[]).length > 0;
}

async function columnExists(pool: mysql.Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  return (rows as unknown[]).length > 0;
}

async function columnType(pool: mysql.Pool, table: string, column: string): Promise<string | null> {
  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  const col = (rows as { Type?: string }[])[0];
  return col?.Type ?? null;
}

/** Infra de capital. Sem backfill. Sem inicializar registros reais. */
export async function ensureEstoqueCapitalSchema(pool: mysql.Pool) {
  if (await tableExists(pool, "estoque")) {
    if (!(await columnExists(pool, "estoque", "valor_total_estoque"))) {
      await pool.query(
        `ALTER TABLE \`estoque\` ADD COLUMN \`valor_total_estoque\` decimal(14,2) NULL AFTER \`valor_unitario\``,
      );
    }
    if (!(await columnExists(pool, "estoque", "capital_inicializado_em"))) {
      await pool.query(
        `ALTER TABLE \`estoque\` ADD COLUMN \`capital_inicializado_em\` timestamp NULL AFTER \`valor_total_estoque\``,
      );
    }
    const tipoUnitario = await columnType(pool, "estoque", "valor_unitario");
    if (tipoUnitario && !/decimal\(18,\s*6\)/i.test(tipoUnitario)) {
      await pool.query(`ALTER TABLE \`estoque\` MODIFY COLUMN \`valor_unitario\` decimal(18,6) NULL`);
    }
  }

  if (await tableExists(pool, "estoque_movimentacoes")) {
    if (!(await columnExists(pool, "estoque_movimentacoes", "valor_estoque_movimentado"))) {
      await pool.query(
        `ALTER TABLE \`estoque_movimentacoes\` ADD COLUMN \`valor_estoque_movimentado\` decimal(14,2) NULL AFTER \`valor\``,
      );
    }
  }
}
