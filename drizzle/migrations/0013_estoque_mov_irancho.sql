ALTER TABLE `estoque_movimentacoes` ADD COLUMN `fazenda_id` int;
ALTER TABLE `estoque_movimentacoes` ADD COLUMN `tipo` varchar(40);
ALTER TABLE `estoque_movimentacoes` ADD COLUMN `destino` varchar(150);
ALTER TABLE `estoque_movimentacoes` ADD COLUMN `manejo` varchar(150);
ALTER TABLE `estoque_movimentacoes` ADD COLUMN `nota_fiscal` varchar(60);
ALTER TABLE `estoque_movimentacoes` ADD COLUMN `frete` decimal(12,2);
ALTER TABLE `estoque_movimentacoes` ADD COLUMN `fornecedor` varchar(150);
ALTER TABLE `estoque_movimentacoes` ADD COLUMN `valor` decimal(12,2);
