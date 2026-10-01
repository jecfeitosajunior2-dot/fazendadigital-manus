-- Cochos nutricionais (infraestrutura física). Aditivo.
-- NÃO reutiliza a tabela legacy `cochos` (lote/dieta fixos).
-- Colunas opcionais em nutricao_fornecimentos: cochoId, cochoNomeSnapshot (via ensureSchema se a tabela já existir).

CREATE TABLE IF NOT EXISTS `nutricao_cochos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `fazendaId` int NOT NULL,
  `nome` varchar(100) NOT NULL,
  `codigo` varchar(30) DEFAULT NULL,
  `tipo` varchar(30) NOT NULL,
  `pastoId` int DEFAULT NULL,
  `localizacaoDescricao` varchar(200) DEFAULT NULL,
  `comprimentoMetros` decimal(10,2) DEFAULT NULL,
  `larguraMetros` decimal(10,2) DEFAULT NULL,
  `capacidadeKg` decimal(12,3) DEFAULT NULL,
  `ladosAcesso` int DEFAULT NULL,
  `coberto` tinyint(1) NOT NULL DEFAULT 0,
  `observacoes` text,
  `status` varchar(20) NOT NULL DEFAULT 'ativo',
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `nutricao_cochos_user_fazenda_idx` (`userId`, `fazendaId`),
  KEY `nutricao_cochos_pasto_idx` (`pastoId`),
  KEY `nutricao_cochos_codigo_idx` (`fazendaId`, `codigo`)
);
