CREATE TABLE IF NOT EXISTS `animal_lote_movimentacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`animalId` int NOT NULL,
	`loteOrigemId` int NOT NULL,
	`loteDestinoId` int NOT NULL,
	`dataMovimentacao` date NOT NULL,
	`usuarioNome` varchar(200),
	`createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `animal_lote_movimentacoes_id` PRIMARY KEY(`id`)
);
