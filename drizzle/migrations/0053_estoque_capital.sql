-- Infraestrutura do capital do estoque (Fase 2A.1A).
-- Sem backfill. Sem UPDATE de negócio. Sem inicializar capital real.
-- valor_total_estoque e capital_inicializado_em nascem NULL.

ALTER TABLE `estoque`
  ADD COLUMN `valor_total_estoque` decimal(14,2) NULL AFTER `valor_unitario`;

ALTER TABLE `estoque`
  ADD COLUMN `capital_inicializado_em` timestamp NULL AFTER `valor_total_estoque`;

-- Cache técnico: deixa de ser verdade patrimonial. Sem backfill.
ALTER TABLE `estoque`
  MODIFY COLUMN `valor_unitario` decimal(18,6) NULL;

-- Snapshot exclusivo do capital movimentado. NULL no histórico.
-- Não reutiliza `valor` (preço comercial / NF / frete).
ALTER TABLE `estoque_movimentacoes`
  ADD COLUMN `valor_estoque_movimentado` decimal(14,2) NULL AFTER `valor`;
