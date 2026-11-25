import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { env } from "./_core/env";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import {
  definirBancoPessoas,
  MSG_PESSOA_NAO_ENCONTRADA,
  MSG_PESSOA_SEM_MYSQL,
  MSG_PESSOA_SEM_PERMISSAO,
  MSG_PESSOA_VINCULO_OPACO,
  pessoasOperacao,
  type SessaoPessoa,
} from "./pessoasOperacao";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bt-pes";
const PORTA = 3402;
const SENHA = "isolado-h4bt-pes";
const BANCO = "fd_h4bt_pes";
const CPF = "52998224725";

const ESQUEMA = `
CREATE TABLE users (
  id int NOT NULL, openId varchar(255) NOT NULL, name varchar(255) NOT NULL,
  email varchar(255) NULL, role enum('admin','user') NOT NULL DEFAULT 'user',
  papel enum('principal','secundario','comum') NOT NULL,
  titularUserId int NULL, situacao enum('convidado','ativo','inativo') NOT NULL,
  sessionVersion int NOT NULL DEFAULT 0, PRIMARY KEY (id), UNIQUE KEY openId (openId)
) ENGINE=InnoDB;
CREATE TABLE usuario_permissoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, titularUserId int NOT NULL,
  permissao varchar(80) NOT NULL, concedidoPorUserId int NOT NULL,
  concedidoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_fazendas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  concedidoPorUserId int NOT NULL, concedidoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE fazendas (
  id int NOT NULL, userId int NOT NULL, nome varchar(200) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pessoas (
  id int NOT NULL AUTO_INCREMENT, user_id int NOT NULL, nome varchar(255) NOT NULL,
  tipo enum('fornecedor','cliente','funcionario') NOT NULL, funcao varchar(150) NULL,
  documento varchar(20) NULL, endereco varchar(255) NULL, telefone varchar(30) NULL,
  email varchar(150) NULL, observacoes text NULL, propriedade_estabelecimento varchar(255) NULL,
  nome_contato varchar(255) NULL, cidade varchar(100) NULL, uf varchar(2) NULL,
  ativo tinyint(1) NULL DEFAULT 1, created_at timestamp NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE compras (
  id int NOT NULL, user_id int NOT NULL, fornecedor_id int NULL, data varchar(20) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE vendas (
  id int NOT NULL, user_id int NOT NULL, comprador_id int NULL, data varchar(20) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE estoque_operacoes (
  id int NOT NULL, user_id int NOT NULL, fornecedor_id int NULL, frete_credor_id int NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE financeiro_titulos (
  id int NOT NULL, user_id int NOT NULL, pessoa_id int NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE financeiro_movimentos (
  id int NOT NULL, user_id int NOT NULL, contraparte_pessoa_id int NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE manutencoes (
  id int NOT NULL, userId int NOT NULL, prestadorPessoaId int NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

function sessao(executorId: number, sessionVersionDaSessao: number | null = 1): SessaoPessoa {
  return { executorId, sessionVersionDaSessao };
}

describe("contrato das rotas de pessoas", () => {
  it("a rota não devolve o arquivo local", () => {
    const fonte = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const bloco = fonte.slice(fonte.indexOf("const pessoasRouter"), fonte.indexOf("MANEJO ROUTER"));
    expect(bloco).toContain("pessoasOperacao.listar");
    expect(bloco).toContain("pessoasOperacao.inativar");
    expect(bloco).toContain("pessoasOperacao.conferirExclusao");
    expect(bloco).toContain("pessoasOperacao.excluir");
    expect(bloco).not.toContain("localFallback");
    expect(bloco).not.toContain("devLocalStore");
  });
});

describe("pessoas no MySQL descartável", () => {
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
        definirBancoPessoas(drizzle(pool, { schema, mode: "default" }));
        return;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    throw new Error(ultimo || "MySQL descartável não subiu.");
  }, 120_000);

  afterAll(async () => {
    definirBancoPessoas(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  beforeEach(async () => {
    definirBancoPessoas(drizzle(pool, { schema, mode: "default" }));
    await pool.query("DELETE FROM compras");
    await pool.query("DELETE FROM vendas");
    await pool.query("DELETE FROM estoque_operacoes");
    await pool.query("DELETE FROM financeiro_titulos");
    await pool.query("DELETE FROM financeiro_movimentos");
    await pool.query("DELETE FROM manutencoes");
    await pool.query("DELETE FROM pessoas");
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query("DELETE FROM users");
    await pool.query(`
      INSERT INTO users (id, openId, name, role, papel, titularUserId, situacao, sessionVersion) VALUES
        (1, 'p1', 'Principal', 'user', 'principal', 1, 'ativo', 1),
        (2, 'f2', 'Curral', 'user', 'comum', 1, 'ativo', 1),
        (3, 'p3', 'Outro', 'user', 'principal', 3, 'ativo', 1),
        (5, 'f5', 'Sem acesso', 'user', 'comum', 1, 'ativo', 1);
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'pessoas.visualizar', 1),
        (2, 1, 'pessoas.criar', 1),
        (2, 1, 'pessoas.editar', 1),
        (2, 1, 'pessoas.inativar', 1);
      INSERT INTO pessoas (id, user_id, nome, tipo, ativo) VALUES
        (40, 1, 'Joao', 'fornecedor', 1),
        (41, 3, 'Maria', 'cliente', 1);
      INSERT INTO compras (id, user_id, fornecedor_id, data) VALUES (7, 1, 40, '2026-01-01');
    `);
  });

  it("a pessoa da conta aparece para o titular e para o funcionário, e a de outra conta não", async () => {
    const titular = await pessoasOperacao.listar(sessao(1));
    const funcionario = await pessoasOperacao.listar(sessao(2));
    expect(titular.map((row) => row.nome)).toEqual(["Joao"]);
    expect(funcionario.map((row) => row.id)).toEqual([40]);
    expect(JSON.stringify(titular)).not.toContain("Maria");
  });

  it("sem permissão e com sessão revogada a lista não abre", async () => {
    await expect(pessoasOperacao.listar(sessao(5))).rejects.toMatchObject({
      code: "FORBIDDEN", message: MSG_PESSOA_SEM_PERMISSAO,
    });
    await expect(pessoasOperacao.listar(sessao(1, 9))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("o funcionário cadastra no titular e o documento repetido não duplica", async () => {
    const criada = await pessoasOperacao.criar(sessao(2), {
      nome: "Comprador", tipo: "cliente", documento: CPF, userId: 2,
    } as { nome: string; tipo: "cliente"; documento: string });
    const [row] = await pool.query("SELECT user_id AS userId FROM pessoas WHERE id = ?", [criada.id]) as [Array<{ userId: number }>, unknown];
    expect(row[0]?.userId).toBe(1);
    await expect(pessoasOperacao.criar(sessao(1), { nome: "Outro", tipo: "cliente", documento: CPF }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    const [contagem] = await pool.query("SELECT COUNT(*) AS n FROM pessoas WHERE tipo = 'cliente' AND user_id = 1") as [Array<{ n: number }>, unknown];
    expect(Number(contagem[0]?.n)).toBe(1);
  });

  it("duas criações ao mesmo tempo deixam um comprador do titular", async () => {
    const resultados = await Promise.allSettled([
      pessoasOperacao.criar(sessao(1), { nome: "A", tipo: "cliente", documento: CPF }),
      pessoasOperacao.criar(sessao(2), { nome: "B", tipo: "cliente", documento: CPF }),
    ]);
    expect(resultados.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const [contagem] = await pool.query("SELECT user_id AS userId FROM pessoas WHERE documento = ?", [CPF]) as [Array<{ userId: number }>, unknown];
    expect(contagem).toHaveLength(1);
    expect(contagem[0]?.userId).toBe(1);
  });

  it("inativar guarda a pessoa e a compra, e outra conta não some", async () => {
    await pessoasOperacao.inativar(sessao(2), 40);
    const [pessoa] = await pool.query("SELECT ativo FROM pessoas WHERE id = 40") as [Array<{ ativo: number }>, unknown];
    const [compra] = await pool.query("SELECT fornecedor_id AS fornecedorId FROM compras WHERE id = 7") as [Array<{ fornecedorId: number }>, unknown];
    expect(Number(pessoa[0]?.ativo)).toBe(0);
    expect(compra[0]?.fornecedorId).toBe(40);
    const lista = await pessoasOperacao.listar(sessao(1));
    expect(lista).toEqual([]);
    const comInativos = await pessoasOperacao.listar(sessao(1), { incluirInativos: true });
    expect(comInativos.map((row) => row.id)).toEqual([40]);
    await pessoasOperacao.reativar(sessao(1), 40);
    const deNovo = await pessoasOperacao.listar(sessao(1));
    expect(deNovo.map((row) => row.id)).toEqual([40]);
    await expect(pessoasOperacao.inativar(sessao(1), 41)).rejects.toMatchObject({
      code: "NOT_FOUND", message: MSG_PESSOA_NAO_ENCONTRADA,
    });
    const [alheia] = await pool.query("SELECT ativo, user_id AS userId FROM pessoas WHERE id = 41") as [Array<{ ativo: number; userId: number }>, unknown];
    expect(alheia[0]).toMatchObject({ ativo: 1, userId: 3 });
  });

  it("parceiro com compra não é excluído e o sem vínculo sai de verdade", async () => {
    const bloqueado = await pessoasOperacao.conferirExclusao(sessao(1), 40);
    expect(bloqueado.canDelete).toBe(false);
    await expect(pessoasOperacao.excluir(sessao(1), 40)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const [pessoa] = await pool.query("SELECT id FROM pessoas WHERE id = 40") as [Array<{ id: number }>, unknown];
    const [compra] = await pool.query("SELECT fornecedor_id AS fornecedorId FROM compras WHERE id = 7") as [Array<{ fornecedorId: number }>, unknown];
    expect(pessoa[0]?.id).toBe(40);
    expect(compra[0]?.fornecedorId).toBe(40);

    const livre = await pessoasOperacao.criar(sessao(1), { nome: "Sem vinculo", tipo: "funcionario" });
    const conferencia = await pessoasOperacao.conferirExclusao(sessao(1), livre.id);
    expect(conferencia.canDelete).toBe(true);
    await pessoasOperacao.excluir(sessao(1), livre.id);
    const [sumiu] = await pool.query("SELECT id FROM pessoas WHERE id = ?", [livre.id]) as [Array<{ id: number }>, unknown];
    expect(sumiu).toHaveLength(0);
    await expect(pessoasOperacao.excluir(sessao(1), 41)).rejects.toMatchObject({
      code: "NOT_FOUND", message: MSG_PESSOA_NAO_ENCONTRADA,
    });
  });

  it("sem uma tabela de vínculo a exclusão não apaga", async () => {
    await pool.query("RENAME TABLE vendas TO vendas_fora");
    try {
      await expect(pessoasOperacao.conferirExclusao(sessao(1), 40)).rejects.toMatchObject({
        code: "PRECONDITION_FAILED", message: MSG_PESSOA_VINCULO_OPACO,
      });
      const [pessoa] = await pool.query("SELECT id FROM pessoas WHERE id = 40") as [Array<{ id: number }>, unknown];
      expect(pessoa[0]?.id).toBe(40);
    } finally {
      await pool.query("RENAME TABLE vendas_fora TO vendas");
    }
  });

  it("sem o banco a pessoa não cai no arquivo", async () => {
    const fechado = mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada", database: "fd_teste_nao_conectar", connectionLimit: 1,
    });
    definirBancoPessoas(drizzle(fechado, { schema, mode: "default" }));
    await expect(pessoasOperacao.listar(sessao(1))).rejects.toMatchObject({
      code: "PRECONDITION_FAILED", message: MSG_PESSOA_SEM_MYSQL,
    });
    await fechado.end();
  });
});
