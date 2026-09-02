-- Venda estruturada: Fazenda, comprador (pessoa) e itens por animal.
-- Campos novos em `vendas` são NULL para preservar o legado agregado.

ALTER TABLE `vendas`
  ADD COLUMN `fazenda_id` int NULL,
  ADD COLUMN `comprador_id` int NULL,
  ADD COLUMN `forma_precificacao` enum('kg','cabeca') NULL,
  ADD COLUMN `preco_padrao` decimal(12,2) NULL,
  ADD COLUMN `peso_total` decimal(10,2) NULL;

CREATE INDEX `vendas_fazenda_idx` ON `vendas` (`fazenda_id`);
CREATE INDEX `vendas_comprador_idx` ON `vendas` (`comprador_id`);

CREATE TABLE IF NOT EXISTS `venda_itens` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `venda_id` int NOT NULL,
  `animal_id` int NOT NULL,
  `brinco_snapshot` varchar(50),
  `lote_nome_snapshot` varchar(100),
  `peso_venda` decimal(8,2),
  `forma_precificacao` enum('kg','cabeca') NOT NULL,
  `preco_unitario` decimal(12,2) NOT NULL,
  `valor_item` decimal(12,2) NOT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `venda_itens_id` PRIMARY KEY (`id`),
  CONSTRAINT `venda_itens_venda_animal_uq` UNIQUE (`venda_id`, `animal_id`),
  INDEX `venda_itens_venda_idx` (`venda_id`),
  INDEX `venda_itens_animal_idx` (`animal_id`)
);
