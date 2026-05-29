CREATE TABLE `abastecimentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`maquina_id` int NOT NULL,
	`data` date NOT NULL,
	`combustivel` enum('diesel','gasolina','etanol','arla') NOT NULL DEFAULT 'diesel',
	`litros` decimal(10,2) NOT NULL,
	`valor_litro` decimal(10,3),
	`valor_total` decimal(10,2),
	`horimetro` varchar(50),
	`responsavel` varchar(255),
	`observacoes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `abastecimentos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `animais` (
	`id` int AUTO_INCREMENT NOT NULL,
	`brinco` varchar(100),
	`nome` varchar(255),
	`sexo` enum('macho','femea') NOT NULL DEFAULT 'macho',
	`raca` varchar(100),
	`categoria` varchar(100),
	`data_nascimento` date,
	`peso` decimal(10,2),
	`lote_id` int,
	`status` enum('ativo','vendido','morto','transferido') NOT NULL DEFAULT 'ativo',
	`mae` varchar(100),
	`pai` varchar(100),
	`observacoes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `animais_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `batidas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cocho_id` int NOT NULL,
	`dieta_id` int,
	`data` date NOT NULL,
	`quantidade` decimal(10,2) NOT NULL,
	`responsavel` varchar(255),
	`observacoes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `batidas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `benfeitorias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`tipo` varchar(100),
	`descricao` text,
	`localizacao` varchar(255),
	`area` decimal(10,2),
	`valor_estimado` decimal(15,2),
	`data_construcao` date,
	`status` enum('ativo','manutencao','inativo') NOT NULL DEFAULT 'ativo',
	`observacoes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `benfeitorias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categorias_financeiras` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`tipo` enum('receita','despesa') NOT NULL,
	`cor` varchar(20),
	`ativa` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `categorias_financeiras_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cochos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`tipo` enum('mineral','volumoso','concentrado','misto') NOT NULL DEFAULT 'mineral',
	`lote_id` int,
	`dieta_id` int,
	`capacidade` decimal(10,2),
	`ativo` boolean NOT NULL DEFAULT true,
	`observacoes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `cochos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contas_financeiras` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`tipo` enum('corrente','poupanca','caixa','investimento') NOT NULL DEFAULT 'corrente',
	`banco` varchar(100),
	`saldo_inicial` decimal(15,2) NOT NULL DEFAULT '0',
	`saldo_atual` decimal(15,2) NOT NULL DEFAULT '0',
	`ativa` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `contas_financeiras_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dietas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`descricao` text,
	`categoria` varchar(100),
	`peso_minimo` decimal(10,2),
	`peso_maximo` decimal(10,2),
	`ativa` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `dietas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `estoque` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`categoria` varchar(100),
	`unidade` varchar(50),
	`quantidade` decimal(15,3) NOT NULL DEFAULT '0',
	`quantidade_minima` decimal(15,3),
	`valor_unitario` decimal(15,2),
	`localizacao` varchar(255),
	`observacoes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `estoque_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`descricao` text,
	`categoria` varchar(100),
	`capacidade` int,
	`ativo` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `lotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `manutencoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`maquina_id` int NOT NULL,
	`tipo` enum('preventiva','corretiva','revisao') NOT NULL DEFAULT 'preventiva',
	`descricao` text NOT NULL,
	`data` date NOT NULL,
	`custo` decimal(10,2),
	`oficina` varchar(255),
	`horimetro` varchar(50),
	`proxima_manutencao` date,
	`status` enum('agendada','concluida','cancelada') NOT NULL DEFAULT 'agendada',
	`observacoes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `manutencoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maquinas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`tipo` varchar(100),
	`marca` varchar(100),
	`modelo` varchar(100),
	`ano` int,
	`placa` varchar(20),
	`horimetro` varchar(50),
	`status` enum('operacional','manutencao','inativo') NOT NULL DEFAULT 'operacional',
	`observacoes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `maquinas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `movimentacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conta_id` int NOT NULL,
	`categoria_id` int,
	`tipo` enum('receita','despesa','transferencia') NOT NULL,
	`descricao` varchar(500) NOT NULL,
	`valor` decimal(15,2) NOT NULL,
	`data` date NOT NULL,
	`status` enum('pendente','confirmado','cancelado') NOT NULL DEFAULT 'confirmado',
	`observacoes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `movimentacoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pesagens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`animal_id` int NOT NULL,
	`peso` decimal(10,2) NOT NULL,
	`data` date NOT NULL,
	`responsavel` varchar(255),
	`observacoes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `pesagens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reproducao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`femea_id` int NOT NULL,
	`macho_id` int,
	`tipo` enum('monta_natural','inseminacao','transferencia_embriao') NOT NULL DEFAULT 'inseminacao',
	`data_cobertura` date NOT NULL,
	`data_previsto_parto` date,
	`data_real_parto` date,
	`resultado` enum('prenha','vazia','parto_normal','parto_distocico','aborto'),
	`observacoes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `reproducao_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saude` (
	`id` int AUTO_INCREMENT NOT NULL,
	`animal_id` int NOT NULL,
	`tipo` enum('vacinacao','tratamento','exame','cirurgia','outro') NOT NULL DEFAULT 'vacinacao',
	`descricao` text NOT NULL,
	`medicamento` varchar(255),
	`veterinario` varchar(255),
	`custo` decimal(10,2),
	`data_registro` date NOT NULL,
	`proxima_data` date,
	`observacoes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `saude_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`open_id` varchar(255) NOT NULL,
	`name` varchar(255),
	`email` varchar(255),
	`role` enum('admin','user') NOT NULL DEFAULT 'user',
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_open_id_unique` UNIQUE(`open_id`)
);
