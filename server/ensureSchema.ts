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
        \`loteOrigemId\` int NOT NULL,
        \`loteDestinoId\` int NOT NULL,
        \`pastoOrigemId\` int,
        \`pastoDestinoId\` int,
        \`fazendaId\` int,
        \`dataMovimentacao\` date NOT NULL,
        \`usuarioNome\` varchar(200),
        \`createdAt\` timestamp DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`)
      )
    `);

    const [animalLoteMovTable] = await pool.query(`SHOW TABLES LIKE 'animal_lote_movimentacoes'`);
    if ((animalLoteMovTable as unknown[]).length > 0) {
      await ensureColumn(pool, "animal_lote_movimentacoes", "pastoOrigemId", "int");
      await ensureColumn(pool, "animal_lote_movimentacoes", "pastoDestinoId", "int");
      await ensureColumn(pool, "animal_lote_movimentacoes", "fazendaId", "int");
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
        \`ativo\` boolean DEFAULT true,
        \`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`)
      )
    `);

    await ensureColumn(pool, "pessoas", "documento", "varchar(20)");
    await ensureColumn(pool, "pessoas", "endereco", "varchar(255)");

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
  } catch (err) {
    console.error("[schema] Falha ao garantir schema:", err);
    throw err;
  } finally {
    await pool.end();
  }
}
