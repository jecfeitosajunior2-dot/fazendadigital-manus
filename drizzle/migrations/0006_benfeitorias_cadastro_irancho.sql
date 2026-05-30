ALTER TABLE `benfeitorias` ADD COLUMN `fazendaId` int;
ALTER TABLE `benfeitorias` ADD COLUMN `percentualAtividade` decimal(5,2);
ALTER TABLE `benfeitorias` ADD COLUMN `imagem1` text;
ALTER TABLE `benfeitorias` ADD COLUMN `imagem2` text;
ALTER TABLE `benfeitorias` ADD COLUMN `imagem3` text;
ALTER TABLE `benfeitorias` MODIFY COLUMN `vidaUtil` varchar(50);
