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

/** Vínculo peça ↔ movimentação + histórico de estorno da OS. Sem backfill. */
export async function ensureManutencaoEstoqueSchema(pool: mysql.Pool) {
  if (await tableExists(pool, "manutencao_pecas")) {
    if (!(await columnExists(pool, "manutencao_pecas", "estoqueId"))) {
      await pool.query(`ALTER TABLE \`manutencao_pecas\` ADD COLUMN \`estoqueId\` int NULL`);
    }
    if (!(await columnExists(pool, "manutencao_pecas", "estoqueMovimentacaoId"))) {
      await pool.query(
        `ALTER TABLE \`manutencao_pecas\` ADD COLUMN \`estoqueMovimentacaoId\` int NULL`,
      );
    }
    if (!(await indexExists(pool, "manutencao_pecas", "manutencao_pecas_estoque_mov_idx"))) {
      await pool.query(
        `CREATE INDEX \`manutencao_pecas_estoque_mov_idx\` ON \`manutencao_pecas\` (\`estoqueMovimentacaoId\`)`,
      );
    }
  }

  if (await tableExists(pool, "manutencoes")) {
    if (!(await columnExists(pool, "manutencoes", "estornadoEm"))) {
      await pool.query(`ALTER TABLE \`manutencoes\` ADD COLUMN \`estornadoEm\` timestamp NULL`);
    }
    if (!(await columnExists(pool, "manutencoes", "motivoEstorno"))) {
      await pool.query(`ALTER TABLE \`manutencoes\` ADD COLUMN \`motivoEstorno\` text NULL`);
    }
  }
}
