-- Homologação 1.5: invariantes de estorno integral e pernas da transferência.
-- Sem backfill. Sem seed. Sem alteração de dados.

ALTER TABLE `financeiro_liquidacoes`
  ADD UNIQUE KEY `financeiro_liquidacoes_original_uq` (`liquidacao_original_id`);

ALTER TABLE `financeiro_transferencias`
  ADD UNIQUE KEY `financeiro_transferencias_original_uq` (`transferencia_original_id`);

ALTER TABLE `financeiro_movimentos`
  ADD UNIQUE KEY `financeiro_movimentos_transf_dir_uq` (`transferencia_id`, `direcao`);
