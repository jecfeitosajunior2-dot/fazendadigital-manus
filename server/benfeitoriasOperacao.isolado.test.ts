import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { env } from "./_core/env";
import {
  benfeitoriasOperacao,
  definirBancoBenfeitorias,
  definirGanchoTravaBenfeitoria,
  MSG_BENFEITORIA_APAGAR,
  MSG_BENFEITORIA_NAO_ENCONTRADA,
  MSG_BENFEITORIA_SEM_MYSQL,
  MSG_BENFEITORIA_SEM_PERMISSAO,
  type SessaoBenfeitoria,
} from "./benfeitoriasOperacao";
import { afirmarBancoDescartavel } from "./isolamentoMysql";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bu-ben";
const PORTA = 3404;
const SENHA = "isolado-h4bu-ben";
const BANCO = "fd_h4bu_ben";

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
CREATE TABLE benfeitorias (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NULL, nome varchar(100) NOT NULL,
  tipo varchar(50) NULL, anoConstrucao int NULL, vidaUtil varchar(50) NULL,
  percentualAtividade decimal(5,2) NULL, localizacao varchar(200) NULL, estado varchar(50) NULL,
  status enum('ativo','manutencao','inativo') NULL DEFAULT 'ativo', dataInstalacao date NULL,
  valorEstimado decimal(12,2) NULL, imagem1 text NULL, imagem2 text NULL, imagem3 text NULL,
  observacoes text NULL, createdAt timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

function sessao(executorId: number, sessionVersionDaSessao: number | null = 1): SessaoBenfeitoria {
  return { executorId, sessionVersionDaSessao };
}

function linha(nome: string, fazenda = "Norte", extra: Record<string, string> = {}) {
  return { fazendaNome: fazenda, nome, tipo: "Galpão", estado: "Bom", anoConstrucao: "2001", ...extra };
}

describe("contrato das rotas de benfeitoria", () => {
  it("a rota não devolve o arquivo local", () => {
    const fonte = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const bloco = fonte.slice(fonte.indexOf("const benfeitoriasRouter"), fonte.indexOf("ESTOQUE ROUTER"));
    expect(bloco).toContain("benfeitoriasOperacao.listar");
    expect(bloco).toContain("benfeitoriasOperacao.importar");
    expect(bloco).toContain("benfeitoriasOperacao.recusarExclusao");
    expect(bloco).not.toContain("localFallback");
    expect(bloco).not.toContain("listLocalBenfeitorias");
    expect(bloco).not.toContain("listLocalFazendas");
  });
});

describe("benfeitorias no MySQL descartável", () => {
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
        definirBancoBenfeitorias(drizzle(pool, { schema, mode: "default" }));
        return;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    throw new Error(ultimo || "MySQL descartável não subiu.");
  }, 120_000);

  afterAll(async () => {
    definirBancoBenfeitorias(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  beforeEach(async () => {
    definirBancoBenfeitorias(drizzle(pool, { schema, mode: "default" }));
    definirGanchoTravaBenfeitoria(null);
    for (const tabela of ["benfeitorias", "usuario_fazendas", "usuario_permissoes", "fazendas", "users"]) {
      await pool.query(`DELETE FROM \`${tabela}\``);
    }
    await pool.query(`
      INSERT INTO users (id, openId, name, role, papel, titularUserId, situacao, sessionVersion) VALUES
        (1, 'p1', 'Principal', 'user', 'principal', 1, 'ativo', 1),
        (2, 'f2', 'Curral', 'user', 'comum', 1, 'ativo', 1),
        (3, 'p3', 'Outro', 'user', 'principal', 3, 'ativo', 1),
        (5, 'f5', 'Sem acesso', 'user', 'comum', 1, 'ativo', 1);
      INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Norte'), (20, 1, 'Sul'), (30, 3, 'Alheia');
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'benfeitorias.visualizar', 1), (2, 1, 'benfeitorias.criar', 1),
        (2, 1, 'benfeitorias.editar', 1), (2, 1, 'benfeitorias.inativar', 1);
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1);
      INSERT INTO benfeitorias (id, userId, fazendaId, nome, tipo, estado, anoConstrucao, imagem1) VALUES
        (40, 1, 10, 'Curral coberto', 'Galpão', 'Bom', 1990, '/manus-storage/foto-antiga.jpg'),
        (41, 1, 20, 'Sede', 'Casa', 'Regular', 1980, NULL),
        (42, 1, NULL, 'Sem fazenda', 'Outro', 'Bom', 1970, NULL),
        (43, 3, 30, 'Do outro', 'Casa', 'Bom', 2000, NULL),
        (44, 2, 10, 'Antiga do funcionario', 'Galpão', 'Bom', 1995, NULL);
    `);
  });

  it("lista a fazenda concedida e esconde a de outra conta", async () => {
    const titular = await benfeitoriasOperacao.listar(sessao(1));
    const funcionario = await benfeitoriasOperacao.listar(sessao(2));
    expect(titular.map((row) => row.id).sort()).toEqual([40, 41, 42]);
    expect(funcionario.map((row) => row.id)).toEqual([40]);
    expect(JSON.stringify(titular)).not.toContain("Do outro");
    expect(JSON.stringify(titular)).not.toContain("Antiga do funcionario");
    await expect(benfeitoriasOperacao.listar(sessao(5))).rejects.toMatchObject({
      code: "FORBIDDEN", message: MSG_BENFEITORIA_SEM_PERMISSAO,
    });
    await expect(benfeitoriasOperacao.listar(sessao(1, 9))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("o detalhe de outra fazenda ou de outra conta não abre", async () => {
    const propria = await benfeitoriasOperacao.obter(sessao(2), 40);
    expect(propria.nome).toBe("Curral coberto");
    expect(propria.imagem1).toBe("/manus-storage/foto-antiga.jpg");
    await expect(benfeitoriasOperacao.obter(sessao(2), 41)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(benfeitoriasOperacao.obter(sessao(1), 43)).rejects.toMatchObject({
      code: "NOT_FOUND", message: MSG_BENFEITORIA_NAO_ENCONTRADA,
    });
  });

  it("o funcionário cadastra no titular e a edição não troca o dono", async () => {
    const criada = await benfeitoriasOperacao.criar(sessao(2), {
      fazendaId: 10, nome: "Bebedouro", anoConstrucao: 2020, tipo: "Açude", estado: "Bom",
    }, [null, null, null]);
    const [row] = await pool.query("SELECT userId, fazendaId FROM benfeitorias WHERE id = ?", [criada.id]) as [Array<{ userId: number; fazendaId: number }>, unknown];
    expect(row[0]).toEqual({ userId: 1, fazendaId: 10 });
    await benfeitoriasOperacao.atualizar(sessao(2), criada.id, { nome: "Bebedouro novo" }, [null, null, null]);
    await expect(benfeitoriasOperacao.atualizar(sessao(2), criada.id, { fazendaId: 20 }, [null, null, null]))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    const [depois] = await pool.query("SELECT userId, fazendaId, nome FROM benfeitorias WHERE id = ?", [criada.id]) as [Array<{ userId: number; fazendaId: number; nome: string }>, unknown];
    expect(depois[0]).toMatchObject({ userId: 1, fazendaId: 10, nome: "Bebedouro novo" });
  });

  it("desfaz a edição se a transação quebra", async () => {
    definirGanchoTravaBenfeitoria(async () => { throw new Error("falhou no meio"); });
    await expect(benfeitoriasOperacao.atualizar(sessao(1), 40, { nome: "Nao grava" }, [null, null, null]))
      .rejects.toThrow(/falhou no meio/);
    const [row] = await pool.query("SELECT nome, imagem1 FROM benfeitorias WHERE id = 40") as [Array<{ nome: string; imagem1: string }>, unknown];
    expect(row[0]?.nome).toBe("Curral coberto");
    expect(row[0]?.imagem1).toBe("/manus-storage/foto-antiga.jpg");
  });

  it("não apaga a benfeitoria e a situação inativa conserva a foto", async () => {
    await expect(benfeitoriasOperacao.recusarExclusao(sessao(1), 40)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED", message: MSG_BENFEITORIA_APAGAR,
    });
    await benfeitoriasOperacao.atualizar(sessao(1), 40, { status: "inativo" }, [null, null, null]);
    const [row] = await pool.query("SELECT status, imagem1, userId FROM benfeitorias WHERE id = 40") as [Array<{ status: string; imagem1: string; userId: number }>, unknown];
    expect(row[0]).toMatchObject({ status: "inativo", imagem1: "/manus-storage/foto-antiga.jpg", userId: 1 });
    await expect(benfeitoriasOperacao.recusarExclusao(sessao(1), 43)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("dois cadastros ao mesmo tempo deixam os dois no titular", async () => {
    const resultados = await Promise.all([
      benfeitoriasOperacao.criar(sessao(1), { fazendaId: 10, nome: "Dupla", anoConstrucao: 2021, tipo: "Galpão", estado: "Bom" }, [null, null, null]),
      benfeitoriasOperacao.criar(sessao(2), { fazendaId: 10, nome: "Dupla", anoConstrucao: 2021, tipo: "Galpão", estado: "Bom" }, [null, null, null]),
    ]);
    expect(resultados).toHaveLength(2);
    const [linhas] = await pool.query("SELECT userId FROM benfeitorias WHERE nome = 'Dupla'") as [Array<{ userId: number }>, unknown];
    expect(linhas).toHaveLength(2);
    expect(linhas.every((linha) => linha.userId === 1)).toBe(true);
  });

  it("a importação grava só as linhas boas, ignora o mapa forjado e desfaz se quebra", async () => {
    const previa = await benfeitoriasOperacao.validar(sessao(2), [
      linha("Galpão norte"),
      linha("Fora", "Alheia"),
      linha(""),
    ]);
    expect(previa.validos).toBe(1);
    expect(previa.erros.some((erro) => erro.mensagem.includes("Alheia"))).toBe(true);
    expect(previa.fazendaNomeParaId.norte).toBe(10);
    expect(previa.fazendaNomeParaId.alheia).toBeUndefined();
    const gravada = await benfeitoriasOperacao.importar(sessao(2), [
      linha("Galpão norte"),
      linha("Outra norte"),
      linha("Sem nome", "Norte", { nome: "" }),
    ]);
    expect(gravada.importados).toBe(2);
    expect(gravada.rejeitados).toBe(1);
    const deNovo = await benfeitoriasOperacao.importar(sessao(1), [linha("Galpão norte")]);
    expect(deNovo.importados).toBe(1);
    const [contagem] = await pool.query("SELECT COUNT(*) AS n FROM benfeitorias WHERE nome = 'Galpão norte' AND userId = 1") as [Array<{ n: number }>, unknown];
    expect(Number(contagem[0]?.n)).toBe(2);
    definirGanchoTravaBenfeitoria(async () => { throw new Error("falhou no meio"); });
    await expect(benfeitoriasOperacao.importar(sessao(1), [linha("Quebra")])).rejects.toThrow(/falhou no meio/);
    const [quebrada] = await pool.query("SELECT id FROM benfeitorias WHERE nome = 'Quebra'") as [unknown[], unknown];
    expect(quebrada).toHaveLength(0);
  });

  it("sem o banco a benfeitoria não cai no arquivo", async () => {
    const fechado = mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada", database: "fd_teste_nao_conectar", connectionLimit: 1,
    });
    definirBancoBenfeitorias(drizzle(fechado, { schema, mode: "default" }));
    await expect(benfeitoriasOperacao.listar(sessao(1))).rejects.toMatchObject({
      code: "PRECONDITION_FAILED", message: MSG_BENFEITORIA_SEM_MYSQL,
    });
    await fechado.end();
  });
});
