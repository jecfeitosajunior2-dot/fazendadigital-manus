-- Proposta 0074. Não está no journal e não deve ser aplicada no banco da fazenda.
-- A maior migração já existente neste repositório é a 0069.
-- A numeração 0074 fica depois de 0073.
-- O cadastro de leitura continua sem estas colunas. Ele não deve passar a exigir a chave
-- enquanto a estrutura não existir, porque isso impediria a leitura do dia.
-- A comparação atual de campos iguais segura o duplo clique, mas não separa duas leituras
-- legítimas com os mesmos dados. Por isso o cadastro permanece parcial.
-- Escopo da unicidade: titular + chave, só nesta tabela.
-- Conteúdo da chave: fazenda, cocho, lote, fornecimento, data, hora, sobra, escore e observação.
-- Mesma chave e mesmo conteúdo devolvem a leitura já gravada.
-- Mesma chave e conteúdo diferente são recusadas.
-- Chave nova, ainda que os campos coincidam, grava outra leitura.
-- Várias leituras antigas podem ficar com chave nula. O MySQL permite vários NULL nesse índice.
-- Segunda aplicação: o ALTER falha se a coluna já existe. A estrutura da primeira fica no lugar.

ALTER TABLE nutricao_cocho_leituras
  ADD COLUMN chaveOperacao varchar(80) NULL,
  ADD COLUMN conteudoHash varchar(64) NULL;

CREATE UNIQUE INDEX nutricao_cocho_leituras_user_chave_uq
  ON nutricao_cocho_leituras (userId, chaveOperacao);
