-- Proposta 0075. Não aplicar no banco da fazenda nesta fase.
-- A manutenção ainda não guarda a fazenda da época.
-- Registros antigos permanecem com fazendaId NULL.
-- Não copiar a fazenda atual da máquina para o passado.

ALTER TABLE `manutencoes`
  ADD COLUMN `fazendaId` int NULL;
