-- Fase 7.6 — autorização explícita de fazenda.
-- NÃO EXECUTAR nesta etapa no banco operacional fazenda_digital.
-- NÃO usar db:push, drizzle migrate nem ensureSchema.
-- NÃO inserir usuários, vínculos ou alterar userId de registros existentes.
-- Abrir este arquivo só cria a procedure. O CALL permanece comentado.
--
-- A tabela não usa exclusão em cascata. Apagar usuário ou fazenda com vínculo é recusado.
-- O Administrador Principal não precisa de linha aqui para ver as fazendas dele.
--
-- Sequência, somente com autorização posterior:
-- 1. Backup conferido. Servidor atual pode continuar no ar.
-- 2. Aplicar este arquivo no banco fazenda_digital.
-- 3. CALL fd_76_usuario_fazendas();
-- 4. Conferir que a tabela existe, vazia, com o índice único.
-- 5. Segunda chamada deve recusar sem alterar a tabela.
-- 6. Só então incluir a tabela na verificação de boot e reiniciar, se for o caso.
--
-- Rollback, só com autorização e com a tabela vazia:
-- DROP TABLE `usuario_fazendas`;

DROP PROCEDURE IF EXISTS fd_76_usuario_fazendas;

DELIMITER $$

CREATE PROCEDURE fd_76_usuario_fazendas()
BEGIN
  DECLARE tabela INT;

  SELECT COUNT(*) INTO tabela
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'usuario_fazendas';

  IF tabela <> 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.6 interrompida: usuario_fazendas ja existe. Nada foi alterado.';
  END IF;

  CREATE TABLE `usuario_fazendas` (
    `id` int NOT NULL AUTO_INCREMENT,
    `userId` int NOT NULL,
    `fazendaId` int NOT NULL,
    `concedidoPorUserId` int NOT NULL,
    `concedidoEm` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `usuario_fazendas_usuario_fazenda_uq` (`userId`, `fazendaId`),
    KEY `usuario_fazendas_user_idx` (`userId`),
    KEY `usuario_fazendas_fazenda_idx` (`fazendaId`),
    CONSTRAINT `usuario_fazendas_user_fk`
      FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
      ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `usuario_fazendas_fazenda_fk`
      FOREIGN KEY (`fazendaId`) REFERENCES `fazendas` (`id`)
      ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `usuario_fazendas_concedido_fk`
      FOREIGN KEY (`concedidoPorUserId`) REFERENCES `users` (`id`)
      ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

  SELECT COUNT(*) INTO tabela
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'usuario_fazendas';
  IF tabela <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.6 incompleta: tabela nao confirmada.';
  END IF;

  SELECT 'aplicar' AS resultado;
END$$

DELIMITER ;

-- Quando houver autorização expressa no banco operacional, e só então:
-- CALL fd_76_usuario_fazendas();
-- DROP PROCEDURE IF EXISTS fd_76_usuario_fazendas;
