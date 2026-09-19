-- Anexos opcionais de PDF da venda (GTA e Nota Fiscal).
-- Não altera vendas, venda_itens nem animal_baixas.

CREATE TABLE IF NOT EXISTS `venda_documentos` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `venda_id` int NOT NULL,
  `tipo` enum('gta','nota_fiscal') NOT NULL,
  `nome_original` varchar(255) NOT NULL,
  `storage_path` varchar(500) NOT NULL,
  `uploaded_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `uploaded_by_user_id` int,
  `uploaded_by_nome` varchar(200),
  PRIMARY KEY (`id`),
  UNIQUE KEY `venda_documentos_venda_tipo_uq` (`venda_id`, `tipo`),
  INDEX `venda_documentos_venda_idx` (`venda_id`),
  INDEX `venda_documentos_user_idx` (`user_id`)
);
