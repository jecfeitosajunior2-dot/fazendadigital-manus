-- Rastreio estrutural do cancelamento de venda.
-- MySQL 8.4: índice único funcional = no máximo uma baixa ATIVA por animal.
-- Não apaga dados. Baixas históricas de venda #1 (ids 3 e 4) recebem vendaId.

ALTER TABLE `animal_baixas`
  ADD COLUMN `vendaId` int NULL AFTER `createdAt`,
  ADD COLUMN `status` enum('ativa','estornada') NOT NULL DEFAULT 'ativa' AFTER `vendaId`;

CREATE INDEX `animal_baixas_venda_idx` ON `animal_baixas` (`vendaId`);
CREATE INDEX `animal_baixas_animal_status_idx` ON `animal_baixas` (`animalId`, `status`);

-- Só as baixas inequívocas da Venda #1.
UPDATE `animal_baixas` b
INNER JOIN `venda_itens` i
  ON i.animal_id = b.animalId
 AND i.venda_id = 1
SET b.vendaId = 1
WHERE b.id IN (3, 4)
  AND b.tipo = 'venda'
  AND TRIM(b.motivo) = 'Venda #1'
  AND b.animalId IN (25, 26)
  AND b.vendaId IS NULL;

-- Se o UNIQUE legado animal_baixas_animal_uq existir neste ambiente, remover.
-- No MySQL local atual (2026-09-19) esse índice NÃO estava presente.

CREATE UNIQUE INDEX `animal_baixas_animal_ativa_uq`
  ON `animal_baixas` ((CASE WHEN `status` = 'ativa' THEN `animalId` END));

ALTER TABLE `vendas`
  ADD COLUMN `cancelado_em` timestamp NULL AFTER `rendimento_carcaca`,
  ADD COLUMN `cancelado_por_user_id` int NULL AFTER `cancelado_em`,
  ADD COLUMN `cancelado_por_nome` varchar(200) NULL AFTER `cancelado_por_user_id`,
  ADD COLUMN `motivo_cancelamento` varchar(255) NULL AFTER `cancelado_por_nome`;
