-- Migration: genealogia estruturada (maeId/paiId) e vínculo parto → crias
ALTER TABLE `animais` ADD COLUMN `maeId` int;
ALTER TABLE `animais` ADD COLUMN `paiId` int;

CREATE INDEX `animais_mae_id_idx` ON `animais` (`maeId`);
CREATE INDEX `animais_pai_id_idx` ON `animais` (`paiId`);

CREATE TABLE IF NOT EXISTS `parto_crias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`partoRegistroId` int NOT NULL,
	`criaAnimalId` int NOT NULL,
	`ordem` int NOT NULL DEFAULT 1,
	`createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `parto_crias_id` PRIMARY KEY(`id`),
	CONSTRAINT `parto_crias_parto_cria_uq` UNIQUE(`partoRegistroId`, `criaAnimalId`),
	CONSTRAINT `parto_crias_cria_uq` UNIQUE(`criaAnimalId`),
	CONSTRAINT `parto_crias_parto_ordem_uq` UNIQUE(`partoRegistroId`, `ordem`)
);

CREATE INDEX `parto_crias_user_id_idx` ON `parto_crias` (`userId`);
