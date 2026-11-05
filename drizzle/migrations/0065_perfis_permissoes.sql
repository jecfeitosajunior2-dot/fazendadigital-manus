-- Fase 7.8.3 — perfis de acesso e permissões efetivas.
-- NÃO EXECUTAR nesta etapa no banco operacional fazenda_digital.
-- NÃO usar db:push, drizzle migrate nem ensureSchema.
-- NÃO inserir perfis, permissões ou usuários.
-- A única mudança em tabela já existente é o índice único users(id, titularUserId).
-- Esse índice não altera valores de users.role, users.papel nem users.titularUserId.
-- Abrir este arquivo só cria a procedure. O CALL permanece comentado.
--
-- Perfil é modelo. A cópia vai para usuario_permissoes e não acompanha edição posterior.
-- origemPerfilId é referência histórica. Inativar o perfil não apaga a cópia.
-- Não há exclusão em cascata.
-- O nome único da conta usa a collation utf8mb4_0900_ai_ci (maiúsculas e acentos).
-- A aplicação ainda reduz espaços antes de gravar e recusa identificador fora do catálogo.
-- A chave (origemPerfilId, titularUserId) recusa perfil de outra conta.
-- A chave (userId, titularUserId) só aceita o titular gravado na própria linha do usuário.
-- Mudar o titular de quem já tem permissão é recusado. O histórico permanece.
--
-- Sequência, somente com autorização posterior:
-- 1. Backup conferido. Servidor atual pode continuar no ar.
-- 2. Aplicar este arquivo no banco fazenda_digital.
-- 3. CALL fd_78_perfis_permissoes();
-- 4. Conferir as três tabelas vazias, os índices e as chaves estrangeiras.
-- 5. Segunda chamada deve recusar sem alterar as tabelas.
-- 6. Só então incluir as tabelas na verificação de boot e reiniciar, se for o caso.
--
-- Rollback, só com autorização e com as três tabelas vazias, nesta ordem:
-- DROP TABLE `usuario_permissoes`;
-- DROP TABLE `perfil_permissoes`;
-- DROP TABLE `perfis_acesso`;
-- ALTER TABLE `users` DROP INDEX `users_id_titular_uq`;

DROP PROCEDURE IF EXISTS fd_78_perfis_permissoes;

DELIMITER $$

CREATE PROCEDURE fd_78_perfis_permissoes()
BEGIN
  DECLARE n_perfis INT;
  DECLARE n_itens INT;
  DECLARE n_efetivas INT;
  DECLARE presentes INT;
  DECLARE indices INT;
  DECLARE chaves INT;
  DECLARE idx_titular INT;

  SELECT COUNT(DISTINCT INDEX_NAME) INTO idx_titular
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND INDEX_NAME = 'users_id_titular_uq';

  SELECT COUNT(*) INTO n_perfis
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'perfis_acesso';

  SELECT COUNT(*) INTO n_itens
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'perfil_permissoes';

  SELECT COUNT(*) INTO n_efetivas
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'usuario_permissoes';

  SET presentes = n_perfis + n_itens + n_efetivas;

  IF presentes = 3 AND idx_titular = 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.8.3 interrompida: tabelas de perfil ja existem. Nada foi alterado.';
  END IF;

  IF presentes = 3 AND idx_titular = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.8.3 incompleta: faltou indice de titular. Nada foi alterado.';
  END IF;

  IF presentes = 0 AND idx_titular = 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.8.3 incompleta: so indice de titular. Nada foi alterado.';
  END IF;

  IF n_perfis = 1 AND n_itens = 0 AND n_efetivas = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.8.3 incompleta: so perfis_acesso. Nada foi alterado.';
  END IF;

  IF n_perfis = 0 AND n_itens = 1 AND n_efetivas = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.8.3 incompleta: so perfil_permissoes. Nada foi alterado.';
  END IF;

  IF n_perfis = 0 AND n_itens = 0 AND n_efetivas = 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.8.3 incompleta: so usuario_permissoes. Nada foi alterado.';
  END IF;

  IF n_perfis = 1 AND n_itens = 1 AND n_efetivas = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.8.3 incompleta: faltou usuario_permissoes. Nada foi alterado.';
  END IF;

  IF n_perfis = 1 AND n_itens = 0 AND n_efetivas = 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.8.3 incompleta: faltou perfil_permissoes. Nada foi alterado.';
  END IF;

  IF n_perfis = 0 AND n_itens = 1 AND n_efetivas = 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.8.3 incompleta: faltou perfis_acesso. Nada foi alterado.';
  END IF;

  ALTER TABLE `users`
    ADD UNIQUE KEY `users_id_titular_uq` (`id`, `titularUserId`);

  CREATE TABLE `perfis_acesso` (
    `id` int NOT NULL AUTO_INCREMENT,
    `titularUserId` int NOT NULL,
    `nome` varchar(80) NOT NULL,
    `descricao` varchar(255) NULL,
    `situacao` enum('ativo','inativo') NOT NULL DEFAULT 'ativo',
    `criadoPorUserId` int NOT NULL,
    `criadoEm` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `atualizadoEm` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `perfis_acesso_titular_nome_uq` (`titularUserId`, `nome`),
    UNIQUE KEY `perfis_acesso_id_titular_uq` (`id`, `titularUserId`),
    KEY `perfis_acesso_criado_por_idx` (`criadoPorUserId`),
    CONSTRAINT `perfis_acesso_titular_fk`
      FOREIGN KEY (`titularUserId`) REFERENCES `users` (`id`)
      ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `perfis_acesso_criado_por_fk`
      FOREIGN KEY (`criadoPorUserId`) REFERENCES `users` (`id`)
      ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

  CREATE TABLE `perfil_permissoes` (
    `id` int NOT NULL AUTO_INCREMENT,
    `perfilId` int NOT NULL,
    `permissao` varchar(80) NOT NULL,
    `criadoEm` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `perfil_permissoes_perfil_permissao_uq` (`perfilId`, `permissao`),
    CONSTRAINT `perfil_permissoes_perfil_fk`
      FOREIGN KEY (`perfilId`) REFERENCES `perfis_acesso` (`id`)
      ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

  CREATE TABLE `usuario_permissoes` (
    `id` int NOT NULL AUTO_INCREMENT,
    `userId` int NOT NULL,
    `titularUserId` int NOT NULL,
    `permissao` varchar(80) NOT NULL,
    `concedidoPorUserId` int NOT NULL,
    `origemPerfilId` int NULL,
    `concedidoEm` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `usuario_permissoes_usuario_permissao_uq` (`userId`, `permissao`),
    KEY `usuario_permissoes_usuario_titular_idx` (`userId`, `titularUserId`),
    KEY `usuario_permissoes_origem_titular_idx` (`origemPerfilId`, `titularUserId`),
    KEY `usuario_permissoes_concedido_idx` (`concedidoPorUserId`),
    KEY `usuario_permissoes_titular_idx` (`titularUserId`),
    CONSTRAINT `usuario_permissoes_user_fk`
      FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
      ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `usuario_permissoes_usuario_titular_fk`
      FOREIGN KEY (`userId`, `titularUserId`) REFERENCES `users` (`id`, `titularUserId`)
      ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `usuario_permissoes_concedido_fk`
      FOREIGN KEY (`concedidoPorUserId`) REFERENCES `users` (`id`)
      ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `usuario_permissoes_titular_fk`
      FOREIGN KEY (`titularUserId`) REFERENCES `users` (`id`)
      ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `usuario_permissoes_origem_fk`
      FOREIGN KEY (`origemPerfilId`, `titularUserId`) REFERENCES `perfis_acesso` (`id`, `titularUserId`)
      ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

  SELECT COUNT(*) INTO n_perfis
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'perfis_acesso';
  SELECT COUNT(*) INTO n_itens
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'perfil_permissoes';
  SELECT COUNT(*) INTO n_efetivas
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuario_permissoes';
  IF n_perfis <> 1 OR n_itens <> 1 OR n_efetivas <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.8.3 incompleta: criacao nao confirmada.';
  END IF;

  SELECT COUNT(DISTINCT INDEX_NAME) INTO indices
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND INDEX_NAME IN (
        'perfis_acesso_titular_nome_uq',
        'perfil_permissoes_perfil_permissao_uq',
        'usuario_permissoes_usuario_permissao_uq'
      );
  IF indices <> 3 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.8.3 incompleta: indice unico nao confirmado.';
  END IF;

  SELECT COUNT(DISTINCT INDEX_NAME) INTO idx_titular
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND INDEX_NAME = 'users_id_titular_uq';
  IF idx_titular <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.8.3 incompleta: indice de titular nao confirmado.';
  END IF;

  SELECT COUNT(*) INTO chaves
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND DELETE_RULE = 'RESTRICT'
      AND UPDATE_RULE = 'RESTRICT'
      AND CONSTRAINT_NAME IN (
        'perfis_acesso_titular_fk',
        'perfis_acesso_criado_por_fk',
        'perfil_permissoes_perfil_fk',
        'usuario_permissoes_user_fk',
        'usuario_permissoes_usuario_titular_fk',
        'usuario_permissoes_concedido_fk',
        'usuario_permissoes_titular_fk',
        'usuario_permissoes_origem_fk'
      );
  IF chaves <> 8 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.8.3 incompleta: chave estrangeira nao confirmada.';
  END IF;

  SELECT 'aplicar' AS resultado;
END$$

DELIMITER ;

-- Quando houver autorização expressa no banco operacional, e só então:
-- CALL fd_78_perfis_permissoes();
-- DROP PROCEDURE IF EXISTS fd_78_perfis_permissoes;
