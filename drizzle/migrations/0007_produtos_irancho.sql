ALTER TABLE `estoque` ADD COLUMN `subcategoria` varchar(80);
ALTER TABLE `estoque` ADD COLUMN `quantidade_maxima` decimal(10,2);
ALTER TABLE `estoque` ADD COLUMN `fabricante` varchar(100);
ALTER TABLE `estoque` ADD COLUMN `identificador_unico` varchar(100);
ALTER TABLE `estoque` ADD COLUMN `produzido_na_fazenda` boolean DEFAULT false;
ALTER TABLE `estoque` ADD COLUMN `monitorar_estoque` boolean DEFAULT false;
ALTER TABLE `estoque` ADD COLUMN `situacao` varchar(20) DEFAULT 'ativo';
ALTER TABLE `estoque` ADD COLUMN `embalagens` text;
