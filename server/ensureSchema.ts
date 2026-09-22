import mysql from "mysql2/promise";
import { createMysqlPool } from "./_core/mysqlPool";

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

async function indexExists(pool: mysql.Pool, table: string, keyName: string): Promise<boolean> {
  const [rows] = await pool.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [keyName]);
  return (rows as unknown[]).length > 0;
}

/**
 * Rastreio de cancelamento de venda: vendaId + status da baixa,
 * no máximo uma baixa ATIVA por animal (índice funcional MySQL 8.4).
 * Idempotente. Não apaga baixa. Só vincula ids 3 e 4 à Venda #1 quando inequívoco.
 */
async function ensureAnimalBaixasVendaRastreio(pool: mysql.Pool) {
  if (!(await tableExists(pool, "animal_baixas"))) return;

  await ensureColumn(pool, "animal_baixas", "vendaId", "int");
  await ensureColumn(
    pool,
    "animal_baixas",
    "status",
    "enum('ativa','estornada') NOT NULL DEFAULT 'ativa'",
  );

  if (!(await indexExists(pool, "animal_baixas", "animal_baixas_venda_idx"))) {
    await pool.query("CREATE INDEX `animal_baixas_venda_idx` ON `animal_baixas` (`vendaId`)");
    console.log("[schema] Índice adicionado: animal_baixas.animal_baixas_venda_idx");
  }
  if (!(await indexExists(pool, "animal_baixas", "animal_baixas_animal_status_idx"))) {
    await pool.query(
      "CREATE INDEX `animal_baixas_animal_status_idx` ON `animal_baixas` (`animalId`, `status`)",
    );
    console.log("[schema] Índice adicionado: animal_baixas.animal_baixas_animal_status_idx");
  }

  if (await tableExists(pool, "venda_itens")) {
    const [result] = await pool.query(`
      UPDATE \`animal_baixas\` b
      INNER JOIN \`venda_itens\` i
        ON i.animal_id = b.animalId
       AND i.venda_id = 1
      SET b.vendaId = 1
      WHERE b.id IN (3, 4)
        AND b.tipo = 'venda'
        AND TRIM(b.motivo) = 'Venda #1'
        AND b.animalId IN (25, 26)
        AND b.vendaId IS NULL
    `);
    const filled = updateAffectedRows(result);
    if (filled > 0) {
      console.log(`[schema] animal_baixas.vendaId preenchido para ${filled} baixa(s) da Venda #1`);
    }
  }

  if (await indexExists(pool, "animal_baixas", "animal_baixas_animal_uq")) {
    await pool.query("ALTER TABLE `animal_baixas` DROP INDEX `animal_baixas_animal_uq`");
    console.log("[schema] Índice removido: animal_baixas.animal_baixas_animal_uq");
  }

  if (!(await indexExists(pool, "animal_baixas", "animal_baixas_animal_ativa_uq"))) {
    await pool.query(`
      CREATE UNIQUE INDEX \`animal_baixas_animal_ativa_uq\`
        ON \`animal_baixas\` ((CASE WHEN \`status\` = 'ativa' THEN \`animalId\` END))
    `);
    console.log("[schema] Índice único funcional adicionado: animal_baixas.animal_baixas_animal_ativa_uq");
  }
}

async function tableExists(pool: mysql.Pool, table: string): Promise<boolean> {
  const [rows] = await pool.query(`SHOW TABLES LIKE ?`, [table]);
  return (rows as unknown[]).length > 0;
}

async function getColumnNullability(
  pool: mysql.Pool,
  table: string,
  column: string,
): Promise<{ exists: boolean; nullable: boolean }> {
  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  const col = (rows as { Null?: string }[])[0];
  if (!col) return { exists: false, nullable: true };
  return { exists: true, nullable: String(col.Null).toUpperCase() === "YES" };
}

async function tableHasColumn(
  pool: mysql.Pool,
  table: string,
  column: string,
): Promise<boolean> {
  if (!(await tableExists(pool, table))) return false;
  return (await getColumnNullability(pool, table, column)).exists;
}

function updateAffectedRows(result: unknown): number {
  const n = (result as mysql.ResultSetHeader | undefined)?.affectedRows;
  return typeof n === "number" ? n : 0;
}

async function countLotesSemUserId(pool: mysql.Pool): Promise<number> {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM `lotes` WHERE `userId` IS NULL",
  );
  return Number((rows as { total: number }[])[0]?.total ?? 0);
}

async function backfillLotesUserIdFromFazendas(pool: mysql.Pool): Promise<number> {
  const ready =
    (await tableHasColumn(pool, "lotes", "fazendaId")) &&
    (await tableHasColumn(pool, "fazendas", "userId"));
  if (!ready) return 0;

  const [result] = await pool.query(`
    UPDATE \`lotes\` l
    INNER JOIN \`fazendas\` f ON f.id = l.fazendaId
    SET l.userId = f.userId
    WHERE l.userId IS NULL
      AND l.fazendaId IS NOT NULL
      AND f.userId IS NOT NULL
  `);
  return updateAffectedRows(result);
}

async function backfillLotesUserIdFromPastos(pool: mysql.Pool): Promise<number> {
  const ready =
    (await tableHasColumn(pool, "lotes", "pastoAtualId")) &&
    (await tableHasColumn(pool, "pastos", "userId"));
  if (!ready) return 0;

  const [result] = await pool.query(`
    UPDATE \`lotes\` l
    INNER JOIN \`pastos\` p ON p.id = l.pastoAtualId
    SET l.userId = p.userId
    WHERE l.userId IS NULL
      AND l.pastoAtualId IS NOT NULL
      AND p.userId IS NOT NULL
  `);
  return updateAffectedRows(result);
}

async function backfillLotesUserIdFromAnimais(pool: mysql.Pool): Promise<number> {
  const ready =
    (await tableHasColumn(pool, "animais", "loteId")) &&
    (await tableHasColumn(pool, "animais", "userId"));
  if (!ready) return 0;

  const [ambiguous] = await pool.query(`
    SELECT COUNT(*) AS total
    FROM \`lotes\` l
    INNER JOIN (
      SELECT \`loteId\`
      FROM \`animais\`
      WHERE \`loteId\` IS NOT NULL AND \`userId\` IS NOT NULL
      GROUP BY \`loteId\`
      HAVING COUNT(DISTINCT \`userId\`) > 1
    ) amb ON amb.loteId = l.id
    WHERE l.userId IS NULL
  `);
  const ambiguousCount = Number((ambiguous as { total: number }[])[0]?.total ?? 0);
  if (ambiguousCount > 0) {
    console.warn(
      `[schema] WARNING: ${ambiguousCount} lotes sem proprietário por animais com mais de um userId`,
    );
  }

  const [result] = await pool.query(`
    UPDATE \`lotes\` l
    INNER JOIN (
      SELECT \`loteId\`, \`userId\`
      FROM \`animais\`
      WHERE \`loteId\` IS NOT NULL AND \`userId\` IS NOT NULL
      GROUP BY \`loteId\`, \`userId\`
    ) src ON src.loteId = l.id
    INNER JOIN (
      SELECT \`loteId\`
      FROM \`animais\`
      WHERE \`loteId\` IS NOT NULL AND \`userId\` IS NOT NULL
      GROUP BY \`loteId\`
      HAVING COUNT(DISTINCT \`userId\`) = 1
    ) unico ON unico.loteId = l.id
    SET l.userId = src.userId
    WHERE l.userId IS NULL
  `);
  return updateAffectedRows(result);
}

async function backfillLotesUserIdFromHistoricoPasto(pool: mysql.Pool): Promise<number> {
  const ready =
    (await tableHasColumn(pool, "lote_pasto_movimentacoes", "loteId")) &&
    (await tableHasColumn(pool, "lote_pasto_movimentacoes", "userId"));
  if (!ready) return 0;

  const [ambiguous] = await pool.query(`
    SELECT COUNT(*) AS total
    FROM \`lotes\` l
    INNER JOIN (
      SELECT \`loteId\`
      FROM \`lote_pasto_movimentacoes\`
      WHERE \`loteId\` IS NOT NULL AND \`userId\` IS NOT NULL
      GROUP BY \`loteId\`
      HAVING COUNT(DISTINCT \`userId\`) > 1
    ) amb ON amb.loteId = l.id
    WHERE l.userId IS NULL
  `);
  const ambiguousCount = Number((ambiguous as { total: number }[])[0]?.total ?? 0);
  if (ambiguousCount > 0) {
    console.warn(
      `[schema] WARNING: ${ambiguousCount} lotes sem proprietário por histórico de pasto com mais de um userId`,
    );
  }

  const [result] = await pool.query(`
    UPDATE \`lotes\` l
    INNER JOIN (
      SELECT \`loteId\`, \`userId\`
      FROM \`lote_pasto_movimentacoes\`
      WHERE \`loteId\` IS NOT NULL AND \`userId\` IS NOT NULL
      GROUP BY \`loteId\`, \`userId\`
    ) src ON src.loteId = l.id
    INNER JOIN (
      SELECT \`loteId\`
      FROM \`lote_pasto_movimentacoes\`
      WHERE \`loteId\` IS NOT NULL AND \`userId\` IS NOT NULL
      GROUP BY \`loteId\`
      HAVING COUNT(DISTINCT \`userId\`) = 1
    ) unico ON unico.loteId = l.id
    SET l.userId = src.userId
    WHERE l.userId IS NULL
  `);
  return updateAffectedRows(result);
}

async function logLotesUserIdInconsistencias(pool: mysql.Pool) {
  try {
    if (
      (await tableHasColumn(pool, "lotes", "fazendaId")) &&
      (await tableHasColumn(pool, "fazendas", "userId")) &&
      (await tableHasColumn(pool, "lotes", "pastoAtualId")) &&
      (await tableHasColumn(pool, "pastos", "userId"))
    ) {
      const [rows] = await pool.query(`
        SELECT COUNT(*) AS total
        FROM \`lotes\` l
        INNER JOIN \`fazendas\` f ON f.id = l.fazendaId
        INNER JOIN \`pastos\` p ON p.id = l.pastoAtualId
        WHERE l.userId IS NOT NULL
          AND f.userId IS NOT NULL
          AND p.userId IS NOT NULL
          AND f.userId <> p.userId
      `);
      const total = Number((rows as { total: number }[])[0]?.total ?? 0);
      if (total > 0) {
        console.warn(
          `[schema] WARNING: ${total} lotes com fazenda e pasto atual de usuários diferentes; userId existente preservado`,
        );
      }
    }
  } catch {
    /* tabelas/colunas auxiliares ausentes */
  }
}

/**
 * Compatibilidade de banco legado: `lotes.userId` existe no schema.ts,
 * mas migrations antigas e o ensureSchema anterior não criavam a coluna.
 * Idempotente. Nunca recria lote, nunca inventa userId e nunca sobrescreve dono já preenchido.
 */
async function ensureLotesUserId(pool: mysql.Pool) {
  const current = await getColumnNullability(pool, "lotes", "userId");

  if (current.exists && !current.nullable) {
    return;
  }

  if (!current.exists) {
    await pool.query("ALTER TABLE `lotes` ADD COLUMN `userId` int NULL");
    console.log("[schema] lotes.userId adicionada para compatibilidade com banco legado");
  }

  let filled = 0;
  const sources: Array<[string, (pool: mysql.Pool) => Promise<number>]> = [
    ["fazenda", backfillLotesUserIdFromFazendas],
    ["pasto", backfillLotesUserIdFromPastos],
    ["animais", backfillLotesUserIdFromAnimais],
    ["historico", backfillLotesUserIdFromHistoricoPasto],
  ];
  for (const [label, run] of sources) {
    try {
      filled += await run(pool);
    } catch {
      console.warn(`[schema] lotes.userId: fonte ${label} indisponível, ignorada`);
    }
  }

  if (filled > 0) {
    console.log(`[schema] lotes.userId preenchida para ${filled} lotes`);
  }

  await logLotesUserIdInconsistencias(pool);

  const remaining = await countLotesSemUserId(pool);
  if (remaining === 0) {
    await pool.query("ALTER TABLE `lotes` MODIFY COLUMN `userId` int NOT NULL");
    console.log("[schema] lotes.userId definida como NOT NULL");
    return;
  }

  console.warn(
    `[schema] WARNING: ${remaining} lotes permanecem sem proprietário identificável`,
  );
}

export async function ensureSchema() {
  const pool = createMysqlPool(1);
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
        \`status\` enum('ativo','descanso','vazio','reforma','interditado','reserva','sem_uso') DEFAULT 'ativo',
        \`coordenadas\` text,
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`animal_lote_movimentacoes\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`userId\` int NOT NULL,
        \`animalId\` int NOT NULL,
        \`loteOrigemId\` int,
        \`loteDestinoId\` int NOT NULL,
        \`pastoOrigemId\` int,
        \`pastoDestinoId\` int,
        \`fazendaId\` int,
        \`fazendaOrigemId\` int,
        \`dataMovimentacao\` date NOT NULL,
        \`usuarioNome\` varchar(200),
        \`observacoes\` text,
        \`createdAt\` timestamp DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`)
      )
    `);

    const [animalLoteMovTable] = await pool.query(`SHOW TABLES LIKE 'animal_lote_movimentacoes'`);
    if ((animalLoteMovTable as unknown[]).length > 0) {
      await ensureColumn(pool, "animal_lote_movimentacoes", "pastoOrigemId", "int");
      await ensureColumn(pool, "animal_lote_movimentacoes", "pastoDestinoId", "int");
      await ensureColumn(pool, "animal_lote_movimentacoes", "fazendaId", "int");
      await ensureColumn(pool, "animal_lote_movimentacoes", "fazendaOrigemId", "int");
      await ensureColumn(pool, "animal_lote_movimentacoes", "observacoes", "text");
      const [origemCols] = await pool.query(
        "SHOW COLUMNS FROM `animal_lote_movimentacoes` LIKE 'loteOrigemId'",
      );
      const origemCol = (origemCols as { Null?: string }[])[0];
      if (origemCol && String(origemCol.Null).toUpperCase() === "NO") {
        await pool.query(
          "ALTER TABLE `animal_lote_movimentacoes` MODIFY COLUMN `loteOrigemId` int NULL",
        );
        console.log("[schema] Coluna ajustada: animal_lote_movimentacoes.loteOrigemId (nullable)");
      }
    }

    const [fazendasTable] = await pool.query(`SHOW TABLES LIKE 'fazendas'`);
    if ((fazendasTable as unknown[]).length > 0) {
      await ensureColumn(pool, "fazendas", "atividadePrincipal", "varchar(50)");
      await ensureColumn(pool, "fazendas", "atividadeLeite", "boolean DEFAULT false");
      await ensureColumn(pool, "fazendas", "atividadeAgricultura", "boolean DEFAULT false");
      await ensureColumn(pool, "fazendas", "atividadeOutros", "boolean DEFAULT false");
      await ensureColumn(pool, "fazendas", "quantidadeAnimais", "int");
      await ensureColumn(pool, "fazendas", "numeroCar", "varchar(80)");
      await ensureColumn(pool, "fazendas", "matriculaImovel", "varchar(80)");
      await ensureColumn(pool, "fazendas", "matriculasImovel", "text");
      await ensureColumn(pool, "fazendas", "tipoPosse", "varchar(50)");
      await ensureColumn(pool, "fazendas", "fonteEnergia", "varchar(80)");
      await ensureColumn(pool, "fazendas", "fonteAgua", "varchar(80)");
      await ensureColumn(pool, "fazendas", "responsavelOperacionalNome", "varchar(200)");
      await ensureColumn(pool, "fazendas", "responsavelOperacionalTelefone", "varchar(40)");
      await ensureColumn(pool, "fazendas", "responsavelOperacionalFuncao", "varchar(80)");
    }

    const [lotesTable] = await pool.query(`SHOW TABLES LIKE 'lotes'`);
    if ((lotesTable as unknown[]).length > 0) {
      await ensureColumn(pool, "lotes", "fazendaId", "int");
      await ensureColumn(pool, "lotes", "pastoAtualId", "int");
      await ensureColumn(pool, "lotes", "dataEntradaPasto", "date");
      await ensureColumn(pool, "lotes", "sigla", "varchar(20)");
      await ensureColumn(pool, "lotes", "dataCriacao", "date");
      await ensureLotesUserId(pool);
    }

    const [pastosTable] = await pool.query(`SHOW TABLES LIKE 'pastos'`);
    if ((pastosTable as unknown[]).length > 0) {
      await ensureColumn(pool, "pastos", "sigla", "varchar(20)");
      await ensureColumn(pool, "pastos", "tipoPastagem", "varchar(80)");
      await ensureColumn(pool, "pastos", "incluirArea", "boolean DEFAULT true");
      await ensureColumn(pool, "pastos", "coordenadas", "text");
      await pool.query(
        "ALTER TABLE `pastos` MODIFY COLUMN `status` enum('ativo','descanso','vazio','reforma','interditado','reserva','sem_uso') DEFAULT 'ativo'"
      );
    }
    console.log("[schema] Tabelas de pastos verificadas");

    const [benfTable] = await pool.query(`SHOW TABLES LIKE 'benfeitorias'`);
    if ((benfTable as unknown[]).length > 0) {
      await ensureColumn(pool, "benfeitorias", "userId", "int");
      await ensureColumn(pool, "benfeitorias", "anoConstrucao", "int");
      await ensureColumn(pool, "benfeitorias", "vidaUtil", "varchar(50)");
      await ensureColumn(pool, "benfeitorias", "fazendaId", "int");
      await ensureColumn(pool, "benfeitorias", "estado", "varchar(50)");
      await ensureColumn(pool, "benfeitorias", "percentualAtividade", "decimal(5,2)");
      await ensureColumn(pool, "benfeitorias", "valorEstimado", "decimal(12,2)");
      await ensureColumn(pool, "benfeitorias", "dataInstalacao", "date");
      await ensureColumn(pool, "benfeitorias", "imagem1", "longtext");
      await ensureColumn(pool, "benfeitorias", "imagem2", "longtext");
      await ensureColumn(pool, "benfeitorias", "imagem3", "longtext");
      try {
        await pool.query("ALTER TABLE `benfeitorias` MODIFY COLUMN `imagem1` longtext");
        await pool.query("ALTER TABLE `benfeitorias` MODIFY COLUMN `imagem2` longtext");
        await pool.query("ALTER TABLE `benfeitorias` MODIFY COLUMN `imagem3` longtext");
      } catch { /* colunas ausentes */ }
      await ensureColumn(pool, "benfeitorias", "createdAt", "timestamp DEFAULT CURRENT_TIMESTAMP");
      await ensureColumn(pool, "benfeitorias", "updatedAt", "timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
      // Migra dados de colunas legadas (snake_case) se existirem
      try {
        await pool.query(
          "UPDATE `benfeitorias` SET `valorEstimado` = `valor_estimado` WHERE `valorEstimado` IS NULL AND `valor_estimado` IS NOT NULL"
        );
      } catch { /* coluna legada ausente */ }
      try {
        await pool.query(
          "UPDATE `benfeitorias` SET `createdAt` = `created_at` WHERE `createdAt` IS NULL AND `created_at` IS NOT NULL"
        );
      } catch { /* coluna legada ausente */ }
    }

    const [estoqueTable] = await pool.query(`SHOW TABLES LIKE 'estoque'`);
    if ((estoqueTable as unknown[]).length > 0) {
      await ensureColumn(pool, "estoque", "subcategoria", "varchar(80)");
      await ensureColumn(pool, "estoque", "quantidade_maxima", "decimal(10,2)");
      await ensureColumn(pool, "estoque", "fabricante", "varchar(100)");
      await ensureColumn(pool, "estoque", "identificador_unico", "varchar(100)");
      await ensureColumn(pool, "estoque", "produzido_na_fazenda", "boolean DEFAULT false");
      await ensureColumn(pool, "estoque", "monitorar_estoque", "boolean DEFAULT false");
      await ensureColumn(pool, "estoque", "controlar_saldo", "boolean DEFAULT true");
      await ensureColumn(pool, "estoque", "situacao", "varchar(20) DEFAULT 'ativo'");
      await ensureColumn(pool, "estoque", "embalagens", "text");
      await ensureColumn(pool, "estoque", "possui_carencia", "boolean DEFAULT false");
      await ensureColumn(pool, "estoque", "carencia_abate_dias", "int");
      await ensureColumn(pool, "estoque", "carencia_abate_unidade", "varchar(8) DEFAULT 'd'");
      await ensureColumn(pool, "estoque", "carencia_leite_dias", "int");
      await ensureColumn(pool, "estoque", "observacoes_carencia", "text");
      await ensureColumn(pool, "estoque", "fazenda_id", "int");
      await ensureColumn(pool, "estoque", "produto_id", "int");
      await ensureColumn(pool, "estoque", "valor_unitario", "decimal(10,2)");
      await ensureColumn(pool, "estoque", "localizacao", "varchar(200)");
      await ensureColumn(pool, "estoque", "observacoes", "text");
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`produtos_catalogo\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`nome\` varchar(100) NOT NULL,
        \`categoria\` varchar(50),
        \`subcategoria\` varchar(80),
        \`unidade\` varchar(20),
        \`fabricante\` varchar(100),
        \`identificador_unico\` varchar(100),
        \`produzido_na_fazenda\` boolean DEFAULT false,
        \`monitorar_estoque\` boolean DEFAULT false,
        \`controlar_saldo\` boolean DEFAULT true,
        \`situacao\` varchar(20) DEFAULT 'ativo',
        \`embalagens\` text,
        \`possui_carencia\` boolean DEFAULT false,
        \`carencia_abate_dias\` int,
        \`carencia_abate_unidade\` varchar(8) DEFAULT 'd',
        \`carencia_leite_dias\` int,
        \`observacoes_carencia\` text,
        \`observacoes\` text,
        \`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`)
      )
    `);

    const [catalogoTable] = await pool.query(`SHOW TABLES LIKE 'produtos_catalogo'`);
    if ((catalogoTable as unknown[]).length > 0) {
      await ensureColumn(pool, "produtos_catalogo", "controlar_saldo", "boolean DEFAULT true");
    }

    // Backfill: estoque sem produto_id → cria/reusa catálogo
    try {
      const [orphans] = await pool.query(
        `SELECT id, nome, categoria, subcategoria, unidade, fabricante, identificador_unico,
                produzido_na_fazenda, monitorar_estoque, situacao, embalagens,
                possui_carencia, carencia_abate_dias, carencia_abate_unidade,
                carencia_leite_dias, observacoes_carencia, observacoes
         FROM estoque
         WHERE produto_id IS NULL
         ORDER BY id ASC`
      );
      const rows = orphans as Array<Record<string, unknown>>;
      const chaveToProdutoId = new Map<string, number>();
      for (const row of rows) {
        const chave = [
          String(row.nome ?? "").trim().toLowerCase(),
          String(row.unidade ?? "").trim().toLowerCase(),
          String(row.categoria ?? "").trim().toLowerCase(),
        ].join("|");
        let produtoId = chaveToProdutoId.get(chave);
        if (!produtoId) {
          const [ins] = await pool.query(
            `INSERT INTO produtos_catalogo
              (nome, categoria, subcategoria, unidade, fabricante, identificador_unico,
               produzido_na_fazenda, monitorar_estoque, situacao, embalagens,
               possui_carencia, carencia_abate_dias, carencia_abate_unidade,
               carencia_leite_dias, observacoes_carencia, observacoes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              row.nome,
              row.categoria ?? null,
              row.subcategoria ?? null,
              row.unidade ?? null,
              row.fabricante ?? null,
              row.identificador_unico ?? null,
              row.produzido_na_fazenda ?? false,
              row.monitorar_estoque ?? false,
              row.situacao ?? "ativo",
              row.embalagens ?? null,
              row.possui_carencia ?? false,
              row.carencia_abate_dias ?? null,
              row.carencia_abate_unidade ?? "d",
              row.carencia_leite_dias ?? null,
              row.observacoes_carencia ?? null,
              row.observacoes ?? null,
            ]
          );
          produtoId = Number((ins as { insertId?: number }).insertId);
          if (produtoId) chaveToProdutoId.set(chave, produtoId);
        }
        if (produtoId) {
          await pool.query(`UPDATE estoque SET produto_id = ? WHERE id = ?`, [produtoId, row.id]);
        }
      }
    } catch {
      /* tabela/coluna ainda indisponível */
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`estoque_movimentacoes\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`estoque_id\` int NOT NULL,
        \`data_movimentacao\` date NOT NULL,
        \`quantidade\` decimal(12,2) NOT NULL,
        \`data_validade\` date,
        \`observacoes\` text,
        \`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`)
      )
    `);

    await ensureColumn(pool, "estoque_movimentacoes", "fazenda_id", "int");
    await ensureColumn(pool, "estoque_movimentacoes", "grupo_id", "varchar(40)");
    await ensureColumn(pool, "estoque_movimentacoes", "abastecimento_id", "int");
    await ensureColumn(pool, "estoque_movimentacoes", "user_id", "int");
    await ensureColumn(pool, "estoque_movimentacoes", "registrado_por", "varchar(150)");
    await ensureColumn(pool, "estoque_movimentacoes", "tipo", "varchar(40)");
    await ensureColumn(pool, "estoque_movimentacoes", "destino", "varchar(150)");
    await ensureColumn(pool, "estoque_movimentacoes", "manejo", "varchar(150)");
    await ensureColumn(pool, "estoque_movimentacoes", "nota_fiscal", "varchar(60)");
    await ensureColumn(pool, "estoque_movimentacoes", "frete", "decimal(12,2)");
    await ensureColumn(pool, "estoque_movimentacoes", "fornecedor", "varchar(150)");
    await ensureColumn(pool, "estoque_movimentacoes", "valor", "decimal(12,2)");
    await ensureColumn(pool, "estoque_movimentacoes", "status", "varchar(20) DEFAULT 'ativa'");
    await ensureColumn(pool, "estoque_movimentacoes", "original_grupo_id", "varchar(40)");
    await ensureColumn(pool, "estoque_movimentacoes", "motivo_estorno", "varchar(255)");
    await ensureColumn(pool, "estoque_movimentacoes", "updated_at", "timestamp NULL");
    await ensureColumn(pool, "estoque_movimentacoes", "updated_by_user_id", "int");
    await ensureColumn(pool, "estoque_movimentacoes", "updated_by_nome", "varchar(150)");

    const [abastecimentosTable] = await pool.query(`SHOW TABLES LIKE 'abastecimentos'`);
    if ((abastecimentosTable as unknown[]).length > 0) {
      await ensureColumn(pool, "abastecimentos", "movimentacaoEstoqueId", "int");
      await ensureColumn(pool, "abastecimentos", "status", "varchar(20) DEFAULT 'registrado'");
      await ensureColumn(pool, "abastecimentos", "fornecedor", "varchar(200)");
    }

    const [maquinasTable] = await pool.query(`SHOW TABLES LIKE 'maquinas'`);
    if ((maquinasTable as unknown[]).length > 0) {
      await ensureColumn(pool, "maquinas", "userId", "int");
      await ensureColumn(pool, "maquinas", "createdAt", "timestamp DEFAULT CURRENT_TIMESTAMP");
      await ensureColumn(pool, "maquinas", "updatedAt", "timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
      await ensureColumn(pool, "maquinas", "fazendaId", "int");
      await ensureColumn(pool, "maquinas", "valor", "decimal(12,2)");
      await ensureColumn(pool, "maquinas", "anoAquisicao", "int");
      await ensureColumn(pool, "maquinas", "dataAquisicao", "date");
      await ensureColumn(pool, "maquinas", "vidaUtil", "varchar(50)");
      await ensureColumn(pool, "maquinas", "dataDesativacao", "date");
      await ensureColumn(pool, "maquinas", "estado", "varchar(20)");
      await ensureColumn(pool, "maquinas", "tipoMedidor", "varchar(30)");
      await ensureColumn(pool, "maquinas", "imagem1", "text");
      await ensureColumn(pool, "maquinas", "imagem2", "text");
      await ensureColumn(pool, "maquinas", "imagem3", "text");
      try {
        await pool.query(
          "ALTER TABLE `maquinas` MODIFY COLUMN `status` enum('ativo','manutencao','inativo','operacional') DEFAULT 'ativo'"
        );
      } catch {
        /* coluna já compatível */
      }
    }

    // ── Manutencoes: novas colunas (prestador, valores) ──────────────────────
    const [manutencoesTable] = await pool.query(`SHOW TABLES LIKE 'manutencoes'`);
    if ((manutencoesTable as unknown[]).length > 0) {
      await ensureColumn(pool, "manutencoes", "prestadorNome", "varchar(200)");
      await ensureColumn(pool, "manutencoes", "prestadorContato", "varchar(100)");
      await ensureColumn(pool, "manutencoes", "valorMaoObra", "decimal(10,2) DEFAULT 0");
      await ensureColumn(pool, "manutencoes", "valorPecas", "decimal(10,2) DEFAULT 0");
      await ensureColumn(pool, "manutencoes", "valorTotal", "decimal(10,2) DEFAULT 0");
      await ensureColumn(pool, "manutencoes", "updatedAt", "timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
    }

    // ── Manutencao pecas: tabela de itens de peças ───────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`manutencao_pecas\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`manutencaoId\` int NOT NULL,
        \`nome\` varchar(200) NOT NULL,
        \`quantidade\` decimal(10,2) NOT NULL DEFAULT 1,
        \`valorUnitario\` decimal(10,2) NOT NULL DEFAULT 0,
        \`valorTotal\` decimal(10,2) NOT NULL DEFAULT 0,
        \`createdAt\` timestamp DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`)
      )
    `);

    // Histórico de troca de brincos (funcionalidade lançada no commit a25457d5)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`historico_brincos\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`userId\` int NOT NULL,
        \`animalId\` int NOT NULL,
        \`brincoAnterior\` varchar(50),
        \`brincoNovo\` varchar(50) NOT NULL,
        \`motivo\` enum('perda','danificado','reidentificacao','erro_cadastro','outro') NOT NULL DEFAULT 'perda',
        \`observacoes\` text,
        \`dataAlteracao\` date NOT NULL,
        \`usuarioNome\` varchar(200),
        \`createdAt\` timestamp DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`),
        INDEX \`historico_brincos_animal_user_idx\` (\`animalId\`, \`userId\`)
      )
    `);

    // Baixa operacional de animais (venda, morte ou transferência externa).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`animal_baixas\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`userId\` int NOT NULL,
        \`animalId\` int NOT NULL,
        \`fazendaId\` int NOT NULL,
        \`tipo\` enum('venda','morte','transferencia') NOT NULL,
        \`dataBaixa\` date NOT NULL,
        \`destino\` varchar(255),
        \`motivo\` varchar(255),
        \`observacoes\` text,
        \`usuarioNome\` varchar(200),
        \`createdAt\` timestamp DEFAULT CURRENT_TIMESTAMP,
        \`vendaId\` int,
        \`status\` enum('ativa','estornada') NOT NULL DEFAULT 'ativa',
        PRIMARY KEY(\`id\`),
        UNIQUE KEY \`animal_baixas_animal_ativa_uq\` ((CASE WHEN \`status\` = 'ativa' THEN \`animalId\` END)),
        INDEX \`animal_baixas_user_data_idx\` (\`userId\`, \`dataBaixa\`),
        INDEX \`animal_baixas_fazenda_data_idx\` (\`fazendaId\`, \`dataBaixa\`),
        INDEX \`animal_baixas_venda_idx\` (\`vendaId\`),
        INDEX \`animal_baixas_animal_status_idx\` (\`animalId\`, \`status\`)
      )
    `);
    await ensureAnimalBaixasVendaRastreio(pool);

    // ── Animais: novas colunas fazendaId e pastoId ──────────────────────────────────────
    const [animaisTable] = await pool.query(`SHOW TABLES LIKE 'animais'`);
    if ((animaisTable as unknown[]).length > 0) {
      await ensureColumn(pool, "animais", "fazendaId", "int");
      await ensureColumn(pool, "animais", "pastoId", "int");
      await ensureColumn(pool, "animais", "maeId", "int");
      await ensureColumn(pool, "animais", "paiId", "int");
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`parto_crias\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`userId\` int NOT NULL,
        \`partoRegistroId\` int NOT NULL,
        \`criaAnimalId\` int NOT NULL,
        \`ordem\` int NOT NULL DEFAULT 1,
        \`createdAt\` timestamp DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`),
        UNIQUE KEY \`parto_crias_parto_cria_uq\` (\`partoRegistroId\`, \`criaAnimalId\`),
        UNIQUE KEY \`parto_crias_cria_uq\` (\`criaAnimalId\`),
        UNIQUE KEY \`parto_crias_parto_ordem_uq\` (\`partoRegistroId\`, \`ordem\`),
        INDEX \`parto_crias_user_id_idx\` (\`userId\`)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`pessoas\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`user_id\` int NOT NULL,
        \`nome\` varchar(255) NOT NULL,
        \`tipo\` enum('fornecedor','cliente','funcionario') NOT NULL,
        \`funcao\` varchar(150),
        \`documento\` varchar(20),
        \`endereco\` varchar(255),
        \`telefone\` varchar(30),
        \`email\` varchar(150),
        \`observacoes\` text,
        \`propriedade_estabelecimento\` varchar(255),
        \`nome_contato\` varchar(255),
        \`cidade\` varchar(100),
        \`uf\` varchar(2),
        \`ativo\` boolean DEFAULT true,
        \`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`)
      )
    `);

    await ensureColumn(pool, "pessoas", "documento", "varchar(20)");
    await ensureColumn(pool, "pessoas", "endereco", "varchar(255)");
    await ensureColumn(pool, "pessoas", "propriedade_estabelecimento", "varchar(255)");
    await ensureColumn(pool, "pessoas", "nome_contato", "varchar(255)");
    await ensureColumn(pool, "pessoas", "cidade", "varchar(100)");
    await ensureColumn(pool, "pessoas", "uf", "varchar(2)");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`semen_partidas\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`user_id\` int NOT NULL,
        \`fazenda_id\` int NOT NULL,
        \`origem_reprodutor\` varchar(20) NOT NULL,
        \`reprodutor_key\` varchar(120) NOT NULL,
        \`macho_id\` int,
        \`reprodutor_texto\` varchar(500),
        \`partida\` varchar(120) NOT NULL,
        \`central_origem\` varchar(150),
        \`saldo_doses\` int NOT NULL DEFAULT 0,
        \`custo_unitario\` decimal(12,2),
        \`status\` varchar(20) NOT NULL DEFAULT 'disponivel',
        \`observacoes\` text,
        \`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`),
        UNIQUE KEY \`semen_partidas_uq\` (\`user_id\`, \`fazenda_id\`, \`reprodutor_key\`, \`partida\`),
        INDEX \`semen_partidas_user_id_idx\` (\`user_id\`),
        INDEX \`semen_partidas_fazenda_id_idx\` (\`fazenda_id\`),
        INDEX \`semen_partidas_macho_id_idx\` (\`macho_id\`),
        INDEX \`semen_partidas_status_idx\` (\`status\`)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`semen_reprodutores_externos\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`user_id\` int NOT NULL,
        \`fazenda_id\` int NOT NULL,
        \`reprodutor_key\` varchar(120) NOT NULL,
        \`reprodutor_texto\` varchar(500) NOT NULL,
        \`central_padrao\` varchar(150),
        \`observacoes\` text,
        \`ativo\` boolean NOT NULL DEFAULT true,
        \`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`),
        UNIQUE KEY \`semen_reprod_ext_uq\` (\`user_id\`, \`fazenda_id\`, \`reprodutor_key\`),
        INDEX \`semen_reprod_ext_user_id_idx\` (\`user_id\`),
        INDEX \`semen_reprod_ext_fazenda_id_idx\` (\`fazenda_id\`)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`semen_movimentacoes\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`partida_id\` int NOT NULL,
        \`user_id\` int NOT NULL,
        \`fazenda_id\` int NOT NULL,
        \`tipo\` varchar(20) NOT NULL DEFAULT 'ENTRADA',
        \`data_entrada\` date NOT NULL,
        \`quantidade_doses\` int NOT NULL,
        \`custo_total\` decimal(12,2) NOT NULL,
        \`custo_unitario\` decimal(12,2) NOT NULL,
        \`observacoes\` text,
        \`movimentacao_origem_id\` int,
        \`grupo_correcao_id\` varchar(40),
        \`motivo_correcao\` varchar(255),
        \`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`),
        INDEX \`semen_mov_partida_id_idx\` (\`partida_id\`),
        INDEX \`semen_mov_user_id_idx\` (\`user_id\`),
        INDEX \`semen_mov_fazenda_id_idx\` (\`fazenda_id\`)
      )
    `);

    const [semenMovTable] = await pool.query(`SHOW TABLES LIKE 'semen_movimentacoes'`);
    if ((semenMovTable as unknown[]).length > 0) {
      await ensureColumn(pool, "semen_movimentacoes", "movimentacao_origem_id", "int");
      await ensureColumn(pool, "semen_movimentacoes", "grupo_correcao_id", "varchar(40)");
      await ensureColumn(pool, "semen_movimentacoes", "motivo_correcao", "varchar(255)");
    }

    // Sanitário: via de aplicação + vínculo com estoque/custo (padrão Manutenção)
    const [saudeTable] = await pool.query(`SHOW TABLES LIKE 'saude_registros'`);
    if ((saudeTable as unknown[]).length > 0) {
      await ensureColumn(pool, "saude_registros", "viaAplicacao", "varchar(80)");
      await ensureColumn(pool, "saude_registros", "estoqueId", "int");
      await ensureColumn(
        pool,
        "saude_registros",
        "quantidadeConsumo",
        "decimal(12,4)",
      );
      await ensureColumn(
        pool,
        "saude_registros",
        "valorUnitario",
        "decimal(10,2)",
      );
    }

    const [vendasTable] = await pool.query(`SHOW TABLES LIKE 'vendas'`);
    if ((vendasTable as unknown[]).length > 0) {
      await ensureColumn(pool, "vendas", "fazenda_id", "int");
      await ensureColumn(pool, "vendas", "comprador_id", "int");
      await ensureColumn(pool, "vendas", "forma_precificacao", "enum('kg','cabeca')");
      await ensureColumn(pool, "vendas", "preco_padrao", "decimal(12,2)");
      await ensureColumn(pool, "vendas", "peso_total", "decimal(10,2)");
      await ensureColumn(pool, "vendas", "rendimento_carcaca", "decimal(5,2)");
      await ensureColumn(pool, "vendas", "cancelado_em", "timestamp NULL");
      await ensureColumn(pool, "vendas", "cancelado_por_user_id", "int");
      await ensureColumn(pool, "vendas", "cancelado_por_nome", "varchar(200)");
      await ensureColumn(pool, "vendas", "motivo_cancelamento", "varchar(255)");
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`venda_itens\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`user_id\` int NOT NULL,
        \`venda_id\` int NOT NULL,
        \`animal_id\` int NOT NULL,
        \`brinco_snapshot\` varchar(50),
        \`lote_nome_snapshot\` varchar(100),
        \`peso_venda\` decimal(8,2),
        \`forma_precificacao\` enum('kg','cabeca') NOT NULL,
        \`preco_unitario\` decimal(12,2) NOT NULL,
        \`valor_item\` decimal(12,2) NOT NULL,
        \`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`),
        UNIQUE KEY \`venda_itens_venda_animal_uq\` (\`venda_id\`, \`animal_id\`),
        INDEX \`venda_itens_venda_idx\` (\`venda_id\`),
        INDEX \`venda_itens_animal_idx\` (\`animal_id\`)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`venda_documentos\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`user_id\` int NOT NULL,
        \`venda_id\` int NOT NULL,
        \`tipo\` enum('gta','nota_fiscal') NOT NULL,
        \`nome_original\` varchar(255) NOT NULL,
        \`storage_path\` varchar(500) NOT NULL,
        \`uploaded_at\` timestamp DEFAULT CURRENT_TIMESTAMP,
        \`uploaded_by_user_id\` int,
        \`uploaded_by_nome\` varchar(200),
        PRIMARY KEY(\`id\`),
        UNIQUE KEY \`venda_documentos_venda_tipo_uq\` (\`venda_id\`, \`tipo\`),
        INDEX \`venda_documentos_venda_idx\` (\`venda_id\`),
        INDEX \`venda_documentos_user_idx\` (\`user_id\`)
      )
    `);
  } catch (err) {
    console.error("[schema] Falha ao garantir schema:", err);
    throw err;
  } finally {
    await pool.end();
  }
}
