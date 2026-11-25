import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { fazendas } from "../drizzle/schema";
import { env } from "./_core/env";
import {
  definirBancoFazendas,
  definirGanchoTravaFazenda,
  fazendasOperacao,
  MSG_FAZENDA_HISTORICO,
  MSG_FAZENDA_SEM_MYSQL,
  MSG_FAZENDA_SEM_PERMISSAO,
  type SessaoFazenda,
} from "./fazendasOperacao";
import { afirmarBancoDescartavel } from "./isolamentoMysql";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bt-faz";
const PORTA = 3401;
const SENHA = "isolado-h4bt-faz";
const BANCO = "fd_h4bt_faz";

const ESQUEMA = `
CREATE TABLE users (
  id int NOT NULL, openId varchar(255) NOT NULL, name varchar(255) NOT NULL,
  email varchar(255) NULL, role enum('admin','user') NOT NULL DEFAULT 'user',
  papel enum('principal','secundario','comum') NOT NULL,
  titularUserId int NULL, situacao enum('convidado','ativo','inativo') NOT NULL,
  sessionVersion int NOT NULL DEFAULT 0, PRIMARY KEY (id), UNIQUE KEY openId (openId)
) ENGINE=InnoDB;
CREATE TABLE fazendas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, nome varchar(200) NOT NULL,
  sigla varchar(20) NULL, cidade varchar(100) NULL, estado varchar(2) NULL,
  pais varchar(50) NULL, unidadeArea varchar(30) NULL, area decimal(10,2) NULL,
  areaReserva decimal(10,2) NULL, areaLiquida decimal(10,2) NULL, endereco varchar(300) NULL,
  cep varchar(10) NULL, telefone varchar(20) NULL, responsavel varchar(200) NULL,
  atividadePrincipal varchar(50) NULL, atividadeCria tinyint(1) NULL, atividadeRecria tinyint(1) NULL,
  atividadeEngorda tinyint(1) NULL, atividadeConfinamento tinyint(1) NULL, atividadeLeite tinyint(1) NULL,
  atividadeAgricultura tinyint(1) NULL, atividadeOutros tinyint(1) NULL, quantidadeAnimais int NULL,
  cpfCnpj varchar(20) NULL, inscricaoEstadual varchar(50) NULL, registroIncra varchar(50) NULL,
  nirf varchar(50) NULL, numeroCar varchar(80) NULL, matriculaImovel varchar(80) NULL,
  matriculasImovel text NULL, tipoPosse varchar(50) NULL, possuiSisbov tinyint(1) NULL,
  razaoSocial varchar(200) NULL, latitude varchar(30) NULL, longitude varchar(30) NULL,
  distanciaMunicipio decimal(10,2) NULL, valorHectare decimal(12,2) NULL,
  fonteEnergia varchar(80) NULL, fonteAgua varchar(80) NULL,
  responsavelOperacionalNome varchar(200) NULL, responsavelOperacionalTelefone varchar(40) NULL,
  responsavelOperacionalFuncao varchar(80) NULL, melhoramentoGenetico text NULL,
  configReproPipeline text NULL, observacoes text NULL,
  createdAt timestamp NULL DEFAULT CURRENT_TIMESTAMP, updatedAt timestamp NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_fazendas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  concedidoPorUserId int NOT NULL, concedidoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_permissoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, titularUserId int NOT NULL,
  permissao varchar(80) NOT NULL, concedidoPorUserId int NOT NULL,
  concedidoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pastos (id int NOT NULL, userId int NOT NULL, fazendaId int NOT NULL, nome varchar(100) NOT NULL, PRIMARY KEY (id));
CREATE TABLE animais (id int NOT NULL, userId int NOT NULL, fazendaId int NULL, PRIMARY KEY (id));
CREATE TABLE lotes (id int NOT NULL, userId int NOT NULL, fazendaId int NULL, PRIMARY KEY (id));
CREATE TABLE maquinas (id int NOT NULL, userId int NOT NULL, fazendaId int NULL, PRIMARY KEY (id));
CREATE TABLE benfeitorias (id int NOT NULL, userId int NOT NULL, fazendaId int NULL, PRIMARY KEY (id));
CREATE TABLE estoque (id int NOT NULL, fazenda_id int NULL, PRIMARY KEY (id));
CREATE TABLE compras (id int NOT NULL, fazenda_id int NULL, PRIMARY KEY (id));
CREATE TABLE vendas (id int NOT NULL, fazenda_id int NULL, PRIMARY KEY (id));
CREATE TABLE animal_baixas (id int NOT NULL, fazendaId int NOT NULL, PRIMARY KEY (id));
CREATE TABLE nutricao_dietas (id int NOT NULL, fazendaId int NOT NULL, PRIMARY KEY (id));
CREATE TABLE abastecimentos (id int NOT NULL, fazendaId int NULL, PRIMARY KEY (id));
CREATE TABLE financeiro_titulos (id int NOT NULL, fazenda_origem_id int NULL, PRIMARY KEY (id));
CREATE TABLE auditoria_eventos (id int NOT NULL, fazendaId int NULL, PRIMARY KEY (id));
CREATE TABLE reproducao_operacoes (id int NOT NULL, fazendaId int NOT NULL, PRIMARY KEY (id));
CREATE TABLE semen_partidas (id int NOT NULL, fazenda_id int NOT NULL, PRIMARY KEY (id));
`;

function sessao(executorId: number, sessionVersionDaSessao: number | null = 1): SessaoFazenda {
  return { executorId, sessionVersionDaSessao };
}

describe("fazendas no MySQL descartável", () => {
  let pool: mysql.Pool;
  let banco: ReturnType<typeof drizzle<typeof schema>>;

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
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
          multipleStatements: true,
        });
        const [bancoAtual] = await conn.query("SELECT DATABASE() AS nome") as [Array<{ nome: string }>, unknown];
        expect(bancoAtual[0]?.nome).toBe(BANCO);
        expect(PORTA).not.toBe(3306);
        await conn.query(ESQUEMA);
        await conn.end();
        pool = mysql.createPool({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
          connectionLimit: 4, multipleStatements: true,
        });
        banco = drizzle(pool, { schema, mode: "default" });
        definirBancoFazendas(banco);
        return;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    throw new Error(ultimo || "MySQL descartável não subiu.");
  }, 120_000);

  afterAll(async () => {
    definirGanchoTravaFazenda(null);
    definirBancoFazendas(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  beforeEach(async () => {
    definirGanchoTravaFazenda(null);
    definirBancoFazendas(banco);
    await pool.query("SET FOREIGN_KEY_CHECKS=0");
    for (const tabela of [
      "usuario_fazendas", "usuario_permissoes", "pastos", "animais", "lotes", "maquinas",
      "benfeitorias", "estoque", "compras", "vendas", "animal_baixas", "nutricao_dietas",
      "abastecimentos", "financeiro_titulos", "auditoria_eventos", "reproducao_operacoes",
      "semen_partidas", "fazendas", "users",
    ]) {
      await pool.query(`DELETE FROM \`${tabela}\``);
    }
    await pool.query(`
      INSERT INTO users (id, openId, name, role, papel, titularUserId, situacao, sessionVersion) VALUES
        (1, 'p1', 'Principal', 'user', 'principal', 1, 'ativo', 1),
        (2, 'f2', 'Curral', 'user', 'comum', 1, 'ativo', 1),
        (3, 'p3', 'Outro', 'user', 'principal', 3, 'ativo', 1),
        (5, 'f5', 'Sem acesso', 'user', 'comum', 1, 'ativo', 1);
      INSERT INTO fazendas (id, userId, nome, cidade, createdAt) VALUES
        (10, 1, 'Norte', 'Cidade Norte', '2026-03-02 00:00:00'),
        (20, 1, 'Sul', 'Cidade Sul', '2026-01-15 00:00:00'),
        (30, 3, 'Alheia', 'Longe', '2026-04-01 00:00:00');
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'fazendas.visualizar', 1),
        (2, 1, 'fazendas.criar', 1),
        (2, 1, 'fazendas.editar', 1),
        (2, 1, 'fazendas.inativar', 1);
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1);
    `);
  });

  it("o titular vê as fazendas da conta e o funcionário só a concedida", async () => {
    const titular = await fazendasOperacao.listar(sessao(1));
    const funcionario = await fazendasOperacao.listar(sessao(2));
    expect(titular.map((row) => row.id)).toEqual([10, 20]);
    expect(titular[0]).toMatchObject({ cidade: "Cidade Norte", userId: 1 });
    expect(funcionario.map((row) => row.id)).toEqual([10]);
    expect(JSON.stringify(titular)).not.toContain("Alheia");
  });

  it("funcionário sem permissão e sessão revogada não consultam", async () => {
    await expect(fazendasOperacao.listar(sessao(5))).rejects.toMatchObject({
      code: "FORBIDDEN", message: MSG_FAZENDA_SEM_PERMISSAO,
    });
    await expect(fazendasOperacao.obter(sessao(1, 9), 10)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("a fazenda de outra conta e a não concedida ficam fechadas", async () => {
    await expect(fazendasOperacao.obter(sessao(1), 30)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(fazendasOperacao.obter(sessao(2), 20)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(fazendasOperacao.atualizar(sessao(2), 20, { nome: "Tomada" })).rejects.toBeInstanceOf(TRPCError);
    const [sul] = await banco.select({ nome: fazendas.nome, userId: fazendas.userId }).from(fazendas).where(eq(fazendas.id, 20));
    expect(sul).toEqual({ nome: "Sul", userId: 1 });
  });

  it("o funcionário cadastra no nome do titular e não leva a propriedade", async () => {
    const criada = await fazendasOperacao.criar(sessao(2), { nome: "Retiro", userId: 2, cidade: "Campo" });
    const [row] = await banco.select().from(fazendas).where(eq(fazendas.id, criada.id));
    expect(row?.userId).toBe(1);
    expect(row?.nome).toBe("Retiro");
    expect(row?.cidade).toBe("Campo");
    const doFuncionario = await fazendasOperacao.listar(sessao(2));
    expect(doFuncionario.map((item) => item.id)).not.toContain(criada.id);
  });

  it("a edição não troca o dono e desfaz se a transação quebra", async () => {
    await fazendasOperacao.atualizar(sessao(2), 10, { cidade: "Nova", userId: 2 });
    definirGanchoTravaFazenda(async () => {
      throw new Error("falhou no meio");
    });
    await expect(fazendasOperacao.atualizar(sessao(1), 10, { cidade: "Nao grava" })).rejects.toThrow(/falhou no meio/);
    const [row] = await banco.select({ cidade: fazendas.cidade, userId: fazendas.userId }).from(fazendas).where(eq(fazendas.id, 10));
    expect(row).toEqual({ cidade: "Nova", userId: 1 });
  });

  it("duas edições ao mesmo tempo deixam uma fazenda do titular", async () => {
    let outra: Promise<unknown> = Promise.resolve();
    definirGanchoTravaFazenda(() => {
      outra = fazendasOperacao.atualizar(sessao(2), 10, { nome: "Pelo curral" });
      return new Promise((resolver) => setTimeout(resolver, 400));
    });
    await fazendasOperacao.atualizar(sessao(1), 10, { cidade: "Simultanea" });
    await outra;
    const linhas = await banco.select().from(fazendas).where(eq(fazendas.id, 10));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.userId).toBe(1);
  });

  it("não apaga fazenda com pasto nem com concessão, e apaga a vazia", async () => {
    await pool.query("INSERT INTO pastos (id, userId, fazendaId, nome) VALUES (1, 1, 10, 'Mangueira')");
    await expect(fazendasOperacao.excluir(sessao(1), 10)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const [comPasto] = await banco.select({ id: fazendas.id }).from(fazendas).where(eq(fazendas.id, 10));
    expect(comPasto?.id).toBe(10);
    const [pasto] = await pool.query("SELECT id FROM pastos WHERE id = 1") as [Array<{ id: number }>, unknown];
    expect(pasto[0]?.id).toBe(1);

    await pool.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (5, 20, 1)");
    await expect(fazendasOperacao.excluir(sessao(1), 20)).rejects.toThrow(MSG_FAZENDA_HISTORICO);
    const [concessao] = await pool.query("SELECT fazendaId FROM usuario_fazendas WHERE fazendaId = 20") as [Array<{ fazendaId: number }>, unknown];
    expect(concessao[0]?.fazendaId).toBe(20);
    const [sul] = await banco.select({ id: fazendas.id }).from(fazendas).where(eq(fazendas.id, 20));
    expect(sul?.id).toBe(20);

    const vazia = await fazendasOperacao.criar(sessao(1), { nome: "Vazia" });
    const conferencia = await fazendasOperacao.conferirExclusao(sessao(1), vazia.id);
    expect(conferencia.canDelete).toBe(true);
    await fazendasOperacao.excluir(sessao(1), vazia.id);
    const [ainda] = await banco.select({ id: fazendas.id }).from(fazendas).where(eq(fazendas.id, vazia.id));
    expect(ainda).toBeUndefined();
  });

  it("não apaga a fazenda se um pasto entra no meio, nem a fazenda de outra conta", async () => {
    const criada = await fazendasOperacao.criar(sessao(1), { nome: "No meio" });
    let gravou: Promise<unknown> = Promise.resolve();
    definirGanchoTravaFazenda(async () => {
      gravou = pool.query(
        "INSERT INTO pastos (id, userId, fazendaId, nome) VALUES (77, 1, ?, 'Chegou')",
        [criada.id],
      );
      await gravou;
    });
    await expect(fazendasOperacao.excluir(sessao(1), criada.id)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await gravou;
    const [fazenda] = await pool.query("SELECT id FROM fazendas WHERE id = ?", [criada.id]) as [Array<{ id: number }>, unknown];
    const [pastos] = await pool.query("SELECT id FROM pastos WHERE fazendaId = ?", [criada.id]) as [Array<{ id: number }>, unknown];
    expect(fazenda[0]?.id).toBe(criada.id);
    expect(pastos.length).toBeGreaterThan(0);
    await expect(fazendasOperacao.excluir(sessao(5), 10)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(fazendasOperacao.excluir(sessao(1), 30)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [alheia] = await pool.query("SELECT id FROM fazendas WHERE id = 30") as [Array<{ id: number }>, unknown];
    expect(alheia[0]?.id).toBe(30);
  });

  it("sem o banco a fazenda não cai no arquivo", async () => {
    const fechado = mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada", database: "fd_teste_nao_conectar",
      connectionLimit: 1,
    });
    definirBancoFazendas(drizzle(fechado, { schema, mode: "default" }));
    await expect(fazendasOperacao.listar(sessao(1))).rejects.toMatchObject({
      code: "PRECONDITION_FAILED", message: MSG_FAZENDA_SEM_MYSQL,
    });
    await fechado.end();
  });
});
