ALTER TABLE `estoque` ADD COLUMN `possui_carencia` boolean DEFAULT false;
ALTER TABLE `estoque` ADD COLUMN `carencia_abate_dias` int;
ALTER TABLE `estoque` ADD COLUMN `carencia_abate_unidade` varchar(8) DEFAULT 'd';
ALTER TABLE `estoque` ADD COLUMN `carencia_leite_dias` int;
ALTER TABLE `estoque` ADD COLUMN `observacoes_carencia` text;
