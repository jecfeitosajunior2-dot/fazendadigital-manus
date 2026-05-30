ALTER TABLE `fazendas` ADD COLUMN `sigla` varchar(20);
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `pais` varchar(50) DEFAULT 'Brasil';
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `unidadeArea` varchar(30) DEFAULT 'Hectare';
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `areaReserva` decimal(10,2);
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `areaLiquida` decimal(10,2);
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `atividadeCria` boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `atividadeRecria` boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `atividadeEngorda` boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `atividadeConfinamento` boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `cpfCnpj` varchar(20);
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `inscricaoEstadual` varchar(50);
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `registroIncra` varchar(50);
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `nirf` varchar(50);
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `possuiSisbov` boolean;
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `razaoSocial` varchar(200);
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `latitude` varchar(30);
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `longitude` varchar(30);
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `distanciaMunicipio` decimal(10,2);
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `valorHectare` decimal(12,2);
--> statement-breakpoint
ALTER TABLE `fazendas` ADD COLUMN `melhoramentoGenetico` text;
