-- Identidade comercial de novas operações de estoque (Fase 2A).
-- Sem backfill. Sem UPDATE histórico. Sem títulos retroativos.

CREATE TABLE IF NOT EXISTS `estoque_operacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `fazenda_id` int NOT NULL,
  `tipo` varchar(40) NOT NULL,
  `motivo` varchar(40) NOT NULL,
  `data_operacao` date NOT NULL,
  `fornecedor_id` int DEFAULT NULL,
  `fornecedor_nome_snapshot` varchar(255) DEFAULT NULL,
  `numero_nf` varchar(60) DEFAULT NULL,
  `referencia` varchar(120) DEFAULT NULL,
  `valor_mercadorias` decimal(12,2) NOT NULL,
  `valor_frete` decimal(12,2) NOT NULL DEFAULT '0.00',
  `valor_total` decimal(12,2) NOT NULL,
  `frete_credor_id` int DEFAULT NULL,
  `frete_credor_nome_snapshot` varchar(255) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'confirmada',
  `estornada_em` timestamp NULL DEFAULT NULL,
  `motivo_estorno` varchar(255) DEFAULT NULL,
  `idempotency_key` varchar(80) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `estoque_operacoes_idem_uq` (`user_id`, `idempotency_key`),
  KEY `estoque_operacoes_user_idx` (`user_id`),
  KEY `estoque_operacoes_fazenda_idx` (`fazenda_id`),
  KEY `estoque_operacoes_fornecedor_idx` (`fornecedor_id`)
);

ALTER TABLE `estoque_movimentacoes`
  ADD COLUMN `operacao_id` int NULL AFTER `grupo_id`;

CREATE INDEX `estoque_movimentacoes_operacao_idx` ON `estoque_movimentacoes` (`operacao_id`);

ALTER TABLE `estoque_movimentacoes`
  ADD CONSTRAINT `estoque_movimentacoes_operacao_fk`
    FOREIGN KEY (`operacao_id`) REFERENCES `estoque_operacoes` (`id`);
