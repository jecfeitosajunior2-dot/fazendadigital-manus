import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { env } from "./_core/env";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import {
  consultarVisaoRebanho,
  definirBancoVisao,
  MSG_REBANHO_SEM_MYSQL,
  type SessaoVisao,
} from "./routers/rebanhoOverview";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bu-vis";
const PORTA = 3405;
const SENHA = "isolado-h4bu-vis";
const BANCO = "fd_h4bu_vis";

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
  id int NOT NULL, userId int NOT NULL, fazendaId int NULL, status varchar(20) NULL,
  brinco varchar(50) NULL, categoria varchar(50) NULL, sexo enum('macho','femea') NOT NULL,
  raca varchar(100) NULL, loteId int NULL, dataNascimento date NULL, dataEntrada date NULL,
  pesoAtual decimal(8,2) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pesagens (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  peso decimal(8,2) NOT NULL, data date NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE saude_registros (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  medicamento varchar(200) NULL, dataRegistro date NOT NULL, proximaData date NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE estoque (
  id int NOT NULL AUTO_INCREMENT, nome varchar(100) NOT NULL,
  possui_carencia tinyint(1) NULL, carencia_abate_dias int NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE lotes (id int NOT NULL, userId int NOT NULL, nome varchar(100) NOT NULL, pastoAtualId int NULL, PRIMARY KEY (id));
CREATE TABLE pastos (id int NOT NULL, userId int NOT NULL, capacidade int NULL, PRIMARY KEY (id));
CREATE TABLE animal_baixas (
  id int NOT NULL, userId int NOT NULL, fazendaId int NOT NULL, dataBaixa date NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

function sessao(executorId: number, sessionVersionDaSessao: number | null = 1): SessaoVisao {
  return { executorId, sessionVersionDaSessao };
}

describe("visão do rebanho no MySQL descartável", () => {
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
        definirBancoVisao(drizzle(pool, { schema, mode: "default" }));
        return;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    throw new Error(ultimo || "MySQL descartável não subiu.");
  }, 120_000);

  afterAll(async () => {
    definirBancoVisao(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  beforeEach(async () => {
    definirBancoVisao(drizzle(pool, { schema, mode: "default" }));
    for (const tabela of ["animal_baixas", "pesagens", "saude_registros", "animais", "lotes", "pastos", "estoque", "usuario_fazendas", "usuario_permissoes", "fazendas", "users"]) {
      await pool.query(`DELETE FROM \`${tabela}\``);
    }
    await pool.query(`
      INSERT INTO users (id, openId, name, role, papel, titularUserId, situacao, sessionVersion) VALUES
        (1, 'p1', 'Principal', 'user', 'principal', 1, 'ativo', 1),
        (2, 'f2', 'Curral', 'user', 'comum', 1, 'ativo', 1),
        (3, 'p3', 'Outro', 'user', 'principal', 3, 'ativo', 1);
      INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Norte'), (20, 1, 'Sul'), (30, 3, 'Alheia');
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'animais.visualizar', 1);
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1);
      INSERT INTO animais (id, userId, fazendaId, status, brinco, categoria, sexo, pesoAtual, dataEntrada) VALUES
        (1, 1, 10, 'ativo', 'A', 'Boi', 'macho', 400, '2026-11-20'),
        (2, 1, 10, 'ativo', 'B', 'Vaca', 'femea', 200, '2020-01-01'),
        (3, 1, 10, 'vendido', 'C', 'Boi', 'macho', 999, '2026-11-20'),
        (4, 1, 20, 'ativo', 'D', 'Boi', 'macho', 100, '2020-01-01'),
        (5, 3, 30, 'ativo', 'E', 'Vaca', 'femea', 800, '2026-11-20');
      INSERT INTO animal_baixas (id, userId, fazendaId, dataBaixa) VALUES
        (1, 1, 10, '2026-11-15'),
        (2, 1, 20, '2026-11-15'),
        (3, 3, 30, '2026-11-15');
    `);
  });

  it("soma só os animais ativos das fazendas concedidas", async () => {
    const titular = await consultarVisaoRebanho(sessao(1));
    const funcionario = await consultarVisaoRebanho(sessao(2));
    const norte = await consultarVisaoRebanho(sessao(1), 10);
    expect(titular.totalAnimais).toBe(3);
    expect(titular.totalMachos).toBe(2);
    expect(titular.totalFemeas).toBe(1);
    expect(titular.pesoMedio).toBe(233);
    expect(titular.evolucaoEfetivo.saidas).toBe(2);
    expect(funcionario.totalAnimais).toBe(2);
    expect(funcionario.totalMachos).toBe(1);
    expect(funcionario.totalFemeas).toBe(1);
    expect(funcionario.pesoMedio).toBe(300);
    expect(funcionario.evolucaoEfetivo.saidas).toBe(1);
    expect(norte.totalAnimais).toBe(2);
    expect(JSON.stringify(funcionario)).not.toContain("800");
    await expect(consultarVisaoRebanho(sessao(2), 20)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(consultarVisaoRebanho(sessao(1), 30)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("sem o banco a visão não completa com outro número", async () => {
    const fechado = mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada", database: "fd_teste_nao_conectar", connectionLimit: 1,
    });
    definirBancoVisao(drizzle(fechado, { schema, mode: "default" }));
    await expect(consultarVisaoRebanho(sessao(1))).rejects.toMatchObject({
      code: "PRECONDITION_FAILED", message: MSG_REBANHO_SEM_MYSQL,
    });
    await fechado.end();
  });
});
