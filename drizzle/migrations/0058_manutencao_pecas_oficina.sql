-- Origem da peça (estoque | oficina) e totais da oficina.
-- Sem backfill. Linhas antigas ficam NULL e não viram oficina.

ALTER TABLE `manutencao_pecas`
  ADD COLUMN `origem` varchar(20) NULL;

ALTER TABLE `manutencoes`
  ADD COLUMN `valorPecasOficina` decimal(10,2) NULL,
  ADD COLUMN `valorCobradoOficina` decimal(10,2) NULL;
