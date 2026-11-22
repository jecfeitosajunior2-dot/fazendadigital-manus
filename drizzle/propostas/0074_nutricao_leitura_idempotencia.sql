-- Proposta 0074. Não está no journal e não deve ser aplicada no banco da fazenda.
-- A maior migração já existente neste repositório é a 0069.
-- A numeração 0074 fica depois de 0073.
-- Não depende da 0073. A tabela de leitura é outra.
-- O cadastro com sessão recusa gravar se estas colunas ou o índice único não existirem.
-- Nada é criado nesse caso: nem leitura, nem chave, nem movimento de estoque.
-- A chave identifica a solicitação. O resumo identifica o conteúdo confirmado na hora.
-- Edição e cancelamento não recalculam esse resumo e não apagam a chave.
-- Escopo da unicidade: titular + chave, só nesta tabela.
-- Conteúdo resumido: fazenda, cocho, lote, fornecimento, data, hora, sobra, escore e observação.
-- Mesma chave e mesmo conteúdo devolvem a leitura já gravada, mesmo depois de editar ou cancelar.
-- Mesma chave e conteúdo diferente são recusadas.
-- Chave nova, ainda que os campos coincidam, grava outra leitura.
-- Várias leituras antigas podem ficar com chave nula. O MySQL permite vários NULL nesse índice.
-- Não preencher chave nas leituras que já existem.
-- Segunda aplicação: o ALTER falha se a coluna já existe. A estrutura da primeira fica no lugar.
-- Isso é recusa de migração repetida. Não é a idempotência do pedido do funcionário.

ALTER TABLE nutricao_cocho_leituras
  ADD COLUMN chaveOperacao varchar(80) NULL,
  ADD COLUMN conteudoHash varchar(64) NULL;

CREATE UNIQUE INDEX nutricao_cocho_leituras_user_chave_uq
  ON nutricao_cocho_leituras (userId, chaveOperacao);
