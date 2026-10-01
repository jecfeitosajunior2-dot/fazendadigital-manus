-- Snapshot de conversão em movimentações de estoque.
-- Aditivo e retrocompatível: colunas nullable, sem backfill.
-- Movimentações antigas continuam válidas sem snapshot.

ALTER TABLE `estoque_movimentacoes`
  ADD COLUMN `unidade_estoque_snapshot` varchar(20) NULL,
  ADD COLUMN `conteudo_por_unidade_snapshot` decimal(12,4) NULL,
  ADD COLUMN `unidade_conteudo_snapshot` varchar(20) NULL,
  ADD COLUMN `quantidade_fisica_snapshot` decimal(12,3) NULL,
  ADD COLUMN `unidade_fisica_snapshot` varchar(20) NULL;
