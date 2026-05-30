import mysql from "mysql2/promise";
import { env } from "./_core/env";

async function ensureColumn(
  pool: mysql.Pool,
  table: string,
  column: string,
  definition: string
) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  if ((rows as unknown[]).length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`[schema] Coluna adicionada: ${table}.${column}`);
  }
}

export async function ensureSchema() {
  const pool = mysql.createPool({ uri: env.DATABASE_URL, connectionLimit: 1 });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`pastos\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`userId\` int NOT NULL,
        \`fazendaId\` int NOT NULL,
        \`nome\` varchar(100) NOT NULL,
        \`sigla\` varchar(20),
        \`tipo\` varchar(80) DEFAULT 'Pasto',
        \`tipoPastagem\` varchar(80),
        \`area\` decimal(10,2),
        \`incluirArea\` boolean DEFAULT true,
        \`capacidade\` int,
        \`status\` enum('ativo','descanso','vazio') DEFAULT 'vazio',
        \`observacoes\` text,
        \`createdAt\` timestamp DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`lote_pasto_movimentacoes\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`userId\` int NOT NULL,
        \`loteId\` int NOT NULL,
        \`pastoOrigemId\` int,
        \`pastoDestinoId\` int,
        \`dataEntrada\` date NOT NULL,
        \`dataSaida\` date,
        \`diasNoPasto\` int,
        \`qtdAnimais\` int,
        \`observacoes\` text,
        \`createdAt\` timestamp DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`)
      )
    `);

    const [lotesTable] = await pool.query(`SHOW TABLES LIKE 'lotes'`);
    if ((lotesTable as unknown[]).length > 0) {
      await ensureColumn(pool, "lotes", "fazendaId", "int");
      await ensureColumn(pool, "lotes", "pastoAtualId", "int");
      await ensureColumn(pool, "lotes", "dataEntradaPasto", "date");
    }

    const [pastosTable] = await pool.query(`SHOW TABLES LIKE 'pastos'`);
    if ((pastosTable as unknown[]).length > 0) {
      await ensureColumn(pool, "pastos", "sigla", "varchar(20)");
      await ensureColumn(pool, "pastos", "tipoPastagem", "varchar(80)");
      await ensureColumn(pool, "pastos", "incluirArea", "boolean DEFAULT true");
    }
    console.log("[schema] Tabelas de pastos verificadas");
  } catch (err) {
    console.error("[schema] Falha ao garantir schema:", err);
    throw err;
  } finally {
    await pool.end();
  }
}
