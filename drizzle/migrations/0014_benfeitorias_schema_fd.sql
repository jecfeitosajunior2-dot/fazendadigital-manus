-- Alinha tabela benfeitorias ao schema Drizzle usado pelo cadastro e importação
ALTER TABLE `benfeitorias` ADD COLUMN `userId` int;
ALTER TABLE `benfeitorias` ADD COLUMN `valorEstimado` decimal(12,2);
ALTER TABLE `benfeitorias` ADD COLUMN `dataInstalacao` date;
ALTER TABLE `benfeitorias` ADD COLUMN `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `benfeitorias` ADD COLUMN `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
