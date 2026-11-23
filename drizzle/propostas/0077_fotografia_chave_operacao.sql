-- PROPOSTA ISOLADA. Não aplicar no banco da fazenda.
-- Não copiar para drizzle/migrations e não registrar no journal.
-- Não preencher com fazenda, custo ou quantidade atuais.
--
-- A chave de manutenção e de abastecimento hoje compara o pedido com os
-- campos que estão gravados agora. Se o cabeçalho for editado depois,
-- o reenvio do pedido original deixa de bater e é recusado.
-- A recusa não abre um segundo consumo e não altera o dado comercial.
-- Esta fotografia guardaria o retrato do primeiro pedido, para devolver
-- o mesmo lançamento sem aceitar outro conteúdo na mesma chave.

ALTER TABLE `manutencoes`
  ADD COLUMN `conteudoOriginal` varchar(64) NULL;

ALTER TABLE `abastecimentos`
  ADD COLUMN `conteudoOriginal` varchar(64) NULL;
