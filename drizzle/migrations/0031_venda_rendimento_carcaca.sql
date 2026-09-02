-- Rendimento de carcaça opcional. Em branco = venda no peso vivo.

ALTER TABLE `vendas`
  ADD COLUMN `rendimento_carcaca` decimal(5,2) NULL;
