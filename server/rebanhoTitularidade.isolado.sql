-- Tabelas mínimas do serviço isolado de animal e lote.
-- Não é migração do banco fazenda_digital.

CREATE TABLE lotes (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  nome varchar(100) NOT NULL,
  sigla varchar(20) NULL,
  descricao text NULL,
  fazendaId int NULL,
  ativo tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY lotes_user_idx (userId),
  CONSTRAINT lotes_user_fk FOREIGN KEY (userId) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT lotes_fazenda_fk FOREIGN KEY (fazendaId) REFERENCES fazendas (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE animais (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  brinco varchar(50) NULL,
  brincoEletronico varchar(80) NULL,
  nome varchar(100) NULL,
  sexo enum('macho','femea') NOT NULL,
  status enum('ativo','vendido','morto','transferido') NOT NULL DEFAULT 'ativo',
  loteId int NULL,
  fazendaId int NULL,
  pesoEntrada decimal(8,2) NULL,
  PRIMARY KEY (id),
  KEY animais_user_idx (userId),
  CONSTRAINT animais_user_fk FOREIGN KEY (userId) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT animais_fazenda_fk FOREIGN KEY (fazendaId) REFERENCES fazendas (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT animais_lote_fk FOREIGN KEY (loteId) REFERENCES lotes (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  animalId int NOT NULL,
  loteOrigemId int NULL,
  loteDestinoId int NOT NULL,
  fazendaId int NULL,
  dataMovimentacao date NOT NULL,
  usuarioNome varchar(200) NULL,
  PRIMARY KEY (id),
  CONSTRAINT animal_lote_mov_user_fk FOREIGN KEY (userId) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT animal_lote_mov_animal_fk FOREIGN KEY (animalId) REFERENCES animais (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT animal_lote_mov_lote_fk FOREIGN KEY (loteDestinoId) REFERENCES lotes (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
