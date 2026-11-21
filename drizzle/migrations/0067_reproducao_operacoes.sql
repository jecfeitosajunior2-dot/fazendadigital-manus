-- Fase 7.8.5-H4-AJ — idempotência da estação de monta e da cobertura coletiva.
-- Tabela nova. Não altera reproducao_registros nem qualquer tabela já existente.
-- Sem backfill. Lançamentos antigos não recebem chave.
-- UNIQUE (userId, chave): a mesma operação do titular não grava dois principais.
-- Outro titular pode ter o mesmo texto de chave.
-- Não há chave estrangeira para o registro principal: o id só é gravado
-- nesta mesma transação, depois do insert do touro. Uma chave estrangeira
-- também aceitaria o id de uma cópia e prenderia a exclusão futura.
--
-- NÃO EXECUTAR no banco operacional fazenda_digital.
-- NÃO rodar drizzle migrate, db:push nem ensureSchema.
-- NÃO incluir no journal enquanto ele estiver só com 0000.
-- Aplicação autorizada nesta fase: somente MySQL descartável.

CREATE TABLE `reproducao_operacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `chave` varchar(64) NOT NULL,
  `fazendaId` int NOT NULL,
  `executorUserId` int NOT NULL,
  `conteudoHash` varchar(64) NOT NULL,
  `registroPrincipalId` int NULL,
  `espelhosMatriz` int NOT NULL DEFAULT 0,
  `matrizesIgnoradas` int NOT NULL DEFAULT 0,
  `criadoEm` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reproducao_operacoes_titular_chave_uq` (`userId`, `chave`)
) ENGINE=InnoDB;
