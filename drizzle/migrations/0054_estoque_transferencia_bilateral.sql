-- Transferência bilateral de insumos (Fase 2A.1B-1).
-- Compra: fazenda_id = fazenda da compra, fazenda_destino_id = NULL.
-- Transferência: fazenda_id = origem, fazenda_destino_id = destino.
-- Sem backfill. Sem inicializar capital real.

ALTER TABLE `estoque_operacoes`
  ADD COLUMN `fazenda_destino_id` int NULL AFTER `fazenda_id`;

CREATE INDEX `estoque_operacoes_fazenda_destino_idx`
  ON `estoque_operacoes` (`fazenda_destino_id`);
