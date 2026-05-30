ALTER TABLE `lotes` ADD COLUMN `fazendaId` int;
ALTER TABLE `lotes` ADD COLUMN `pastoAtualId` int;
ALTER TABLE `lotes` ADD COLUMN `dataEntradaPasto` date;

CREATE TABLE `lote_pasto_movimentacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`loteId` int NOT NULL,
	`pastoOrigemId` int,
	`pastoDestinoId` int,
	`dataEntrada` date NOT NULL,
	`dataSaida` date,
	`diasNoPasto` int,
	`qtdAnimais` int,
	`observacoes` text,
	`createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `lote_pasto_movimentacoes_id` PRIMARY KEY(`id`)
);
