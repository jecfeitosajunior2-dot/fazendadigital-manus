-- Leituras de Cocho (observação física). Aditivo.
-- NÃO reutiliza tabelas legacy. NÃO persiste consumo aparente.
-- escore é texto operacional (não há escala oficial de cocho no projeto).

CREATE TABLE IF NOT EXISTS `nutricao_cocho_leituras` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `fazendaId` int NOT NULL,
  `cochoId` int NOT NULL,
  `loteId` int DEFAULT NULL,
  `fornecimentoId` int DEFAULT NULL,
  `data` date NOT NULL,
  `hora` varchar(5) DEFAULT NULL,
  `sobraKg` decimal(12,3) DEFAULT NULL,
  `escore` varchar(40) DEFAULT NULL,
  `observacoes` text,
  `cochoNomeSnapshot` varchar(160) DEFAULT NULL,
  `loteNomeSnapshot` varchar(120) DEFAULT NULL,
  `alimentoNomeSnapshot` varchar(120) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ativa',
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `nutricao_cocho_leituras_user_fazenda_idx` (`userId`, `fazendaId`),
  KEY `nutricao_cocho_leituras_cocho_idx` (`cochoId`),
  KEY `nutricao_cocho_leituras_lote_idx` (`loteId`),
  KEY `nutricao_cocho_leituras_forn_idx` (`fornecimentoId`),
  KEY `nutricao_cocho_leituras_data_idx` (`data`)
);
