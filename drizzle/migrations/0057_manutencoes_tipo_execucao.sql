-- Tipo de execução da OS (interna | externa). Sem backfill.
-- Registros antigos permanecem NULL e não são classificados.

ALTER TABLE `manutencoes`
  ADD COLUMN `tipoExecucao` varchar(20) NULL;
