-- Fase 7.8.5-H4-AK — idempotência da entrada de sêmen.
-- Tabela nova. Não altera semen_partidas, semen_movimentacoes nem reproducao_operacoes.
-- A identidade da partida já existe desde a 0027:
--   UNIQUE semen_partidas_uq (user_id, fazenda_id, reprodutor_key, partida)
-- Esta fase NÃO cria outro índice em semen_partidas e NÃO reaplica a 0027.
-- Sem backfill. Entradas antigas não recebem chave.
-- UNIQUE (userId, chave): a mesma operação do titular não grava duas entradas.
-- Outro titular pode ter o mesmo texto de chave.
-- Não há chave estrangeira para a partida nem para o movimento: os ids só são
-- gravados nesta mesma transação, depois do saldo e do movimento.
--
-- NÃO EXECUTAR no banco operacional fazenda_digital.
-- NÃO rodar drizzle migrate, db:push nem ensureSchema.
-- NÃO incluir no journal enquanto ele estiver só com 0000.
-- NÃO alterar a 0067.
-- Aplicação autorizada nesta fase: somente MySQL descartável.

CREATE TABLE `semen_entrada_operacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `chave` varchar(64) NOT NULL,
  `fazendaId` int NOT NULL,
  `executorUserId` int NOT NULL,
  `conteudoHash` varchar(64) NOT NULL,
  `partidaId` int NULL,
  `movimentacaoId` int NULL,
  `saldoAtual` int NULL,
  `custoMedioAtual` varchar(20) NULL,
  `novaEntrada` tinyint(1) NOT NULL DEFAULT 0,
  `criadoEm` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `semen_entrada_operacoes_titular_chave_uq` (`userId`, `chave`)
) ENGINE=InnoDB;
