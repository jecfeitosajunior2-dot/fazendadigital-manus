-- Fase 7.5 — identidade, situação e versão da sessão.
-- NÃO EXECUTAR nesta etapa no banco operacional fazenda_digital.
-- NÃO aplicar em banco de homologação.
-- NÃO reiniciar o servidor oficial antes da migração autorizada.
-- NÃO usar db:push, drizzle migrate nem ensureSchema para esta mudança.
-- NÃO alterar e-mail, senha, userId operacional nem outros módulos.
-- Abrir este arquivo só cria a procedure. O CALL abaixo permanece comentado.
--
-- O ALTER TABLE grava na hora. O UPDATE não volta junto com ele.
-- Por isso a procedure é retomável:
--   aplicar  — ainda não há colunas: faz o ALTER e, em seguida, a identificação.
--   reparar  — o ALTER já ficou e o principal ainda não foi marcado: só faz o UPDATE.
--   nada     — o principal já está certo: não grava de novo e não mexe na versão da sessão.
-- Qualquer outro estado para antes de gravar.
--
-- Sequência, somente com autorização e depois do backup conferido:
-- 1. Manter o servidor atual no ar. Não usar db:push.
-- 2. Ler de novo: 1 usuário, 1 administrador, nenhum e-mail vazio ou repetido.
-- 3. No cliente mysql, com o banco fazenda_digital selecionado, aplicar este arquivo.
-- 4. CALL fd_75_identidade_sessao();
-- 5. O resultado precisa ser aplicar ou reparar, com o id do administrador.
-- 6. Conferir, sem ler senha nem e-mail: role=admin, papel=principal,
--    situacao=ativo, titularUserId=id, sessionVersion=0.
-- 7. CALL outra vez. O resultado precisa ser nada, sem mudar a versão da sessão.
-- 8. Só então reiniciar o servidor oficial.
-- 9. DROP PROCEDURE IF EXISTS fd_75_identidade_sessao;
--
-- Recuperação:
-- Se o CALL disser que a identificação não foi confirmada, o ALTER pode já ter ficado.
-- Não reiniciar o servidor novo. Chamar CALL de novo. A segunda vez não repete o ALTER.
-- Se a mensagem for de estado inesperado, nada foi gravado nessa chamada.
-- Não corrigir à mão sem autorização.
--
-- Rollback do schema, só com autorização, com o servidor novo parado,
-- e sem apagar o usuário:
-- ALTER TABLE `users`
--   DROP INDEX `users_email_uq`,
--   DROP COLUMN `papel`,
--   DROP COLUMN `titularUserId`,
--   DROP COLUMN `situacao`,
--   DROP COLUMN `sessionVersion`,
--   DROP COLUMN `inativadoEm`,
--   DROP COLUMN `inativadoPorUserId`;

DROP PROCEDURE IF EXISTS fd_75_identidade_sessao;

DELIMITER $$

CREATE PROCEDURE fd_75_identidade_sessao()
BEGIN
  DECLARE total_usuarios INT;
  DECLARE total_admins INT;
  DECLARE emails_nulos INT;
  DECLARE grupos_duplicados INT;
  DECLARE cols_novas INT;
  DECLARE indice_email INT;
  DECLARE admin_id INT;
  DECLARE admin_id_fim INT;
  DECLARE admin_com_senha INT;
  DECLARE principal_ok INT;
  DECLARE estado_parcial INT;
  DECLARE acao VARCHAR(20);

  SELECT COUNT(*) INTO total_usuarios FROM users;
  SELECT COUNT(*) INTO total_admins FROM users WHERE role = 'admin';
  SELECT MIN(id), MAX(id) INTO admin_id, admin_id_fim FROM users WHERE role = 'admin';
  SELECT COUNT(*) INTO emails_nulos FROM users WHERE email IS NULL OR TRIM(email) = '';
  SELECT COUNT(*) INTO grupos_duplicados FROM (
    SELECT email FROM users
    WHERE email IS NOT NULL AND TRIM(email) <> ''
    GROUP BY email
    HAVING COUNT(*) > 1
  ) duplicados;
  SELECT COUNT(*) INTO admin_com_senha
    FROM users
    WHERE id = admin_id
      AND role = 'admin'
      AND passwordHash IS NOT NULL
      AND CHAR_LENGTH(passwordHash) > 0;
  SELECT COUNT(*) INTO cols_novas
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME IN (
        'papel',
        'titularUserId',
        'situacao',
        'sessionVersion',
        'inativadoEm',
        'inativadoPorUserId'
      );
  SELECT COUNT(*) INTO indice_email
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND INDEX_NAME = 'users_email_uq';

  IF total_usuarios <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.5 interrompida: quantidade de usuarios diferente de 1. Nada foi alterado.';
  END IF;
  IF total_admins <> 1 OR admin_id IS NULL OR admin_id <> admin_id_fim THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.5 interrompida: administrador principal nao identificado. Nada foi alterado.';
  END IF;
  IF admin_com_senha <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.5 interrompida: administrador sem senha. Nada foi alterado.';
  END IF;
  IF emails_nulos <> 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.5 interrompida: existe e-mail nulo. Nenhum e-mail foi alterado.';
  END IF;
  IF grupos_duplicados <> 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.5 interrompida: e-mail duplicado. Nenhum e-mail foi alterado.';
  END IF;

  IF cols_novas = 0 AND indice_email = 0 THEN
    SET acao = 'aplicar';
    ALTER TABLE `users`
      ADD COLUMN `papel` ENUM('principal', 'secundario', 'comum') NOT NULL DEFAULT 'comum',
      ADD COLUMN `titularUserId` INT NULL,
      ADD COLUMN `situacao` ENUM('convidado', 'ativo', 'inativo') NOT NULL DEFAULT 'ativo',
      ADD COLUMN `sessionVersion` INT NOT NULL DEFAULT 0,
      ADD COLUMN `inativadoEm` TIMESTAMP NULL,
      ADD COLUMN `inativadoPorUserId` INT NULL,
      ADD UNIQUE INDEX `users_email_uq` (`email`);
  ELSEIF cols_novas = 6 AND indice_email > 0 THEN
    SELECT COUNT(*) INTO principal_ok
      FROM users
      WHERE id = admin_id
        AND role = 'admin'
        AND papel = 'principal'
        AND situacao = 'ativo'
        AND titularUserId = id;
    IF principal_ok = 1 THEN
      SET acao = 'nada';
    ELSE
      SELECT COUNT(*) INTO estado_parcial
        FROM users
        WHERE id = admin_id
          AND role = 'admin'
          AND papel = 'comum'
          AND situacao = 'ativo'
          AND titularUserId IS NULL
          AND inativadoEm IS NULL
          AND inativadoPorUserId IS NULL;
      IF estado_parcial <> 1 THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Migracao 7.5 interrompida: estado inesperado. Nenhuma alteracao foi feita.';
      END IF;
      SET acao = 'reparar';
    END IF;
  ELSE
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.5 interrompida: schema parcial inesperado. Nenhuma alteracao foi feita.';
  END IF;

  IF acao = 'aplicar' OR acao = 'reparar' THEN
    START TRANSACTION;
    UPDATE `users`
      SET `papel` = 'principal',
          `situacao` = 'ativo',
          `titularUserId` = `id`,
          `sessionVersion` = 0
      WHERE `id` = admin_id
        AND `role` = 'admin'
        AND `papel` = 'comum'
        AND `situacao` = 'ativo'
        AND `titularUserId` IS NULL;
    SELECT COUNT(*) INTO principal_ok
      FROM users
      WHERE id = admin_id
        AND role = 'admin'
        AND papel = 'principal'
        AND situacao = 'ativo'
        AND titularUserId = id
        AND sessionVersion = 0
        AND inativadoEm IS NULL
        AND inativadoPorUserId IS NULL;
    IF principal_ok <> 1 THEN
      ROLLBACK;
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Migracao 7.5 incompleta: principal nao confirmado. Execute CALL novamente.';
    END IF;
    COMMIT;
  END IF;

  SELECT COUNT(*) INTO principal_ok
    FROM users
    WHERE id = admin_id
      AND role = 'admin'
      AND papel = 'principal'
      AND situacao = 'ativo'
      AND titularUserId = id;
  IF principal_ok <> 1 OR (SELECT COUNT(*) FROM users) <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Migracao 7.5 incompleta: principal nao confirmado. Execute CALL novamente.';
  END IF;

  SELECT acao AS resultado, admin_id AS administrador_id;
END$$

DELIMITER ;

-- Quando houver autorização expressa no banco operacional, e só então:
-- CALL fd_75_identidade_sessao();
-- DROP PROCEDURE IF EXISTS fd_75_identidade_sessao;
