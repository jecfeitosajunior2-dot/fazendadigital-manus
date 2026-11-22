-- Proposta 0073. Não está no journal e não deve ser aplicada no banco da fazenda.
-- Saiu de drizzle/migrations para não ficar no caminho do migrate.
-- A maior migração já existente neste repositório é a 0069.
-- A numeração 0073 fica depois de 0072.
-- A confirmação recusa operar se estas colunas ou o índice único não existirem.
-- Segunda aplicação: o ALTER falha se a coluna já existe. A estrutura da primeira fica no lugar.
-- A chave é única por titular, dentro de cada tabela.
-- Fornecimento e batida não compartilham índice, então a mesma frase não vira as duas operações.
-- Várias linhas antigas podem ficar com chave nula. O MySQL permite vários NULL nesse índice.

ALTER TABLE nutricao_fornecimentos
  ADD COLUMN chaveOperacao varchar(80) NULL,
  ADD COLUMN conteudoHash varchar(64) NULL;

ALTER TABLE nutricao_batidas
  ADD COLUMN chaveOperacao varchar(80) NULL,
  ADD COLUMN conteudoHash varchar(64) NULL;

CREATE UNIQUE INDEX nutricao_fornecimentos_user_chave_uq
  ON nutricao_fornecimentos (userId, chaveOperacao);

CREATE UNIQUE INDEX nutricao_batidas_user_chave_uq
  ON nutricao_batidas (userId, chaveOperacao);
