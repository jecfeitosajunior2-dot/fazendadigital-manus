-- Dietas nutricionais (formulação reutilizável por fazenda).
-- Aditivo. Não reutiliza dietas/cochos da migration 0000.
-- Não cria FKs para planejamento, batida, fornecimento ou lote.

CREATE TABLE IF NOT EXISTS `nutricao_dietas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `fazendaId` int NOT NULL,
  `nome` varchar(100) NOT NULL,
  `descricao` text,
  `tipo` varchar(40) NOT NULL,
  `categoriaAnimal` varchar(50),
  `objetivo` varchar(40),
  `status` varchar(20) NOT NULL DEFAULT 'ativa',
  `dataInicio` date,
  `dataFim` date,
  `baseQuantidade` decimal(12,3) NOT NULL,
  `baseUnidade` varchar(8) NOT NULL DEFAULT 'kg',
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `nutricao_dietas_user_fazenda_idx` (`userId`, `fazendaId`),
  KEY `nutricao_dietas_fazenda_idx` (`fazendaId`)
);

CREATE TABLE IF NOT EXISTS `nutricao_dieta_ingredientes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dietaId` int NOT NULL,
  `produtoId` int NOT NULL,
  `quantidade` decimal(12,3) NOT NULL,
  `ordem` int NOT NULL DEFAULT 0,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nutricao_dieta_ingredientes_dieta_produto_unq` (`dietaId`, `produtoId`),
  KEY `nutricao_dieta_ingredientes_dieta_idx` (`dietaId`),
  KEY `nutricao_dieta_ingredientes_produto_idx` (`produtoId`)
);
