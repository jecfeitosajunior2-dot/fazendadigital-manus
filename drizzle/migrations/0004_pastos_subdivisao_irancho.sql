ALTER TABLE `pastos` ADD COLUMN `sigla` varchar(20);
ALTER TABLE `pastos` ADD COLUMN `tipoPastagem` varchar(80);
ALTER TABLE `pastos` ADD COLUMN `incluirArea` boolean DEFAULT true;
