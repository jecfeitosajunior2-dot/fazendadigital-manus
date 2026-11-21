-- H4-AM — acrescenta semen_partidas_uq quando ele falta.
-- Identidade: (user_id, fazenda_id, reprodutor_key, partida), na ordem da migração 0027.
-- Não recria a tabela. Não muda id, saldo, custo, movimento nem histórico.
-- Não apaga nem funde partidas. Se houver duplicidade ou coluna anulável, recusa.
-- Não remove um índice de nome igual com estrutura diferente.
-- Não cria uma segunda restrição quando a mesma identidade já está protegida.
-- MySQL 8.4 não tem CREATE INDEX IF NOT EXISTS. A rotina abaixo confere o catálogo.
-- DDL não desfaz com ROLLBACK. Não aplicar em fazenda_digital sem autorização expressa.
-- Não entra no journal do Drizzle nesta fase. Não altera 0027, 0067 nem 0068.
--
-- Reversão, só depois de conferir o nome e as quatro colunas, e com autorização:
--   ALTER TABLE semen_partidas DROP INDEX semen_partidas_uq;
-- Esse DROP também é DDL. Ele não apaga partidas, saldos nem movimentos.

DROP PROCEDURE IF EXISTS fd_h4am_aplicar_semen_partidas_uq;
DELIMITER $$
CREATE PROCEDURE fd_h4am_aplicar_semen_partidas_uq()
rotina: BEGIN
  DECLARE v_n INT DEFAULT 0;
  DECLARE v_nao_unico INT DEFAULT 1;
  DECLARE v_prefixo INT DEFAULT 0;
  DECLARE v_cols TEXT;
  DECLARE v_tipo VARCHAR(32);
  DECLARE v_nome VARCHAR(64);
  DECLARE v_dup INT DEFAULT 0;
  DECLARE v_msg VARCHAR(128);

  SET SESSION group_concat_max_len = 4096;

  IF VERSION() NOT LIKE '8.%' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'semen_partidas_uq recusada: versao MySQL nao conferida';
  END IF;

  SELECT COUNT(*) INTO v_n
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'semen_partidas';
  IF v_n <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'semen_partidas_uq recusada: tabela ausente';
  END IF;

  SELECT COUNT(*) INTO v_n
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'semen_partidas'
    AND COLUMN_NAME IN ('user_id', 'fazenda_id', 'reprodutor_key', 'partida');
  IF v_n <> 4 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'semen_partidas_uq recusada: coluna da identidade ausente';
  END IF;

  SELECT COUNT(*) INTO v_n
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'semen_partidas'
    AND COLUMN_NAME IN ('user_id', 'fazenda_id', 'reprodutor_key', 'partida')
    AND IS_NULLABLE = 'YES';
  IF v_n > 0 THEN
    SELECT 'nulabilidade' AS diagnostico, COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE, COLLATION_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'semen_partidas'
      AND COLUMN_NAME IN ('user_id', 'fazenda_id', 'reprodutor_key', 'partida')
    ORDER BY ORDINAL_POSITION;
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'semen_partidas_uq recusada: coluna da identidade admite NULL';
  END IF;

  SELECT COUNT(*) INTO v_n
  FROM semen_partidas
  WHERE user_id IS NULL OR fazenda_id IS NULL OR reprodutor_key IS NULL OR partida IS NULL;
  IF v_n > 0 THEN
    SELECT 'nulo' AS diagnostico, id, user_id, fazenda_id, reprodutor_key, partida, saldo_doses, custo_unitario
    FROM semen_partidas
    WHERE user_id IS NULL OR fazenda_id IS NULL OR reprodutor_key IS NULL OR partida IS NULL
    ORDER BY id;
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'semen_partidas_uq recusada: existem valores NULL na identidade';
  END IF;

  SELECT COUNT(*),
         IFNULL(GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ','), ''),
         IFNULL(MAX(NON_UNIQUE), 1),
         IFNULL(SUM(SUB_PART IS NOT NULL), 0),
         IFNULL(MAX(INDEX_TYPE), '')
    INTO v_n, v_cols, v_nao_unico, v_prefixo, v_tipo
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'semen_partidas'
    AND INDEX_NAME = 'semen_partidas_uq';

  IF v_n > 0 THEN
    IF v_nao_unico <> 0 OR v_prefixo <> 0 OR v_n <> 4 OR v_tipo <> 'BTREE'
       OR LOWER(v_cols) <> 'user_id,fazenda_id,reprodutor_key,partida' THEN
      SET v_msg = LEFT(CONCAT('semen_partidas_uq divergente: ', v_cols, ' unico=', 1 - v_nao_unico, ' tipo=', v_tipo), 128);
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;
    SELECT 'ok' AS situacao, 'ja_conferido' AS acao, 'semen_partidas_uq' AS indice, VERSION() AS versao;
    LEAVE rotina;
  END IF;

  SELECT COUNT(*), MIN(INDEX_NAME) INTO v_n, v_nome
  FROM (
    SELECT INDEX_NAME,
           GROUP_CONCAT(COLUMN_NAME ORDER BY COLUMN_NAME SEPARATOR ',') AS conjunto,
           MAX(NON_UNIQUE) AS nao_unico,
           COUNT(*) AS n,
           SUM(SUB_PART IS NOT NULL) AS prefixo
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'semen_partidas'
    GROUP BY INDEX_NAME
  ) s
  WHERE nao_unico = 0 AND n = 4 AND prefixo = 0
    AND LOWER(conjunto) = 'fazenda_id,partida,reprodutor_key,user_id';

  IF v_n > 0 THEN
    SELECT 'ok' AS situacao, 'equivalente' AS acao, v_nome AS indice, VERSION() AS versao;
    LEAVE rotina;
  END IF;

  SELECT COUNT(*) INTO v_dup FROM (
    SELECT 1
    FROM semen_partidas
    GROUP BY user_id, fazenda_id, reprodutor_key, partida
    HAVING COUNT(*) > 1
  ) d;

  IF v_dup > 0 THEN
    SELECT 'conflito' AS diagnostico, p.id, p.user_id, p.fazenda_id, p.reprodutor_key, p.partida, p.saldo_doses, p.custo_unitario
    FROM semen_partidas p
    INNER JOIN (
      SELECT user_id, fazenda_id, reprodutor_key, partida
      FROM semen_partidas
      GROUP BY user_id, fazenda_id, reprodutor_key, partida
      HAVING COUNT(*) > 1
    ) g
      ON p.user_id = g.user_id
     AND p.fazenda_id = g.fazenda_id
     AND p.reprodutor_key = g.reprodutor_key
     AND p.partida = g.partida
    ORDER BY p.user_id, p.fazenda_id, p.reprodutor_key, p.partida, p.id;
    SET v_msg = LEFT(CONCAT('semen_partidas_uq recusada: ', v_dup, ' grupo(s) duplicado(s)'), 128);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  BEGIN
    DECLARE EXIT HANDLER FOR 1061
    BEGIN
      SELECT COUNT(*),
             IFNULL(GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ','), ''),
             IFNULL(MAX(NON_UNIQUE), 1)
        INTO v_n, v_cols, v_nao_unico
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'semen_partidas'
        AND INDEX_NAME = 'semen_partidas_uq';
      IF v_n = 4 AND v_nao_unico = 0 AND LOWER(v_cols) = 'user_id,fazenda_id,reprodutor_key,partida' THEN
        SELECT 'ok' AS situacao, 'ja_conferido' AS acao, 'semen_partidas_uq' AS indice, VERSION() AS versao;
      ELSE
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'semen_partidas_uq divergente apos disputa de nome';
      END IF;
    END;
    DECLARE EXIT HANDLER FOR 1062
    BEGIN
      SELECT 'conflito' AS diagnostico, p.id, p.user_id, p.fazenda_id, p.reprodutor_key, p.partida, p.saldo_doses, p.custo_unitario
      FROM semen_partidas p
      INNER JOIN (
        SELECT user_id, fazenda_id, reprodutor_key, partida
        FROM semen_partidas
        GROUP BY user_id, fazenda_id, reprodutor_key, partida
        HAVING COUNT(*) > 1
      ) g
        ON p.user_id = g.user_id
       AND p.fazenda_id = g.fazenda_id
       AND p.reprodutor_key = g.reprodutor_key
       AND p.partida = g.partida
      ORDER BY p.id;
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'semen_partidas_uq recusada: duplicidade durante o ALTER';
    END;

    ALTER TABLE semen_partidas
      ADD UNIQUE KEY semen_partidas_uq (user_id, fazenda_id, reprodutor_key, partida),
      ALGORITHM=INPLACE, LOCK=NONE;
  END;

  SELECT 'ok' AS situacao, 'criado' AS acao, 'semen_partidas_uq' AS indice, VERSION() AS versao;
END rotina$$
DELIMITER ;
CALL fd_h4am_aplicar_semen_partidas_uq();
DROP PROCEDURE IF EXISTS fd_h4am_aplicar_semen_partidas_uq;
