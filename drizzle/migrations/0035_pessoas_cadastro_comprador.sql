-- Dados opcionais do cadastro de comprador (pessoas.tipo = cliente).
-- Não cria fazendaId e não altera vendas.

ALTER TABLE `pessoas`
  ADD COLUMN `propriedade_estabelecimento` varchar(255) NULL AFTER `observacoes`,
  ADD COLUMN `nome_contato` varchar(255) NULL AFTER `propriedade_estabelecimento`,
  ADD COLUMN `cidade` varchar(100) NULL AFTER `nome_contato`,
  ADD COLUMN `uf` varchar(2) NULL AFTER `cidade`;
