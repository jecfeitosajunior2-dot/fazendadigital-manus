-- Esquema do MySQL descartável da fase 7.8.4-C.
-- Copia as tabelas homologadas de 0062 a 0065. Não é migração operacional.
-- A tabela revisoes_reativacao só existe aqui: a confirmação fica no servidor,
-- com prazo e consumo único. Não entra no banco fazenda_digital.

CREATE TABLE users (
  id int NOT NULL AUTO_INCREMENT,
  openId varchar(255) NOT NULL,
  name varchar(255) NOT NULL,
  email varchar(255) NULL,
  loginMethod varchar(50) DEFAULT 'local',
  passwordHash varchar(255) NULL,
  role enum('admin','user') DEFAULT 'user',
  papel enum('principal','secundario','comum') NOT NULL DEFAULT 'comum',
  titularUserId int NULL,
  situacao enum('convidado','ativo','inativo') NOT NULL DEFAULT 'ativo',
  sessionVersion int NOT NULL DEFAULT 0,
  inativadoEm timestamp NULL,
  inativadoPorUserId int NULL,
  createdAt timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  lastSignedIn timestamp NULL,
  PRIMARY KEY (id),
  UNIQUE KEY users_openId_uq (openId),
  UNIQUE KEY users_email_uq (email),
  UNIQUE KEY users_id_titular_uq (id, titularUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE fazendas (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  nome varchar(200) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE usuario_fazendas (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  fazendaId int NOT NULL,
  concedidoPorUserId int NOT NULL,
  concedidoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY usuario_fazendas_usuario_fazenda_uq (userId, fazendaId),
  KEY usuario_fazendas_user_idx (userId),
  KEY usuario_fazendas_fazenda_idx (fazendaId),
  CONSTRAINT usuario_fazendas_user_fk
    FOREIGN KEY (userId) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT usuario_fazendas_fazenda_fk
    FOREIGN KEY (fazendaId) REFERENCES fazendas (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT usuario_fazendas_concedido_fk
    FOREIGN KEY (concedidoPorUserId) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE perfis_acesso (
  id int NOT NULL AUTO_INCREMENT,
  titularUserId int NOT NULL,
  nome varchar(80) NOT NULL,
  descricao varchar(255) NULL,
  situacao enum('ativo','inativo') NOT NULL DEFAULT 'ativo',
  criadoPorUserId int NOT NULL,
  criadoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizadoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY perfis_acesso_titular_nome_uq (titularUserId, nome),
  UNIQUE KEY perfis_acesso_id_titular_uq (id, titularUserId),
  KEY perfis_acesso_criado_por_idx (criadoPorUserId),
  CONSTRAINT perfis_acesso_titular_fk
    FOREIGN KEY (titularUserId) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT perfis_acesso_criado_por_fk
    FOREIGN KEY (criadoPorUserId) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE perfil_permissoes (
  id int NOT NULL AUTO_INCREMENT,
  perfilId int NOT NULL,
  permissao varchar(80) NOT NULL,
  criadoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY perfil_permissoes_perfil_permissao_uq (perfilId, permissao),
  CONSTRAINT perfil_permissoes_perfil_fk
    FOREIGN KEY (perfilId) REFERENCES perfis_acesso (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE usuario_permissoes (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  titularUserId int NOT NULL,
  permissao varchar(80) NOT NULL,
  concedidoPorUserId int NOT NULL,
  origemPerfilId int NULL,
  concedidoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY usuario_permissoes_usuario_permissao_uq (userId, permissao),
  KEY usuario_permissoes_usuario_titular_idx (userId, titularUserId),
  KEY usuario_permissoes_origem_titular_idx (origemPerfilId, titularUserId),
  KEY usuario_permissoes_concedido_idx (concedidoPorUserId),
  KEY usuario_permissoes_titular_idx (titularUserId),
  CONSTRAINT usuario_permissoes_user_fk
    FOREIGN KEY (userId) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT usuario_permissoes_usuario_titular_fk
    FOREIGN KEY (userId, titularUserId) REFERENCES users (id, titularUserId)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT usuario_permissoes_concedido_fk
    FOREIGN KEY (concedidoPorUserId) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT usuario_permissoes_titular_fk
    FOREIGN KEY (titularUserId) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT usuario_permissoes_origem_fk
    FOREIGN KEY (origemPerfilId, titularUserId) REFERENCES perfis_acesso (id, titularUserId)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE auditoria_eventos (
  id int NOT NULL AUTO_INCREMENT,
  executorUserId int NOT NULL,
  executorNome varchar(255) NOT NULL,
  titularUserId int NOT NULL,
  fazendaId int NULL,
  modulo varchar(80) NOT NULL,
  operacao varchar(80) NOT NULL,
  registroTipo varchar(80) NULL,
  registroId int NULL,
  dadosAnteriores text NULL,
  dadosPosteriores text NULL,
  criadoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY auditoria_eventos_titular_criado_idx (titularUserId, criadoEm),
  KEY auditoria_eventos_fazenda_criado_idx (fazendaId, criadoEm),
  KEY auditoria_eventos_executor_idx (executorUserId),
  KEY auditoria_eventos_modulo_criado_idx (modulo, criadoEm),
  CONSTRAINT auditoria_eventos_executor_fk
    FOREIGN KEY (executorUserId) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT auditoria_eventos_titular_fk
    FOREIGN KEY (titularUserId) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT auditoria_eventos_fazenda_fk
    FOREIGN KEY (fazendaId) REFERENCES fazendas (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE revisoes_reativacao (
  id int NOT NULL AUTO_INCREMENT,
  token char(64) NOT NULL,
  executorUserId int NOT NULL,
  titularUserId int NOT NULL,
  alvoUserId int NOT NULL,
  estadoJson text NOT NULL,
  propostaJson text NOT NULL,
  expiraEmMs bigint NOT NULL,
  consumidaEmMs bigint NULL,
  criadaEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY revisoes_reativacao_token_uq (token),
  KEY revisoes_reativacao_executor_idx (executorUserId, alvoUserId),
  CONSTRAINT revisoes_reativacao_executor_fk
    FOREIGN KEY (executorUserId) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT revisoes_reativacao_titular_fk
    FOREIGN KEY (titularUserId) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT revisoes_reativacao_alvo_fk
    FOREIGN KEY (alvoUserId) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
