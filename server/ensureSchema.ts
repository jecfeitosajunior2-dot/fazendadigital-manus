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

    const [benfTable] = await pool.query(`SHOW TABLES LIKE 'benfeitorias'`);
    if ((benfTable as unknown[]).length > 0) {
      await ensureColumn(pool, "benfeitorias", "anoConstrucao", "int");
      await ensureColumn(pool, "benfeitorias", "vidaUtil", "varchar(50)");
      await ensureColumn(pool, "benfeitorias", "fazendaId", "int");
      await ensureColumn(pool, "benfeitorias", "percentualAtividade", "decimal(5,2)");
      await ensureColumn(pool, "benfeitorias", "imagem1", "text");
      await ensureColumn(pool, "benfeitorias", "imagem2", "text");
      await ensureColumn(pool, "benfeitorias", "imagem3", "text");
    }

    const [estoqueTable] = await pool.query(`SHOW TABLES LIKE 'estoque'`);
    if ((estoqueTable as unknown[]).length > 0) {
      await ensureColumn(pool, "estoque", "subcategoria", "varchar(80)");
      await ensureColumn(pool, "estoque", "quantidade_maxima", "decimal(10,2)");
      await ensureColumn(pool, "estoque", "fabricante", "varchar(100)");
      await ensureColumn(pool, "estoque", "identificador_unico", "varchar(100)");
      await ensureColumn(pool, "estoque", "produzido_na_fazenda", "boolean DEFAULT false");
      await ensureColumn(pool, "estoque", "monitorar_estoque", "boolean DEFAULT false");
      await ensureColumn(pool, "estoque", "situacao", "varchar(20) DEFAULT 'ativo'");
      await ensureColumn(pool, "estoque", "embalagens", "text");
      await ensureColumn(pool, "estoque", "possui_carencia", "boolean DEFAULT false");
      await ensureColumn(pool, "estoque", "carencia_abate_dias", "int");
      await ensureColumn(pool, "estoque", "carencia_abate_unidade", "varchar(8) DEFAULT 'd'");
      await ensureColumn(pool, "estoque", "carencia_leite_dias", "int");
      await ensureColumn(pool, "estoque", "observacoes_carencia", "text");
    }

    const [maquinasTable] = await pool.query(`SHOW TABLES LIKE 'maquinas'`);
    if ((maquinasTable as unknown[]).length > 0) {
      await ensureColumn(pool, "maquinas", "fazendaId", "int");
      await ensureColumn(pool, "maquinas", "valor", "decimal(12,2)");
      await ensureColumn(pool, "maquinas", "anoAquisicao", "int");
      await ensureColumn(pool, "maquinas", "vidaUtil", "varchar(50)");
      await ensureColumn(pool, "maquinas", "dataDesativacao", "date");
      await ensureColumn(pool, "maquinas", "estado", "varchar(20)");
      await ensureColumn(pool, "maquinas", "imagem1", "text");
      await ensureColumn(pool, "maquinas", "imagem2", "text");
      await ensureColumn(pool, "maquinas", "imagem3", "text");
    }
  } catch (err) {
    console.error("[schema] Falha ao garantir schema:", err);
    throw err;
  } finally {
    await pool.end();
  }
}
