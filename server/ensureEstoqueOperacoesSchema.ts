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

async function foreignKeyExists(pool: mysql.Pool, table: string, constraintName: string): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [table, constraintName],
  );
  return (rows as unknown[]).length > 0;
}

/** Cabeçalho comercial de estoque. Sem backfill. Sem títulos. */
export async function ensureEstoqueOperacoesSchema(pool: mysql.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`estoque_operacoes\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`user_id\` int NOT NULL,
      \`fazenda_id\` int NOT NULL,
      \`tipo\` varchar(40) NOT NULL,
      \`motivo\` varchar(40) NOT NULL,
      \`data_operacao\` date NOT NULL,
      \`fornecedor_id\` int DEFAULT NULL,
      \`fornecedor_nome_snapshot\` varchar(255) DEFAULT NULL,
      \`numero_nf\` varchar(60) DEFAULT NULL,
      \`referencia\` varchar(120) DEFAULT NULL,
      \`valor_mercadorias\` decimal(12,2) NOT NULL,
      \`valor_frete\` decimal(12,2) NOT NULL DEFAULT '0.00',
      \`valor_total\` decimal(12,2) NOT NULL,
      \`frete_credor_id\` int DEFAULT NULL,
      \`frete_credor_nome_snapshot\` varchar(255) DEFAULT NULL,
      \`status\` varchar(20) NOT NULL DEFAULT 'confirmada',
      \`estornada_em\` timestamp NULL DEFAULT NULL,
      \`motivo_estorno\` varchar(255) DEFAULT NULL,
      \`idempotency_key\` varchar(80) NOT NULL,
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`estoque_operacoes_idem_uq\` (\`user_id\`, \`idempotency_key\`),
      KEY \`estoque_operacoes_user_idx\` (\`user_id\`),
      KEY \`estoque_operacoes_fazenda_idx\` (\`fazenda_id\`),
      KEY \`estoque_operacoes_fornecedor_idx\` (\`fornecedor_id\`)
    )
  `);

  if (!(await columnExists(pool, "estoque_operacoes", "fazenda_destino_id"))) {
    await pool.query(
      `ALTER TABLE \`estoque_operacoes\` ADD COLUMN \`fazenda_destino_id\` int NULL AFTER \`fazenda_id\``,
    );
  }
  if (!(await indexExists(pool, "estoque_operacoes", "estoque_operacoes_fazenda_destino_idx"))) {
    await pool.query(
      `CREATE INDEX \`estoque_operacoes_fazenda_destino_idx\` ON \`estoque_operacoes\` (\`fazenda_destino_id\`)`,
    );
  }

  if (await tableExists(pool, "estoque_movimentacoes")) {
    if (!(await columnExists(pool, "estoque_movimentacoes", "operacao_id"))) {
      await pool.query(`ALTER TABLE \`estoque_movimentacoes\` ADD COLUMN \`operacao_id\` int NULL AFTER \`grupo_id\``);
    }
    if (!(await indexExists(pool, "estoque_movimentacoes", "estoque_movimentacoes_operacao_idx"))) {
      await pool.query(`CREATE INDEX \`estoque_movimentacoes_operacao_idx\` ON \`estoque_movimentacoes\` (\`operacao_id\`)`);
    }
    if (!(await foreignKeyExists(pool, "estoque_movimentacoes", "estoque_movimentacoes_operacao_fk"))) {
      await pool.query(`
        ALTER TABLE \`estoque_movimentacoes\`
          ADD CONSTRAINT \`estoque_movimentacoes_operacao_fk\`
            FOREIGN KEY (\`operacao_id\`) REFERENCES \`estoque_operacoes\` (\`id\`)
      `);
    }
  }
}
