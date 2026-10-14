-- Fornecedor oficial da OS terceirizada (Pessoas.id).
-- Sem backfill. OS antigas permanecem NULL e não são vinculadas pelo nome.

ALTER TABLE `manutencoes`
  ADD COLUMN `prestadorPessoaId` int NULL;
