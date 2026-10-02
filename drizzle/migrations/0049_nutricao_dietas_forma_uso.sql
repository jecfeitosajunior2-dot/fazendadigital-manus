-- Forma de uso operacional da dieta.
-- Aditivo e retrocompatível: coluna nullable, sem backfill.
-- NULL = cadastro anterior ainda não classificado.

ALTER TABLE `nutricao_dietas`
  ADD COLUMN `formaUso` varchar(30) NULL;
