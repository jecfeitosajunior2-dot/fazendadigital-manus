-- Catálogo de produtos (ficha mestra) + vínculo estoque.produto_id
CREATE TABLE IF NOT EXISTS `produtos_catalogo` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nome` varchar(100) NOT NULL,
  `categoria` varchar(50),
  `subcategoria` varchar(80),
  `unidade` varchar(20),
  `fabricante` varchar(100),
  `identificador_unico` varchar(100),
  `produzido_na_fazenda` boolean DEFAULT false,
  `monitorar_estoque` boolean DEFAULT false,
  `situacao` varchar(20) DEFAULT 'ativo',
  `embalagens` text,
  `possui_carencia` boolean DEFAULT false,
  `carencia_abate_dias` int,
  `carencia_abate_unidade` varchar(8) DEFAULT 'd',
  `carencia_leite_dias` int,
  `observacoes_carencia` text,
  `observacoes` text,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

ALTER TABLE `estoque` ADD COLUMN `produto_id` int;
