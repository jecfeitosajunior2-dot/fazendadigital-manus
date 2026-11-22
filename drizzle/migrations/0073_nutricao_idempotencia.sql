-- PROPOSTA H4-BF. Não aplicar no banco operacional.
-- Não registrada em drizzle/migrations/meta/_journal.json.
-- A maior migração já existente neste repositório é a 0069.
-- A numeração 0073 fica depois de 0072, como pedido nesta fase.
-- O código atual NÃO grava nem lê chaveOperacao.
-- Sem esta coluna, repetir a confirmação ainda pode consumir o insumo de novo.

ALTER TABLE nutricao_fornecimentos
  ADD COLUMN chaveOperacao varchar(80) NULL;

ALTER TABLE nutricao_batidas
  ADD COLUMN chaveOperacao varchar(80) NULL;

CREATE UNIQUE INDEX nutricao_fornecimentos_user_chave_uq
  ON nutricao_fornecimentos (userId, chaveOperacao);

CREATE UNIQUE INDEX nutricao_batidas_user_chave_uq
  ON nutricao_batidas (userId, chaveOperacao);
