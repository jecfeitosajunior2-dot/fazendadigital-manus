-- Recebimento individual rastreável da Compra.
-- Sem backfill. Sem cascade para animais. Não altera Compra 1 / 998 / 999.

CREATE TABLE IF NOT EXISTS `compra_recebimentos` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `compra_id` int NOT NULL,
  `compra_grupo_id` int NOT NULL,
  `animal_id` int NOT NULL,
  `brinco_visual` varchar(50) NOT NULL,
  `rfid` varchar(80) NULL,
  `sexo` enum('macho','femea') NOT NULL,
  `categoria` varchar(50) NOT NULL,
  `peso_recebimento` decimal(8,2) NULL,
  `lote_destino_id` int NULL,
  `pasto_destino_id` int NULL,
  `status` enum('confirmado','estornado') NOT NULL DEFAULT 'confirmado',
  `recebido_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `recebido_por_user_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `compra_recebimentos_animal_uq` (`animal_id`),
  INDEX `compra_recebimentos_user_idx` (`user_id`),
  INDEX `compra_recebimentos_compra_idx` (`compra_id`),
  INDEX `compra_recebimentos_grupo_idx` (`compra_grupo_id`)
);

-- Integridade comercial: o recebimento não some se a Compra/grupo for apagado.
-- Sem FK em animal_id: um futuro DELETE do animal não apaga a evidência.

ALTER TABLE `compra_recebimentos`
  ADD CONSTRAINT `compra_recebimentos_compra_fk`
  FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`)
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE `compra_recebimentos`
  ADD CONSTRAINT `compra_recebimentos_grupo_fk`
  FOREIGN KEY (`compra_grupo_id`) REFERENCES `compra_grupos` (`id`)
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE `pesagens`
  ADD COLUMN `compraRecebimentoId` int NULL;

CREATE INDEX `pesagens_compra_recebimento_idx` ON `pesagens` (`compraRecebimentoId`);

ALTER TABLE `pesagens`
  ADD CONSTRAINT `pesagens_compra_recebimento_fk`
  FOREIGN KEY (`compraRecebimentoId`) REFERENCES `compra_recebimentos` (`id`)
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE `animal_lote_movimentacoes`
  ADD COLUMN `compraRecebimentoId` int NULL;

CREATE INDEX `animal_lote_mov_compra_recebimento_idx`
  ON `animal_lote_movimentacoes` (`compraRecebimentoId`);

ALTER TABLE `animal_lote_movimentacoes`
  ADD CONSTRAINT `animal_lote_mov_compra_recebimento_fk`
  FOREIGN KEY (`compraRecebimentoId`) REFERENCES `compra_recebimentos` (`id`)
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;
