import type mysql from "mysql2/promise";

async function foreignKeyExists(pool: mysql.Pool, table: string, constraintName: string): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [table, constraintName],
  );
  return (rows as unknown[]).length > 0;
}

async function tableExists(pool: mysql.Pool, table: string): Promise<boolean> {
  const [rows] = await pool.query(`SHOW TABLES LIKE ?`, [table]);
  return (rows as unknown[]).length > 0;
}

async function indexExists(pool: mysql.Pool, table: string, keyName: string): Promise<boolean> {
  const [rows] = await pool.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [keyName]);
  return (rows as unknown[]).length > 0;
}

async function ensureUnique(pool: mysql.Pool, table: string, keyName: string, sql: string) {
  if (await indexExists(pool, table, keyName)) return;
  await pool.query(sql);
}

async function ensureFk(
  pool: mysql.Pool,
  table: string,
  name: string,
  sql: string,
) {
  if (await foreignKeyExists(pool, table, name)) return;
  await pool.query(sql);
}

/** Cria só a infraestrutura do novo núcleo. Sem backfill. Sem seed. */
export async function ensureFinanceiroNucleoSchema(pool: mysql.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`financeiro_contas\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`user_id\` int NOT NULL,
      \`nome\` varchar(120) NOT NULL,
      \`tipo\` varchar(30) NOT NULL,
      \`banco\` varchar(100) DEFAULT NULL,
      \`agencia\` varchar(20) DEFAULT NULL,
      \`numero_conta\` varchar(30) DEFAULT NULL,
      \`saldo_abertura\` decimal(12,2) NOT NULL DEFAULT '0.00',
      \`data_saldo_abertura\` date NOT NULL,
      \`ativa\` tinyint(1) NOT NULL DEFAULT 1,
      \`inativada_em\` timestamp NULL DEFAULT NULL,
      \`motivo_inativacao\` varchar(255) DEFAULT NULL,
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`financeiro_contas_user_idx\` (\`user_id\`),
      KEY \`financeiro_contas_user_ativa_idx\` (\`user_id\`, \`ativa\`),
      KEY \`financeiro_contas_user_tipo_idx\` (\`user_id\`, \`tipo\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`financeiro_categorias\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`user_id\` int NOT NULL,
      \`nome\` varchar(120) NOT NULL,
      \`tipo\` varchar(20) NOT NULL,
      \`categoria_pai_id\` int DEFAULT NULL,
      \`chave_sistema\` varchar(60) DEFAULT NULL,
      \`ativa\` tinyint(1) NOT NULL DEFAULT 1,
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`financeiro_categorias_chave_uq\` (\`user_id\`, \`chave_sistema\`),
      KEY \`financeiro_categorias_user_idx\` (\`user_id\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`financeiro_centros_custo\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`user_id\` int NOT NULL,
      \`nome\` varchar(120) NOT NULL,
      \`fazenda_id\` int DEFAULT NULL,
      \`ativo\` tinyint(1) NOT NULL DEFAULT 1,
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`financeiro_centros_custo_user_idx\` (\`user_id\`),
      KEY \`financeiro_centros_custo_fazenda_idx\` (\`fazenda_id\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`financeiro_titulos\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`user_id\` int NOT NULL,
      \`tipo\` varchar(20) NOT NULL,
      \`estado\` varchar(20) NOT NULL DEFAULT 'ativo',
      \`condicao_status\` varchar(20) NOT NULL DEFAULT 'a_definir',
      \`pessoa_id\` int NOT NULL,
      \`contraparte_nome_snapshot\` varchar(255) NOT NULL,
      \`fazenda_origem_id\` int DEFAULT NULL,
      \`origem_tipo\` varchar(40) NOT NULL,
      \`origem_id\` int DEFAULT NULL,
      \`origem_item_chave\` varchar(80) DEFAULT NULL,
      \`descricao\` varchar(255) NOT NULL,
      \`data_competencia\` date NOT NULL,
      \`valor_original\` decimal(12,2) NOT NULL,
      \`documento_referencia\` varchar(80) DEFAULT NULL,
      \`observacoes\` text,
      \`cancelado_em\` timestamp NULL DEFAULT NULL,
      \`motivo_cancelamento\` varchar(255) DEFAULT NULL,
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`financeiro_titulos_origem_uq\` (\`user_id\`, \`origem_tipo\`, \`origem_id\`, \`origem_item_chave\`),
      KEY \`financeiro_titulos_user_idx\` (\`user_id\`),
      KEY \`financeiro_titulos_pessoa_idx\` (\`pessoa_id\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`financeiro_parcelas\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`user_id\` int NOT NULL,
      \`titulo_id\` int NOT NULL,
      \`numero\` int NOT NULL,
      \`vencimento\` date NOT NULL,
      \`valor_original\` decimal(12,2) NOT NULL,
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`financeiro_parcelas_titulo_numero_uq\` (\`titulo_id\`, \`numero\`),
      KEY \`financeiro_parcelas_user_idx\` (\`user_id\`),
      KEY \`financeiro_parcelas_titulo_idx\` (\`titulo_id\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`financeiro_liquidacoes\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`user_id\` int NOT NULL,
      \`tipo\` varchar(30) NOT NULL,
      \`conta_id\` int NOT NULL,
      \`data_liquidacao\` date NOT NULL,
      \`valor_movimentado\` decimal(12,2) NOT NULL,
      \`forma_pagamento\` varchar(40) DEFAULT NULL,
      \`referencia\` varchar(80) DEFAULT NULL,
      \`observacoes\` text,
      \`liquidacao_original_id\` int DEFAULT NULL,
      \`idempotency_key\` varchar(80) NOT NULL,
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`financeiro_liquidacoes_idem_uq\` (\`user_id\`, \`idempotency_key\`),
      KEY \`financeiro_liquidacoes_user_idx\` (\`user_id\`),
      KEY \`financeiro_liquidacoes_conta_idx\` (\`conta_id\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`financeiro_liquidacao_alocacoes\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`user_id\` int NOT NULL,
      \`liquidacao_id\` int NOT NULL,
      \`parcela_id\` int NOT NULL,
      \`principal_liquidado\` decimal(12,2) NOT NULL,
      \`desconto\` decimal(12,2) NOT NULL DEFAULT '0.00',
      \`juros\` decimal(12,2) NOT NULL DEFAULT '0.00',
      \`multa\` decimal(12,2) NOT NULL DEFAULT '0.00',
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`financeiro_alocacoes_user_idx\` (\`user_id\`),
      KEY \`financeiro_alocacoes_liquidacao_idx\` (\`liquidacao_id\`),
      KEY \`financeiro_alocacoes_parcela_idx\` (\`parcela_id\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`financeiro_transferencias\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`user_id\` int NOT NULL,
      \`conta_origem_id\` int NOT NULL,
      \`conta_destino_id\` int NOT NULL,
      \`data_transferencia\` date NOT NULL,
      \`valor\` decimal(12,2) NOT NULL,
      \`descricao\` varchar(255) DEFAULT NULL,
      \`referencia\` varchar(80) DEFAULT NULL,
      \`observacoes\` text,
      \`estado\` varchar(20) NOT NULL DEFAULT 'confirmada',
      \`transferencia_original_id\` int DEFAULT NULL,
      \`idempotency_key\` varchar(80) NOT NULL,
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`financeiro_transferencias_idem_uq\` (\`user_id\`, \`idempotency_key\`),
      KEY \`financeiro_transferencias_user_idx\` (\`user_id\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`financeiro_movimentos\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`user_id\` int NOT NULL,
      \`conta_id\` int NOT NULL,
      \`data_movimento\` date NOT NULL,
      \`direcao\` varchar(10) NOT NULL,
      \`natureza\` varchar(40) NOT NULL,
      \`valor\` decimal(12,2) NOT NULL,
      \`liquidacao_id\` int DEFAULT NULL,
      \`transferencia_id\` int DEFAULT NULL,
      \`contraparte_pessoa_id\` int DEFAULT NULL,
      \`descricao\` varchar(255) NOT NULL,
      \`referencia\` varchar(80) DEFAULT NULL,
      \`movimento_original_id\` int DEFAULT NULL,
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`financeiro_movimentos_liquidacao_uq\` (\`liquidacao_id\`),
      KEY \`financeiro_movimentos_extrato_idx\` (\`conta_id\`, \`data_movimento\`, \`id\`),
      KEY \`financeiro_movimentos_user_data_idx\` (\`user_id\`, \`data_movimento\`),
      KEY \`financeiro_movimentos_transf_idx\` (\`transferencia_id\`),
      KEY \`financeiro_movimentos_pessoa_idx\` (\`contraparte_pessoa_id\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`financeiro_apropriacoes\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`user_id\` int NOT NULL,
      \`titulo_id\` int NOT NULL,
      \`fazenda_id\` int DEFAULT NULL,
      \`categoria_id\` int DEFAULT NULL,
      \`centro_custo_id\` int DEFAULT NULL,
      \`valor\` decimal(12,2) NOT NULL,
      \`origem_detalhe_tipo\` varchar(40) DEFAULT NULL,
      \`origem_detalhe_id\` int DEFAULT NULL,
      \`observacoes\` text,
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`financeiro_apropriacoes_user_idx\` (\`user_id\`),
      KEY \`financeiro_apropriacoes_titulo_idx\` (\`titulo_id\`)
    )
  `);

  if (await tableExists(pool, "pessoas")) {
    await ensureFk(pool, "financeiro_titulos", "financeiro_titulos_pessoa_fk",
      "ALTER TABLE `financeiro_titulos` ADD CONSTRAINT `financeiro_titulos_pessoa_fk` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas` (`id`)");
    await ensureFk(pool, "financeiro_movimentos", "financeiro_movimentos_pessoa_fk",
      "ALTER TABLE `financeiro_movimentos` ADD CONSTRAINT `financeiro_movimentos_pessoa_fk` FOREIGN KEY (`contraparte_pessoa_id`) REFERENCES `pessoas` (`id`)");
  }
  if (await tableExists(pool, "fazendas")) {
    await ensureFk(pool, "financeiro_titulos", "financeiro_titulos_fazenda_fk",
      "ALTER TABLE `financeiro_titulos` ADD CONSTRAINT `financeiro_titulos_fazenda_fk` FOREIGN KEY (`fazenda_origem_id`) REFERENCES `fazendas` (`id`)");
    await ensureFk(pool, "financeiro_centros_custo", "financeiro_centros_custo_fazenda_fk",
      "ALTER TABLE `financeiro_centros_custo` ADD CONSTRAINT `financeiro_centros_custo_fazenda_fk` FOREIGN KEY (`fazenda_id`) REFERENCES `fazendas` (`id`)");
    await ensureFk(pool, "financeiro_apropriacoes", "financeiro_apropriacoes_fazenda_fk",
      "ALTER TABLE `financeiro_apropriacoes` ADD CONSTRAINT `financeiro_apropriacoes_fazenda_fk` FOREIGN KEY (`fazenda_id`) REFERENCES `fazendas` (`id`)");
  }

  await ensureFk(pool, "financeiro_categorias", "financeiro_categorias_pai_fk",
    "ALTER TABLE `financeiro_categorias` ADD CONSTRAINT `financeiro_categorias_pai_fk` FOREIGN KEY (`categoria_pai_id`) REFERENCES `financeiro_categorias` (`id`)");
  await ensureFk(pool, "financeiro_parcelas", "financeiro_parcelas_titulo_fk",
    "ALTER TABLE `financeiro_parcelas` ADD CONSTRAINT `financeiro_parcelas_titulo_fk` FOREIGN KEY (`titulo_id`) REFERENCES `financeiro_titulos` (`id`)");
  await ensureFk(pool, "financeiro_liquidacoes", "financeiro_liquidacoes_conta_fk",
    "ALTER TABLE `financeiro_liquidacoes` ADD CONSTRAINT `financeiro_liquidacoes_conta_fk` FOREIGN KEY (`conta_id`) REFERENCES `financeiro_contas` (`id`)");
  await ensureFk(pool, "financeiro_liquidacoes", "financeiro_liquidacoes_original_fk",
    "ALTER TABLE `financeiro_liquidacoes` ADD CONSTRAINT `financeiro_liquidacoes_original_fk` FOREIGN KEY (`liquidacao_original_id`) REFERENCES `financeiro_liquidacoes` (`id`)");
  await ensureFk(pool, "financeiro_liquidacao_alocacoes", "financeiro_alocacoes_liquidacao_fk",
    "ALTER TABLE `financeiro_liquidacao_alocacoes` ADD CONSTRAINT `financeiro_alocacoes_liquidacao_fk` FOREIGN KEY (`liquidacao_id`) REFERENCES `financeiro_liquidacoes` (`id`)");
  await ensureFk(pool, "financeiro_liquidacao_alocacoes", "financeiro_alocacoes_parcela_fk",
    "ALTER TABLE `financeiro_liquidacao_alocacoes` ADD CONSTRAINT `financeiro_alocacoes_parcela_fk` FOREIGN KEY (`parcela_id`) REFERENCES `financeiro_parcelas` (`id`)");
  await ensureFk(pool, "financeiro_transferencias", "financeiro_transferencias_origem_fk",
    "ALTER TABLE `financeiro_transferencias` ADD CONSTRAINT `financeiro_transferencias_origem_fk` FOREIGN KEY (`conta_origem_id`) REFERENCES `financeiro_contas` (`id`)");
  await ensureFk(pool, "financeiro_transferencias", "financeiro_transferencias_destino_fk",
    "ALTER TABLE `financeiro_transferencias` ADD CONSTRAINT `financeiro_transferencias_destino_fk` FOREIGN KEY (`conta_destino_id`) REFERENCES `financeiro_contas` (`id`)");
  await ensureFk(pool, "financeiro_transferencias", "financeiro_transferencias_original_fk",
    "ALTER TABLE `financeiro_transferencias` ADD CONSTRAINT `financeiro_transferencias_original_fk` FOREIGN KEY (`transferencia_original_id`) REFERENCES `financeiro_transferencias` (`id`)");
  await ensureFk(pool, "financeiro_movimentos", "financeiro_movimentos_conta_fk",
    "ALTER TABLE `financeiro_movimentos` ADD CONSTRAINT `financeiro_movimentos_conta_fk` FOREIGN KEY (`conta_id`) REFERENCES `financeiro_contas` (`id`)");
  await ensureFk(pool, "financeiro_movimentos", "financeiro_movimentos_liquidacao_fk",
    "ALTER TABLE `financeiro_movimentos` ADD CONSTRAINT `financeiro_movimentos_liquidacao_fk` FOREIGN KEY (`liquidacao_id`) REFERENCES `financeiro_liquidacoes` (`id`)");
  await ensureFk(pool, "financeiro_movimentos", "financeiro_movimentos_transf_fk",
    "ALTER TABLE `financeiro_movimentos` ADD CONSTRAINT `financeiro_movimentos_transf_fk` FOREIGN KEY (`transferencia_id`) REFERENCES `financeiro_transferencias` (`id`)");
  await ensureFk(pool, "financeiro_movimentos", "financeiro_movimentos_original_fk",
    "ALTER TABLE `financeiro_movimentos` ADD CONSTRAINT `financeiro_movimentos_original_fk` FOREIGN KEY (`movimento_original_id`) REFERENCES `financeiro_movimentos` (`id`)");
  await ensureFk(pool, "financeiro_apropriacoes", "financeiro_apropriacoes_titulo_fk",
    "ALTER TABLE `financeiro_apropriacoes` ADD CONSTRAINT `financeiro_apropriacoes_titulo_fk` FOREIGN KEY (`titulo_id`) REFERENCES `financeiro_titulos` (`id`)");
  await ensureFk(pool, "financeiro_apropriacoes", "financeiro_apropriacoes_categoria_fk",
    "ALTER TABLE `financeiro_apropriacoes` ADD CONSTRAINT `financeiro_apropriacoes_categoria_fk` FOREIGN KEY (`categoria_id`) REFERENCES `financeiro_categorias` (`id`)");
  await ensureFk(pool, "financeiro_apropriacoes", "financeiro_apropriacoes_centro_fk",
    "ALTER TABLE `financeiro_apropriacoes` ADD CONSTRAINT `financeiro_apropriacoes_centro_fk` FOREIGN KEY (`centro_custo_id`) REFERENCES `financeiro_centros_custo` (`id`)");

  await ensureUnique(
    pool,
    "financeiro_liquidacoes",
    "financeiro_liquidacoes_original_uq",
    "ALTER TABLE `financeiro_liquidacoes` ADD UNIQUE KEY `financeiro_liquidacoes_original_uq` (`liquidacao_original_id`)",
  );
  await ensureUnique(
    pool,
    "financeiro_transferencias",
    "financeiro_transferencias_original_uq",
    "ALTER TABLE `financeiro_transferencias` ADD UNIQUE KEY `financeiro_transferencias_original_uq` (`transferencia_original_id`)",
  );
  await ensureUnique(
    pool,
    "financeiro_movimentos",
    "financeiro_movimentos_transf_dir_uq",
    "ALTER TABLE `financeiro_movimentos` ADD UNIQUE KEY `financeiro_movimentos_transf_dir_uq` (`transferencia_id`, `direcao`)",
  );
}
