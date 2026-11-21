-- H4-AY — chave da movimentação manual de estoque.
-- Não entra no journal. Não aplicar em fazenda_digital.
-- Não apaga produto, movimento, saldo nem chave já gravada.
-- DDL não desfaz com ROLLBACK. Se a tabela existir sem o índice certo, a rotina recusa antes de alterar.
-- MySQL 8.4 não tem CREATE TABLE IF NOT EXISTS com conferência do índice único.
--
-- A chave é do titular, não de quem clicou. O mesmo par (titular, chave) não entra duas vezes.
-- O hash do conteúdo fica na linha. A aplicação recusa a mesma chave com outros dados.
--
-- Reversão, só com autorização e depois de conferir o nome:
--   DROP TABLE estoque_movimentacao_chaves;

DROP PROCEDURE IF EXISTS fd_h4ay_aplicar_estoque_movimentacao_chaves;
DELIMITER $$
CREATE PROCEDURE fd_h4ay_aplicar_estoque_movimentacao_chaves()
rotina: BEGIN
  DECLARE v_tabela INT DEFAULT 0;
  DECLARE v_indice INT DEFAULT 0;
  DECLARE v_cols TEXT;

  IF VERSION() NOT LIKE '8.%' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'chave de estoque recusada: versao MySQL nao conferida';
  END IF;

  SELECT COUNT(*) INTO v_tabela
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estoque_movimentacao_chaves';

  IF v_tabela = 1 THEN
    SELECT COUNT(*) INTO v_indice
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'estoque_movimentacao_chaves'
      AND INDEX_NAME = 'estoque_mov_chave_uq'
      AND NON_UNIQUE = 0;
    IF v_indice < 2 THEN
      SELECT 'incompativel' AS diagnostico, INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME, NON_UNIQUE
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'estoque_movimentacao_chaves'
      ORDER BY INDEX_NAME, SEQ_IN_INDEX;
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'chave de estoque recusada: indice unico ausente ou diferente';
    END IF;

    SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) INTO v_cols
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'estoque_movimentacao_chaves'
      AND INDEX_NAME = 'estoque_mov_chave_uq';
    IF v_cols <> 'titular_user_id,chave' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'chave de estoque recusada: colunas do indice diferentes';
    END IF;

    SELECT 'ok' AS diagnostico, 'estoque_mov_chave_uq' AS indice;
    LEAVE rotina;
  END IF;

  CREATE TABLE estoque_movimentacao_chaves (
    id INT NOT NULL AUTO_INCREMENT,
    titular_user_id INT NOT NULL,
    chave VARCHAR(80) NOT NULL,
    conteudo_hash CHAR(64) NOT NULL,
    estoque_id INT NOT NULL,
    fazenda_id INT NOT NULL,
    tipo VARCHAR(40) NOT NULL,
    quantidade DECIMAL(10,2) NOT NULL,
    movimentacao_id INT NULL,
    grupo_id VARCHAR(40) NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY estoque_mov_chave_uq (titular_user_id, chave)
  ) ENGINE=InnoDB;

  SELECT 'criada' AS diagnostico, 'estoque_mov_chave_uq' AS indice;
END$$
DELIMITER ;

CALL fd_h4ay_aplicar_estoque_movimentacao_chaves();
