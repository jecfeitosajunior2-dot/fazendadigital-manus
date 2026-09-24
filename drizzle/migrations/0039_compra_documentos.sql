-- Anexos opcionais de PDF da compra (GTA e Nota Fiscal).
-- Não altera venda_documentos, compras, compra_grupos nem animais.

CREATE TABLE IF NOT EXISTS `compra_documentos` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `compra_id` int NOT NULL,
  `tipo` enum('gta','nota_fiscal') NOT NULL,
  `nome_original` varchar(255) NOT NULL,
  `storage_path` varchar(500) NOT NULL,
  `uploaded_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `uploaded_by_user_id` int,
  `uploaded_by_nome` varchar(200),
  PRIMARY KEY (`id`),
  UNIQUE KEY `compra_documentos_compra_tipo_uq` (`compra_id`, `tipo`),
  INDEX `compra_documentos_compra_idx` (`compra_id`),
  INDEX `compra_documentos_user_idx` (`user_id`)
);
