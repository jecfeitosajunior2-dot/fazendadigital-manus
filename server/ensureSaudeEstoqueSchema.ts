import type mysql from "mysql2/promise";

async function tableExists(pool: mysql.Pool, table: string): Promise<boolean> {
  const [rows] = await pool.query(`SHOW TABLES LIKE ?`, [table]);
  return (rows as unknown[]).length > 0;
}

async function columnExists(pool: mysql.Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  return (rows as unknown[]).length > 0;
}

async function indexExists(pool: mysql.Pool, table: string, keyName: string): Promise<boolean> {
  const [rows] = await pool.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [keyName]);
  return (rows as unknown[]).length > 0;
}

/** Ciclo de vida sanitário + vínculo com movimentação. Sem backfill. */
export async function ensureSaudeEstoqueSchema(pool: mysql.Pool) {
  if (!(await tableExists(pool, "saude_registros"))) return;

  if (!(await columnExists(pool, "saude_registros", "estoqueMovimentacaoId"))) {
    await pool.query(
      `ALTER TABLE \`saude_registros\` ADD COLUMN \`estoqueMovimentacaoId\` int NULL`,
    );
  }
  if (!(await columnExists(pool, "saude_registros", "status"))) {
    await pool.query(
      `ALTER TABLE \`saude_registros\` ADD COLUMN \`status\` varchar(20) NOT NULL DEFAULT 'ativo'`,
    );
  }
  if (!(await columnExists(pool, "saude_registros", "estornadoEm"))) {
    await pool.query(
      `ALTER TABLE \`saude_registros\` ADD COLUMN \`estornadoEm\` timestamp NULL`,
    );
  }
  if (!(await columnExists(pool, "saude_registros", "motivoEstorno"))) {
    await pool.query(
      `ALTER TABLE \`saude_registros\` ADD COLUMN \`motivoEstorno\` text NULL`,
    );
  }
  if (!(await indexExists(pool, "saude_registros", "saude_registros_estoque_mov_idx"))) {
    await pool.query(
      `CREATE INDEX \`saude_registros_estoque_mov_idx\` ON \`saude_registros\` (\`estoqueMovimentacaoId\`)`,
    );
  }
  if (!(await indexExists(pool, "saude_registros", "saude_registros_status_idx"))) {
    await pool.query(
      `CREATE INDEX \`saude_registros_status_idx\` ON \`saude_registros\` (\`status\`)`,
    );
  }
}
