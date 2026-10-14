-- Vínculo do manejo sanitário com a movimentação oficial de estoque.
-- Sem backfill. Registros antigos ficam com estoqueMovimentacaoId NULL.

ALTER TABLE `saude_registros`
  ADD COLUMN `estoqueMovimentacaoId` int NULL,
  ADD COLUMN `status` varchar(20) NOT NULL DEFAULT 'ativo',
  ADD COLUMN `estornadoEm` timestamp NULL,
  ADD COLUMN `motivoEstorno` text NULL;

CREATE INDEX `saude_registros_estoque_mov_idx`
  ON `saude_registros` (`estoqueMovimentacaoId`);

CREATE INDEX `saude_registros_status_idx`
  ON `saude_registros` (`status`);
