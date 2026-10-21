-- Idempotência da confirmação comercial de vendas.
-- Coluna NULL: vendas antigas e o fluxo atual (sem chave) permanecem válidos.
-- UNIQUE (user_id, idempotency_key): o MySQL permite vários NULL no mesmo usuário.
-- NÃO EXECUTAR nesta etapa.
-- NÃO rodar db:push.
-- NÃO aplicar no operacional fazenda_digital.
-- NÃO aplicar no homolog fazenda_digital_homolog_3c47.
-- NÃO incluir no drizzle migrate enquanto o journal estiver só com 0000.

ALTER TABLE `vendas`
  ADD COLUMN `idempotency_key` varchar(80) NULL;

CREATE UNIQUE INDEX `vendas_idem_uq`
  ON `vendas` (`user_id`, `idempotency_key`);
