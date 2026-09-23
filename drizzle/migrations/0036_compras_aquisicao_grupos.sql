-- Aquisição pecuária: colunas comerciais nullable (legado intacto)
-- + grupos da compra. Sem UNIQUE global. Sem CASCADE.

ALTER TABLE `compras`
  ADD COLUMN `fazenda_id` INT NULL,
  ADD COLUMN `fornecedor_id` INT NULL,
  ADD COLUMN `referencia` VARCHAR(120) NULL,
  ADD COLUMN `forma_precificacao` ENUM('kg', 'cabeca') NULL,
  ADD COLUMN `preco_unitario` DECIMAL(12,2) NULL,
  ADD COLUMN `valor_animais` DECIMAL(12,2) NULL,
  ADD COLUMN `frete` DECIMAL(12,2) NULL,
  ADD COLUMN `outros_custos` DECIMAL(12,2) NULL,
  ADD COLUMN `custo_total` DECIMAL(12,2) NULL,
  ADD COLUMN `peso_total` DECIMAL(10,2) NULL,
  ADD COLUMN `lote_destino_id` INT NULL,
  ADD COLUMN `pasto_destino_id` INT NULL,
  ADD COLUMN `modo_identificacao` ENUM('nao_identificados', 'individuais') NULL,
  ADD COLUMN `updated_at` TIMESTAMP NULL DEFAULT NULL;

-- `compras_user_idx`: o ensureSchema só cria se `user_id` ainda não tiver índice.
-- Em ambientes novos, criar aqui. Se o índice já existir, pule esta linha.
CREATE INDEX `compras_user_idx` ON `compras` (`user_id`);
CREATE INDEX `compras_fazenda_idx` ON `compras` (`fazenda_id`);
CREATE INDEX `compras_fornecedor_idx` ON `compras` (`fornecedor_id`);

CREATE TABLE IF NOT EXISTS `compra_grupos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `compra_id` INT NOT NULL,
  `categoria` VARCHAR(50) NOT NULL,
  `sexo` ENUM('macho', 'femea') NOT NULL,
  `quantidade` INT NOT NULL,
  `peso_total` DECIMAL(10,2) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `compra_grupos_compra_idx` (`compra_id`),
  INDEX `compra_grupos_user_idx` (`user_id`),
  CONSTRAINT `compra_grupos_compra_fk`
    FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);
