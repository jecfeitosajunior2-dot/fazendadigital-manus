-- Batidas nutricionais (preparação física de Dieta). Aditivo.
-- NÃO reutiliza a tabela legacy `batidas`.
-- Vínculo explícito: estoque_movimentacoes.nutricao_batida_id
-- Vínculo Fornecimento: nutricao_fornecimentos.batidaId
-- Quantidade distribuída/saldo NÃO são persistidos — derivam dos Fornecimentos confirmados.

CREATE TABLE IF NOT EXISTS `nutricao_batidas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `fazendaId` int NOT NULL,
  `dietaId` int NOT NULL,
  `data` date NOT NULL,
  `hora` varchar(5) DEFAULT NULL,
  `quantidadePreparadaKg` decimal(12,3) NOT NULL,
  `dietaNomeSnapshot` varchar(120) DEFAULT NULL,
  `custoTotalSnapshot` decimal(12,2) DEFAULT NULL,
  `custoKgSnapshot` decimal(12,4) DEFAULT NULL,
  `custoCompleto` tinyint(1) NOT NULL DEFAULT 0,
  `observacoes` text,
  `status` varchar(20) NOT NULL DEFAULT 'confirmado',
  `motivoEstorno` varchar(255) DEFAULT NULL,
  `observacaoEstorno` text,
  `estornadoPorUserId` int DEFAULT NULL,
  `estornadoEm` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `nutricao_batidas_user_fazenda_idx` (`userId`, `fazendaId`),
  KEY `nutricao_batidas_dieta_idx` (`dietaId`),
  KEY `nutricao_batidas_data_idx` (`data`)
);

CREATE TABLE IF NOT EXISTS `nutricao_batida_ingredientes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `batidaId` int NOT NULL,
  `produtoId` int NOT NULL,
  `produtoNomeSnapshot` varchar(120) DEFAULT NULL,
  `proporcaoSnapshot` decimal(8,4) DEFAULT NULL,
  `quantidadeKg` decimal(12,3) NOT NULL,
  `quantidadeUnidade` decimal(12,3) NOT NULL,
  `unidadeSnapshot` varchar(20) DEFAULT NULL,
  `custoUnitarioSnapshot` decimal(12,4) DEFAULT NULL,
  `custoTotalSnapshot` decimal(12,2) DEFAULT NULL,
  `custoConhecido` tinyint(1) NOT NULL DEFAULT 0,
  `ordem` int NOT NULL DEFAULT 0,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `nutricao_batida_ings_batida_idx` (`batidaId`),
  KEY `nutricao_batida_ings_produto_idx` (`produtoId`)
);
