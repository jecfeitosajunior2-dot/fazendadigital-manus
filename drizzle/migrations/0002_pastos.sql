CREATE TABLE `pastos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fazendaId` int NOT NULL,
	`nome` varchar(100) NOT NULL,
	`tipo` varchar(50) DEFAULT 'Pasto',
	`area` decimal(10,2),
	`capacidade` int,
	`status` enum('ativo','descanso','vazio') DEFAULT 'vazio',
	`observacoes` text,
	`createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pastos_id` PRIMARY KEY(`id`)
);
