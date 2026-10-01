-- Planejamento nutricional (prescrição temporal por lote).
-- Aditivo. Não reutiliza batidas/cochos. Sem FKs para fornecimento.

CREATE TABLE IF NOT EXISTS `nutricao_planejamentos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `fazendaId` int NOT NULL,
  `loteId` int NOT NULL,
  `tipoOrigem` varchar(20) NOT NULL,
  `produtoId` int DEFAULT NULL,
  `dietaId` int DEFAULT NULL,
  `modalidadeMeta` varchar(20) NOT NULL,
  `valorMeta` decimal(12,4) DEFAULT NULL,
  `frequencia` varchar(30) NOT NULL,
  `tratosPorDia` int DEFAULT NULL,
  `frequenciaIntervaloDias` int DEFAULT NULL,
  `frequenciaDiasSemana` varchar(20) DEFAULT NULL,
  `nome` varchar(100) DEFAULT NULL,
  `observacoes` text,
  `dataInicio` date NOT NULL,
  `dataFim` date DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ativo',
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `nutricao_planejamentos_user_fazenda_idx` (`userId`, `fazendaId`),
  KEY `nutricao_planejamentos_lote_idx` (`loteId`),
  KEY `nutricao_planejamentos_produto_idx` (`produtoId`),
  KEY `nutricao_planejamentos_dieta_idx` (`dietaId`)
);
