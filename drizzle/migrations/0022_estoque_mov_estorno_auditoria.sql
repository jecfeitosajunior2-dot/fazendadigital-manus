-- Status, vínculo de estorno e auditoria de alteração em estoque_movimentacoes
ALTER TABLE `estoque_movimentacoes`
  ADD COLUMN `status` varchar(20) NULL DEFAULT 'ativa' AFTER `observacoes`,
  ADD COLUMN `original_grupo_id` varchar(40) NULL AFTER `status`,
  ADD COLUMN `motivo_estorno` varchar(255) NULL AFTER `original_grupo_id`,
  ADD COLUMN `updated_at` timestamp NULL DEFAULT NULL AFTER `created_at`,
  ADD COLUMN `updated_by_user_id` int NULL AFTER `updated_at`,
  ADD COLUMN `updated_by_nome` varchar(150) NULL AFTER `updated_by_user_id`;

CREATE INDEX `estoque_movimentacoes_original_grupo_id_idx` ON `estoque_movimentacoes` (`original_grupo_id`);
CREATE INDEX `estoque_movimentacoes_status_idx` ON `estoque_movimentacoes` (`status`);
