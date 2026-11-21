-- H4-AR — unicidade do brinco ativo por titular e fazenda.
-- Não substitui a proposta 0070. A 0070 continua no arquivo original e não deve ser aplicada:
-- ela impede o mesmo brinco ativo em fazendas diferentes do mesmo titular.
-- Não entra no journal. Não aplicar em fazenda_digital.
-- Não apaga, não renumerar e não reescreve brinco, status nem histórico.
-- DDL não desfaz com ROLLBACK. Se houver duplicidade ou índice incompatível, a rotina recusa antes do ALTER.
-- MySQL 8.4 não tem CREATE INDEX IF NOT EXISTS.
--
-- A chave é NULL quando o animal não está ativo, quando o brinco está vazio
-- ou quando só tem espaço. O índice único do MySQL aceita vários NULL,
-- então baixa, morte, transferência e brinco em branco continuam podendo repetir.
-- A comparação é binária depois de TRIM e LOWER. Zeros à esquerda e acentos permanecem distintos.
-- Animal ativo sem fazenda (fazendaId NULL) não entra nesta chave: o NULL não conflita com outro NULL.
--
-- Reversão, só com autorização e depois de conferir o nome:
--   ALTER TABLE animais DROP INDEX animais_brinco_ativo_fazenda_uq;
--   ALTER TABLE animais DROP COLUMN brinco_ativo_chave;

DROP PROCEDURE IF EXISTS fd_h4ar_aplicar_brinco_ativo_fazenda_uq;
DELIMITER $$
CREATE PROCEDURE fd_h4ar_aplicar_brinco_ativo_fazenda_uq()
rotina: BEGIN
  DECLARE v_tabela INT DEFAULT 0;
  DECLARE v_colunas INT DEFAULT 0;
  DECLARE v_indice_antigo INT DEFAULT 0;
  DECLARE v_coluna_chave INT DEFAULT 0;
  DECLARE v_indice INT DEFAULT 0;
  DECLARE v_nao_unico INT DEFAULT 1;
  DECLARE v_dup INT DEFAULT 0;
  DECLARE v_cols TEXT;
  DECLARE v_collation VARCHAR(64);
  DECLARE v_extra VARCHAR(256);
  DECLARE v_geracao TEXT;

  IF VERSION() NOT LIKE '8.%' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'brinco ativo recusado: versao MySQL nao conferida';
  END IF;

  SELECT COUNT(*) INTO v_tabela
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'animais';
  IF v_tabela <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'brinco ativo recusado: tabela ausente';
  END IF;

  SELECT COUNT(*) INTO v_colunas
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'animais'
    AND COLUMN_NAME IN ('userId', 'fazendaId', 'brinco', 'status');
  IF v_colunas <> 4 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'brinco ativo recusado: coluna da identidade ausente';
  END IF;

  SELECT COUNT(*) INTO v_indice_antigo
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'animais'
    AND INDEX_NAME = 'animais_user_brinco_ativo_uq';
  IF v_indice_antigo > 0 THEN
    SELECT 'incompativel' AS diagnostico, INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME, NON_UNIQUE
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'animais'
      AND INDEX_NAME = 'animais_user_brinco_ativo_uq'
    ORDER BY SEQ_IN_INDEX;
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'brinco ativo recusado: indice da proposta 0070 ja existe';
  END IF;

  SELECT COUNT(*) INTO v_coluna_chave
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'animais'
    AND COLUMN_NAME = 'brinco_ativo_chave';
  IF v_coluna_chave = 1 THEN
    SELECT IFNULL(COLLATION_NAME, ''), IFNULL(EXTRA, ''), IFNULL(GENERATION_EXPRESSION, '')
      INTO v_collation, v_extra, v_geracao
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'animais'
      AND COLUMN_NAME = 'brinco_ativo_chave';
    IF v_collation <> 'utf8mb4_bin'
       OR v_extra NOT LIKE '%GENERATED%'
       OR LOWER(v_geracao) NOT LIKE '%trim%'
       OR (LOWER(v_geracao) NOT LIKE '%lower(%' AND LOWER(v_geracao) NOT LIKE '%lcase(%') THEN
      SELECT 'coluna_incompativel' AS diagnostico, v_collation AS collation, v_extra AS extra;
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'brinco ativo recusado: coluna gerada incompativel';
    END IF;
  END IF;

  SELECT COUNT(*),
         IFNULL(GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ','), ''),
         IFNULL(MAX(NON_UNIQUE), 1)
    INTO v_indice, v_cols, v_nao_unico
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'animais'
    AND INDEX_NAME = 'animais_brinco_ativo_fazenda_uq';

  IF v_indice > 0 THEN
    IF v_nao_unico <> 0 OR v_indice <> 3 OR v_cols <> 'userId,fazendaId,brinco_ativo_chave' THEN
      SELECT 'indice_incompativel' AS diagnostico, v_cols AS colunas, v_nao_unico AS nao_unico;
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'brinco ativo recusado: indice existente tem outra forma';
    END IF;
    SELECT 'ok' AS situacao, 'ja_conferido' AS acao, 'animais_brinco_ativo_fazenda_uq' AS indice;
    LEAVE rotina;
  END IF;

  SELECT COUNT(*) INTO v_dup
  FROM (
    SELECT userId, fazendaId, LOWER(TRIM(brinco)) COLLATE utf8mb4_bin AS chave
    FROM animais
    WHERE status = 'ativo'
      AND fazendaId IS NOT NULL
      AND brinco IS NOT NULL
      AND CHAR_LENGTH(TRIM(brinco)) > 0
    GROUP BY userId, fazendaId, chave
    HAVING COUNT(*) > 1
  ) duplicados;

  IF v_dup > 0 THEN
    SELECT 'duplicado_ativo' AS diagnostico, a.id, a.userId, a.fazendaId, a.brinco, a.status
    FROM animais a
    INNER JOIN (
      SELECT userId, fazendaId, LOWER(TRIM(brinco)) COLLATE utf8mb4_bin AS chave
      FROM animais
      WHERE status = 'ativo'
        AND fazendaId IS NOT NULL
        AND brinco IS NOT NULL
        AND CHAR_LENGTH(TRIM(brinco)) > 0
      GROUP BY userId, fazendaId, chave
      HAVING COUNT(*) > 1
    ) d
      ON d.userId = a.userId
     AND d.fazendaId = a.fazendaId
     AND d.chave = (LOWER(TRIM(a.brinco)) COLLATE utf8mb4_bin)
    WHERE a.status = 'ativo'
    ORDER BY a.userId, a.fazendaId, a.id;
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'brinco ativo recusado: brinco ativo repetido na mesma fazenda';
  END IF;

  IF v_coluna_chave = 0 THEN
    ALTER TABLE animais
      ADD COLUMN brinco_ativo_chave varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
        GENERATED ALWAYS AS (
          CASE
            WHEN status = 'ativo' AND brinco IS NOT NULL AND CHAR_LENGTH(TRIM(brinco)) > 0
              THEN LOWER(TRIM(brinco)) COLLATE utf8mb4_bin
            ELSE NULL
          END
        ) STORED,
      ADD UNIQUE KEY animais_brinco_ativo_fazenda_uq (userId, fazendaId, brinco_ativo_chave);
  ELSE
    ALTER TABLE animais
      ADD UNIQUE KEY animais_brinco_ativo_fazenda_uq (userId, fazendaId, brinco_ativo_chave);
  END IF;

  SELECT 'ok' AS situacao, 'criado' AS acao, 'animais_brinco_ativo_fazenda_uq' AS indice;
END$$
DELIMITER ;

CALL fd_h4ar_aplicar_brinco_ativo_fazenda_uq();
