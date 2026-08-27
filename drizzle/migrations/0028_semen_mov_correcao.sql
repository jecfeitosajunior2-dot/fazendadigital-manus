-- Vínculo auditável de correção de entradas de sêmen (estorno + nova entrada).
-- Não edita nem apaga movimentações existentes.
ALTER TABLE `semen_movimentacoes`
  ADD COLUMN `movimentacao_origem_id` int NULL AFTER `observacoes`,
  ADD COLUMN `grupo_correcao_id` varchar(40) NULL AFTER `movimentacao_origem_id`,
  ADD COLUMN `motivo_correcao` varchar(255) NULL AFTER `grupo_correcao_id`;

CREATE INDEX `semen_mov_origem_id_idx` ON `semen_movimentacoes` (`movimentacao_origem_id`);
CREATE INDEX `semen_mov_grupo_correcao_idx` ON `semen_movimentacoes` (`grupo_correcao_id`);
