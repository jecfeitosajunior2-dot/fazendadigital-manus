import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { env } from "./_core/env";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import {
  definirBancoManejo,
  MSG_MANEJO_NAO_ENCONTRADO,
  MSG_MANEJO_SEM_INDICE,
  MSG_MANEJO_SEM_MYSQL,
  registrarBrincoPontual,
  type SessaoManejo,
} from "./registrarBrincoPontual";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bu-man";
const PORTA = 3406;
const SENHA = "isolado-h4bu-man";
const BANCO = "fd_h4bu_man";
const INDICE = `
ALTER TABLE animais
  ADD COLUMN brinco_ativo_chave varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
    GENERATED ALWAYS AS (
      CASE
        WHEN status = 'ativo' AND brinco IS NOT NULL AND CHAR_LENGTH(TRIM(brinco)) > 0
          THEN LOWER(TRIM(brinco)) COLLATE utf8mb4_bin
        ELSE NULL
      END
    ) STORED,
  ADD UNIQUE KEY animais_brinco_ativo_fazenda_uq (userId, fazendaId, brinco_ativo_chave)
`;

const ESQUEMA = `
CREATE TABLE users (
  id int NOT NULL, openId varchar(255) NOT NULL, name varchar(255) NOT NULL,
  email varchar(255) NULL, role enum('admin','user') NOT NULL DEFAULT 'user',
  papel enum('principal','secundario','comum') NOT NULL,
  titularUserId int NULL, situacao enum('convidado','ativo','inativo') NOT NULL,
  sessionVersion int NOT NULL DEFAULT 0, PRIMARY KEY (id), UNIQUE KEY openId (openId)
) ENGINE=InnoDB;
CREATE TABLE fazendas (id int NOT NULL, userId int NOT NULL, nome varchar(200) NOT NULL, PRIMARY KEY (id));
CREATE TABLE usuario_fazendas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  concedidoPorUserId int NOT NULL, concedidoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_permissoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, titularUserId int NOT NULL,
  permissao varchar(80) NOT NULL, concedidoPorUserId int NOT NULL,
  concedidoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, fazendaId int NULL, status varchar(20) NULL DEFAULT 'ativo',
  brinco varchar(50) NULL, brincoEletronico varchar(80) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE historico_brincos (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  brincoAnterior varchar(50) NULL, brincoNovo varchar(50) NOT NULL,
  motivo enum('perda','danificado','reidentificacao','erro_cadastro','outro') NOT NULL,
  observacoes text NULL, dataAlteracao date NOT NULL, usuarioNome varchar(200) NULL,
  createdAt timestamp NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

function sessao(executorId: number, sessionVersionDaSessao: number | null = 1): SessaoManejo {
  return { executorId, sessionVersionDaSessao };
}

function troca(animalId: number, fazendaId: number, novo: string, alteraBrinco = true) {
  return registrarBrincoPontual(sessao(alteraBrinco ? 2 : 1), {
    fazendaId,
    animalId,
    alteraBrinco,
    alteraRfid: !alteraBrinco,
    novoBrinco: alteraBrinco ? novo : null,
    novoRfid: alteraBrinco ? null : novo,
    historico: {
      brincoAnterior: "A",
      brincoNovo: alteraBrinco ? novo : "A",
      motivo: "reidentificacao",
      observacoes: null,
      dataAlteracao: "2026-11-01",
    },
  });
}

describe("manejo pontual no MySQL descartável", () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    afirmarBancoDescartavel({ host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER });
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
    await exec("docker", [
      "run", "-d", "--name", CONTAINER, "-e", `MYSQL_ROOT_PASSWORD=${SENHA}`,
      "-e", `MYSQL_DATABASE=${BANCO}`, "-p", `127.0.0.1:${PORTA}:3306`, "mysql:8.4",
    ], { windowsHide: true });
    const prazo = Date.now() + 90_000;
    let ultimo = "";
    while (Date.now() < prazo) {
      try {
        const conn = await mysql.createConnection({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, multipleStatements: true,
        });
        const [bancoAtual] = await conn.query("SELECT DATABASE() AS nome") as [Array<{ nome: string }>, unknown];
        expect(bancoAtual[0]?.nome).toBe(BANCO);
        await conn.query(ESQUEMA);
        await conn.end();
        pool = mysql.createPool({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
          connectionLimit: 4, multipleStatements: true,
        });
        definirBancoManejo(drizzle(pool, { schema, mode: "default" }));
        return;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    throw new Error(ultimo || "MySQL descartável não subiu.");
  }, 120_000);

  afterAll(async () => {
    definirBancoManejo(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  beforeEach(async () => {
    definirBancoManejo(drizzle(pool, { schema, mode: "default" }));
    await pool.query("DELETE FROM historico_brincos");
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM usuario_fazendas");
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query("DELETE FROM fazendas");
    await pool.query("DELETE FROM users");
    await pool.query(`
      INSERT INTO users (id, openId, name, role, papel, titularUserId, situacao, sessionVersion) VALUES
        (1, 'p1', 'Principal', 'user', 'principal', 1, 'ativo', 1),
        (2, 'f2', 'Curral', 'user', 'comum', 1, 'ativo', 1),
        (3, 'p3', 'Outro', 'user', 'principal', 3, 'ativo', 1);
      INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Norte'), (20, 1, 'Sul'), (30, 3, 'Alheia');
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, 'manejo.criar', 1);
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1);
      INSERT INTO animais (id, userId, fazendaId, status, brinco, brincoEletronico) VALUES
        (100, 1, 10, 'ativo', 'A', NULL),
        (101, 1, 10, 'ativo', 'B', NULL),
        (102, 1, 20, 'ativo', 'C', NULL),
        (103, 3, 30, 'ativo', 'D', NULL);
    `);
  });

  it("sem o índice da fazenda a troca de brinco não grava, e o RFID ainda grava", async () => {
    await expect(troca(100, 10, "NOVO")).rejects.toMatchObject({
      code: "PRECONDITION_FAILED", message: MSG_MANEJO_SEM_INDICE,
    });
    const [antes] = await pool.query("SELECT brinco FROM animais WHERE id = 100") as [Array<{ brinco: string }>, unknown];
    const [hist] = await pool.query("SELECT id FROM historico_brincos") as [unknown[], unknown];
    expect(antes[0]?.brinco).toBe("A");
    expect(hist).toHaveLength(0);
    await troca(100, 10, "CHIP-1", false);
    const [rfid] = await pool.query("SELECT brinco, brincoEletronico FROM animais WHERE id = 100") as [Array<{ brinco: string; brincoEletronico: string }>, unknown];
    expect(rfid[0]).toEqual({ brinco: "A", brincoEletronico: "CHIP-1" });
  });

  it("com o índice, o funcionário troca no titular e o brinco repetido não duplica", async () => {
    const [indice] = await pool.query("SHOW INDEX FROM animais WHERE Key_name = 'animais_brinco_ativo_fazenda_uq'") as [unknown[], unknown];
    if (indice.length === 0) await pool.query(INDICE);
    const feito = await troca(100, 10, "NOVO");
    expect(feito.titularUserId).toBe(1);
    const [animal] = await pool.query("SELECT brinco, userId FROM animais WHERE id = 100") as [Array<{ brinco: string; userId: number }>, unknown];
    const [linha] = await pool.query("SELECT userId, usuarioNome FROM historico_brincos WHERE animalId = 100 ORDER BY id DESC LIMIT 1") as [Array<{ userId: number; usuarioNome: string }>, unknown];
    expect(animal[0]).toEqual({ brinco: "NOVO", userId: 1 });
    expect(linha[0]).toEqual({ userId: 1, usuarioNome: "Curral" });
    const disputados = await Promise.allSettled([troca(100, 10, "IGUAL"), troca(101, 10, "IGUAL")]);
    expect(disputados.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(disputados.filter((item) => item.status === "rejected")).toHaveLength(1);
    const [iguais] = await pool.query("SELECT id FROM animais WHERE brinco = 'IGUAL'") as [unknown[], unknown];
    expect(iguais).toHaveLength(1);
    await expect(registrarBrincoPontual(sessao(2), {
      fazendaId: 20, animalId: 102, alteraBrinco: true, alteraRfid: false, novoBrinco: "X", novoRfid: null,
      historico: { brincoAnterior: "C", brincoNovo: "X", motivo: "perda", observacoes: null, dataAlteracao: "2026-11-01" },
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(registrarBrincoPontual(sessao(1), {
      fazendaId: 30, animalId: 103, alteraBrinco: true, alteraRfid: false, novoBrinco: "Y", novoRfid: null,
      historico: { brincoAnterior: "D", brincoNovo: "Y", motivo: "perda", observacoes: null, dataAlteracao: "2026-11-01" },
    })).rejects.toMatchObject({ code: "NOT_FOUND", message: MSG_MANEJO_NAO_ENCONTRADO });
    const [sul] = await pool.query("SELECT brinco FROM animais WHERE id = 102") as [Array<{ brinco: string }>, unknown];
    expect(sul[0]?.brinco).toBe("C");
  });

  it("sem o banco o manejo não cai no arquivo", async () => {
    const fechado = mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada", database: "fd_teste_nao_conectar", connectionLimit: 1,
    });
    definirBancoManejo(drizzle(fechado, { schema, mode: "default" }));
    await expect(troca(100, 10, "Z")).rejects.toMatchObject({
      code: "PRECONDITION_FAILED", message: MSG_MANEJO_SEM_MYSQL,
    });
    await fechado.end();
  });
});
