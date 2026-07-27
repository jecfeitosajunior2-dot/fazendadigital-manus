-- Vínculo bidirecional entre abastecimentos e movimentações de estoque
ALTER TABLE `estoque_movimentacoes`
  ADD COLUMN `abastecimento_id` int NULL AFTER `estoque_id`;

CREATE INDEX `estoque_movimentacoes_abastecimento_id_idx`
  ON `estoque_movimentacoes` (`abastecimento_id`);

ALTER TABLE `abastecimentos`
  ADD COLUMN `movimentacaoEstoqueId` int NULL AFTER `fazendaId`;

CREATE INDEX `abastecimentos_movimentacao_estoque_id_idx`
  ON `abastecimentos` (`movimentacaoEstoqueId`);
