-- Vínculo da peça de manutenção com a movimentação oficial de estoque.
-- Histórico de estorno da OS. Sem backfill. Linhas antigas ficam NULL.

ALTER TABLE `manutencao_pecas`
  ADD COLUMN `estoqueMovimentacaoId` int NULL;

CREATE INDEX `manutencao_pecas_estoque_mov_idx`
  ON `manutencao_pecas` (`estoqueMovimentacaoId`);

ALTER TABLE `manutencoes`
  ADD COLUMN `estornadoEm` timestamp NULL,
  ADD COLUMN `motivoEstorno` text NULL;
