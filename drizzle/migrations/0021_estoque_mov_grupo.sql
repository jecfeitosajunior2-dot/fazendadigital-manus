-- Agrupa itens da mesma movimentação administrativa + auditoria de quem registrou
ALTER TABLE `estoque_movimentacoes`
  ADD COLUMN `grupo_id` varchar(40) NULL AFTER `id`,
  ADD COLUMN `user_id` int NULL AFTER `fazenda_id`,
  ADD COLUMN `registrado_por` varchar(150) NULL AFTER `user_id`;

CREATE INDEX `estoque_movimentacoes_grupo_id_idx` ON `estoque_movimentacoes` (`grupo_id`);
