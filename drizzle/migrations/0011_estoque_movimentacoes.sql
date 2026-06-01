CREATE TABLE IF NOT EXISTS `estoque_movimentacoes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `estoque_id` int NOT NULL,
  `data_movimentacao` date NOT NULL,
  `quantidade` decimal(12,2) NOT NULL,
  `data_validade` date,
  `observacoes` text,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `estoque_movimentacoes_id` PRIMARY KEY(`id`)
);
