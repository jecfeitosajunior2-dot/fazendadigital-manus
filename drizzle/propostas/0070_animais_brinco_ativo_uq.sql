-- Proposta da H4-AQ. Não entra no journal e não deve ser aplicada no MySQL operacional.
-- Vários animais inativos podem repetir o brinco. Só o ativo fica único por conta.
-- O MySQL aceita vários NULL nesse índice, então a baixa não esbarra na chave.

ALTER TABLE animais
  ADD COLUMN brinco_ativo_chave varchar(50)
    GENERATED ALWAYS AS (
      CASE
        WHEN status = 'ativo' AND brinco IS NOT NULL AND CHAR_LENGTH(TRIM(brinco)) > 0
          THEN LOWER(TRIM(brinco))
        ELSE NULL
      END
    ) STORED,
  ADD UNIQUE KEY animais_user_brinco_ativo_uq (userId, brinco_ativo_chave);
