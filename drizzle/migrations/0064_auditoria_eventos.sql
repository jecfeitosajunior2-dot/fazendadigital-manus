-- Fase 7.7 — histórico de atividades.
-- NÃO EXECUTAR nesta etapa no banco operacional fazenda_digital.
-- NÃO usar db:push, drizzle migrate nem ensureSchema.
-- NÃO inserir eventos, usuários ou vínculos.
-- NÃO alterar tabelas operacionais existentes.
-- Abrir este arquivo só cria a procedure. O CALL permanece comentado.
--
-- A tabela é somente de inclusão pela aplicação.
-- Não há rotina de edição ou exclusão de eventos.
-- As chaves estrangeiras recusam apagar usuário ou fazenda que ainda tenham histórico.
-- Não há exclusão em cascata.
--
-- Sequência, somente com autorização posterior:
-- 1. Backup conferido. Servidor atual pode continuar no ar.
-- 2. Aplicar este arquivo no banco fazenda_digital.
-- 3. CALL fd_77_auditoria_eventos();
-- 4. Conferir a tabela vazia, os índices e as chaves estrangeiras.
-- 5. Segunda chamada deve recusar sem alterar a tabela.
-- 6. Só então incluir a tabela na verificação de boot e reiniciar, se for o caso.
--
-- Rollback, só com autorização e com a tabela vazia:
-- DROP TABLE `auditoria_eventos`;

DROP PROCEDURE IF EXISTS fd_77_auditoria_eventos;

DELIMITER $$

CREATE PROCEDURE fd_77_auditoria_eventos()
BEGIN
  DECLARE tabela INT;

  SELECT COUNT(*) INTO tabela
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'auditoria_eventos';

  IF tabela <> 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.7 interrompida: auditoria_eventos ja existe. Nada foi alterado.';
  END IF;

  CREATE TABLE `auditoria_eventos` (
    `id` int NOT NULL AUTO_INCREMENT,
    `executorUserId` int NOT NULL,
    `executorNome` varchar(255) NOT NULL,
    `titularUserId` int NOT NULL,
    `fazendaId` int NULL,
    `modulo` varchar(80) NOT NULL,
    `operacao` varchar(80) NOT NULL,
    `registroTipo` varchar(80) NULL,
    `registroId` int NULL,
    `dadosAnteriores` text NULL,
    `dadosPosteriores` text NULL,
    `criadoEm` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `auditoria_eventos_titular_criado_idx` (`titularUserId`, `criadoEm`),
    KEY `auditoria_eventos_fazenda_criado_idx` (`fazendaId`, `criadoEm`),
    KEY `auditoria_eventos_executor_idx` (`executorUserId`),
    KEY `auditoria_eventos_modulo_criado_idx` (`modulo`, `criadoEm`),
    CONSTRAINT `auditoria_eventos_executor_fk`
      FOREIGN KEY (`executorUserId`) REFERENCES `users` (`id`)
      ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `auditoria_eventos_titular_fk`
      FOREIGN KEY (`titularUserId`) REFERENCES `users` (`id`)
      ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `auditoria_eventos_fazenda_fk`
      FOREIGN KEY (`fazendaId`) REFERENCES `fazendas` (`id`)
      ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

  SELECT COUNT(*) INTO tabela
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'auditoria_eventos';
  IF tabela <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.7 incompleta: tabela nao confirmada.';
  END IF;

  SELECT 'aplicar' AS resultado;
END$$

DELIMITER ;

-- Quando houver autorização expressa no banco operacional, e só então:
-- CALL fd_77_auditoria_eventos();
-- DROP PROCEDURE IF EXISTS fd_77_auditoria_eventos;
