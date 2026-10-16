-- Chave de operação da OS (idempotência da manutenção + financeiro).
-- Sem backfill. OS antigas permanecem NULL.
-- UNIQUE (userId, chaveOperacao): o MySQL permite vários NULL.
-- NÃO EXECUTAR nesta etapa. Não rodar db:push.

ALTER TABLE `manutencoes`
  ADD COLUMN `chaveOperacao` varchar(80) NULL;

CREATE UNIQUE INDEX `manutencoes_chave_operacao_uq`
  ON `manutencoes` (`userId`, `chaveOperacao`);
