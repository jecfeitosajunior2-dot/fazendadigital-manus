-- Auditoria persistente do estorno do recebimento individual.
-- Não apaga snapshot. Não faz backfill. Não altera 998/999.

ALTER TABLE `compra_recebimentos`
  ADD COLUMN `motivo_estorno` varchar(80) NULL,
  ADD COLUMN `observacao_estorno` text NULL,
  ADD COLUMN `estornado_por_user_id` int NULL,
  ADD COLUMN `estornado_em` timestamp NULL;
