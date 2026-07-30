-- Status operacional do abastecimento (permite estorno sem apagar o histórico)
ALTER TABLE `abastecimentos`
  ADD COLUMN `status` varchar(20) NOT NULL DEFAULT 'registrado' AFTER `movimentacaoEstoqueId`;
