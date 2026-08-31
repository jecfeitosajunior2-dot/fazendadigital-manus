-- Baixa operacional por venda, morte ou transferência externa.
-- Status continua em animais como estado atual; a origem passa a ser este evento.
CREATE TABLE IF NOT EXISTS `animal_baixas` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `animalId` int NOT NULL,
  `fazendaId` int NOT NULL,
  `tipo` enum('venda','morte','transferencia') NOT NULL,
  `dataBaixa` date NOT NULL,
  `destino` varchar(255),
  `motivo` varchar(255),
  `observacoes` text,
  `usuarioNome` varchar(200),
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `animal_baixas_id` PRIMARY KEY (`id`),
  CONSTRAINT `animal_baixas_animal_uq` UNIQUE (`animalId`),
  INDEX `animal_baixas_user_data_idx` (`userId`, `dataBaixa`),
  INDEX `animal_baixas_fazenda_data_idx` (`fazendaId`, `dataBaixa`)
);
