-- Fornecimentos nutricionais (fato operacional). Aditivo.
-- Coluna opcional em estoque_movimentacoes: nutricao_fornecimento_id (via ensureSchema).
-- Não reutiliza batidas. Vínculo opcional em estoque_movimentacoes.

CREATE TABLE IF NOT EXISTS `nutricao_fornecimentos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `fazendaId` int NOT NULL,
  `loteId` int NOT NULL,
  `planejamentoId` int DEFAULT NULL,
  `tipoOrigem` varchar(20) NOT NULL,
  `produtoId` int DEFAULT NULL,
  `dietaId` int DEFAULT NULL,
  `origemOperacional` varchar(20) NOT NULL DEFAULT 'direta',
  `data` date NOT NULL,
  `hora` varchar(5) DEFAULT NULL,
  `quantidadeFornecidaKg` decimal(12,3) NOT NULL,
  `populacaoSnapshot` int NOT NULL DEFAULT 0,
  `origemNomeSnapshot` varchar(120) DEFAULT NULL,
  `custoUnitarioSnapshot` decimal(12,4) DEFAULT NULL,
  `custoTotalSnapshot` decimal(12,2) DEFAULT NULL,
  `custoPorKgSnapshot` decimal(12,4) DEFAULT NULL,
  `custoCompleto` tinyint(1) NOT NULL DEFAULT 0,
  `planejamentoMetaSnapshot` varchar(80) DEFAULT NULL,
  `planejamentoModalidadeSnapshot` varchar(20) DEFAULT NULL,
  `planejamentoNecessidadeKgSnapshot` decimal(12,3) DEFAULT NULL,
  `observacoes` text,
  `status` varchar(20) NOT NULL DEFAULT 'confirmado',
  `motivoEstorno` varchar(255) DEFAULT NULL,
  `observacaoEstorno` text,
  `estornadoPorUserId` int DEFAULT NULL,
  `estornadoEm` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `nutricao_fornecimentos_user_fazenda_idx` (`userId`, `fazendaId`),
  KEY `nutricao_fornecimentos_lote_idx` (`loteId`),
  KEY `nutricao_fornecimentos_data_idx` (`data`),
  KEY `nutricao_fornecimentos_planejamento_idx` (`planejamentoId`)
);

CREATE TABLE IF NOT EXISTS `nutricao_fornecimento_ingredientes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fornecimentoId` int NOT NULL,
  `produtoId` int NOT NULL,
  `produtoNomeSnapshot` varchar(120) DEFAULT NULL,
  `quantidadeKg` decimal(12,3) NOT NULL,
  `quantidadeUnidade` decimal(12,3) NOT NULL,
  `unidadeSnapshot` varchar(20) DEFAULT NULL,
  `proporcaoSnapshot` decimal(8,4) DEFAULT NULL,
  `custoUnitarioSnapshot` decimal(12,4) DEFAULT NULL,
  `custoTotalSnapshot` decimal(12,2) DEFAULT NULL,
  `custoConhecido` tinyint(1) NOT NULL DEFAULT 0,
  `ordem` int NOT NULL DEFAULT 0,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `nutricao_fornecimento_ings_forn_idx` (`fornecimentoId`),
  KEY `nutricao_fornecimento_ings_produto_idx` (`produtoId`)
);
