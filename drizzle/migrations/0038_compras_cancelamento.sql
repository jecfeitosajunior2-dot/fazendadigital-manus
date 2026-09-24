-- Auditoria de cancelamento comercial. Nullable. Sem backfill. Sem CASCADE.

ALTER TABLE `compras`
  ADD COLUMN `cancelado_em` TIMESTAMP NULL,
  ADD COLUMN `cancelado_por_user_id` INT NULL,
  ADD COLUMN `cancelado_por_nome` VARCHAR(200) NULL,
  ADD COLUMN `motivo_cancelamento` VARCHAR(255) NULL;
