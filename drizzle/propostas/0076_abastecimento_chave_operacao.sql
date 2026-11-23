-- Proposta 0076. Não aplicar no banco da fazenda nesta fase.
-- A chave identifica o reenvio do mesmo abastecimento.
-- O índice único é (userId, chaveOperacao). Vários NULL convivem nos registros antigos.
-- Não copia fazenda, custo nem quantidade de outro lançamento.

ALTER TABLE `abastecimentos`
  ADD COLUMN `chaveOperacao` varchar(80) NULL;

CREATE UNIQUE INDEX `abastecimentos_chave_operacao_uq`
  ON `abastecimentos` (`userId`, `chaveOperacao`);
