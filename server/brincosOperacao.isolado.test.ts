import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { env } from "./_core/env";
import {
  brincosOperacao,
  definirBancoBrincos,
  MSG_BRINCO_HISTORICO,
  MSG_BRINCO_NAO_ENCONTRADO,
  MSG_BRINCO_SEM_MYSQL,
  type SessaoBrinco,
} from "./brincosOperacao";
import { afirmarBancoDescartavel } from "./isolamentoMysql";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bt-bri";
const PORTA = 3403;
const SENHA = "isolado-h4bt-bri";
const BANCO = "fd_h4bt_bri";

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
  id int NOT NULL, userId int NOT NULL, fazendaId int NULL, brinco varchar(50) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE historico_brincos (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  brincoAnterior varchar(50) NULL, brincoNovo varchar(50) NOT NULL,
  motivo enum('perda','danificado','reidentificacao','erro_cadastro','outro') NOT NULL,
  observacoes text NULL, dataAlteracao date NOT NULL, usuarioNome varchar(200) NULL,
  createdAt timestamp NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

function sessao(executorId: number, sessionVersionDaSessao: number | null = 1): SessaoBrinco {
  return { executorId, sessionVersionDaSessao };
}

describe("contrato das rotas de brinco", () => {
  it("a rota não devolve o arquivo local", () => {
    const fonte = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const bloco = fonte.slice(fonte.indexOf("const brincosRouter"), fonte.indexOf("PESSOAS"));
    expect(bloco).toContain("brincosOperacao.listar");
    expect(bloco).toContain("brincosOperacao.recusarExclusao");
    expect(bloco).not.toContain("localFallback");
    expect(bloco).not.toContain("listLocalHistoricoBrincos");
  });
});

describe("brincos no MySQL descartável", () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    afirmarBancoDescartavel({ host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER });
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
    await exec("docker", [
      "run", "-d", "--name", CONTAINER,
      "-e", `MYSQL_ROOT_PASSWORD=${SENHA}`,
      "-e", `MYSQL_DATABASE=${BANCO}`,
      "-p", `127.0.0.1:${PORTA}:3306`,
      "mysql:8.4",
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
        definirBancoBrincos(drizzle(pool, { schema, mode: "default" }));
        return;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    throw new Error(ultimo || "MySQL descartável não subiu.");
  }, 120_000);

  afterAll(async () => {
    definirBancoBrincos(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  beforeEach(async () => {
    definirBancoBrincos(drizzle(pool, { schema, mode: "default" }));
    for (const tabela of ["historico_brincos", "animais", "usuario_fazendas", "usuario_permissoes", "fazendas", "users"]) {
      await pool.query(`DELETE FROM \`${tabela}\``);
    }
    await pool.query(`
      INSERT INTO users (id, openId, name, role, papel, titularUserId, situacao, sessionVersion) VALUES
        (1, 'p1', 'Principal', 'user', 'principal', 1, 'ativo', 1),
        (2, 'f2', 'Curral', 'user', 'comum', 1, 'ativo', 1),
        (3, 'p3', 'Outro', 'user', 'principal', 3, 'ativo', 1);
      INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Norte'), (20, 1, 'Sul'), (30, 3, 'Alheia');
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'brincos.visualizar', 1), (2, 1, 'brincos.criar', 1), (2, 1, 'brincos.inativar', 1);
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1);
      INSERT INTO animais (id, userId, fazendaId, brinco) VALUES (100, 1, 10, 'VELHO'), (101, 3, 30, 'ALHEIO'), (102, 1, 20, 'SUL');
      INSERT INTO historico_brincos (id, userId, animalId, brincoNovo, motivo, dataAlteracao) VALUES
        (8, 1, 100, 'VELHO', 'perda', '2026-01-01'),
        (9, 2, 100, 'VELHO', 'outro', '2026-01-02');
    `);
  });

  it("o histórico do animal concedido aparece e o de outra fazenda não", async () => {
    const lista = await brincosOperacao.listar(sessao(2), 100);
    expect(lista.map((row) => row.id).sort()).toEqual([8, 9]);
    expect(lista.find((row) => row.id === 9)?.userId).toBe(2);
    await expect(brincosOperacao.listar(sessao(2), 102)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(brincosOperacao.listar(sessao(1), 101)).rejects.toMatchObject({
      code: "NOT_FOUND", message: MSG_BRINCO_NAO_ENCONTRADO,
    });
  });

  it("o registro novo fica no titular e não troca o brinco ativo", async () => {
    const criado = await brincosOperacao.registrar(sessao(2), {
      animalId: 100, brincoNovo: "NOVO", motivo: "reidentificacao", dataAlteracao: "2026-02-01",
    });
    const [linha] = await pool.query("SELECT userId, usuarioNome FROM historico_brincos WHERE id = ?", [criado.id]) as [Array<{ userId: number; usuarioNome: string }>, unknown];
    const [animal] = await pool.query("SELECT brinco FROM animais WHERE id = 100") as [Array<{ brinco: string }>, unknown];
    expect(linha[0]).toMatchObject({ userId: 1, usuarioNome: "Curral" });
    expect(animal[0]?.brinco).toBe("VELHO");
  });

  it("apagar o histórico é recusado e a linha antiga do funcionário continua", async () => {
    await expect(brincosOperacao.recusarExclusao(sessao(1), 9)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED", message: MSG_BRINCO_HISTORICO,
    });
    const [linhas] = await pool.query("SELECT id, userId FROM historico_brincos WHERE id = 9") as [Array<{ id: number; userId: number }>, unknown];
    expect(linhas[0]).toEqual({ id: 9, userId: 2 });
  });

  it("sem o banco o histórico não cai no arquivo", async () => {
    const fechado = mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada", database: "fd_teste_nao_conectar", connectionLimit: 1,
    });
    definirBancoBrincos(drizzle(fechado, { schema, mode: "default" }));
    await expect(brincosOperacao.listar(sessao(1), 100)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED", message: MSG_BRINCO_SEM_MYSQL,
    });
    await fechado.end();
  });
});
