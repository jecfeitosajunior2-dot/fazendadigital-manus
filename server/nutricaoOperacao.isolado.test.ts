import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { env } from "./_core/env";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { definirBancoBatidasAntigas, listarBatidasAntigas, recusarCadastroBatidaAntiga, recusarExclusaoBatidaAntiga } from "./nutricaoBatidasAntigas";
import { definirBancoNutricaoBatidas, nutricaoBatidasService } from "./nutricaoBatidas";
import { definirBancoNutricaoFornecimentos, nutricaoFornecimentosService } from "./nutricaoFornecimentos";
import {
  MSG_NUTRICAO_FAZENDA,
  MSG_NUTRICAO_SEM_MYSQL,
  MSG_NUTRICAO_SEM_PERMISSAO,
  type SessaoNutricao,
} from "./nutricaoOperacaoAutorizada";
import {
  MSG_BATIDA_ANTIGA_CADASTRO,
  MSG_BATIDA_ANTIGA_EXCLUSAO,
  MSG_BATIDA_ANTIGA_LISTA,
  MSG_NUTRICAO_CHAVE_DIFERENTE,
  MSG_NUTRICAO_SEM_IDEMPOTENCIA,
} from "../shared/nutricaoIdempotencia";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bg-nutri";
const PORTA = 3384;
const SENHA = "isolado-h4bg";
const BANCO = "fd_h4bg";
const HOJE = "2026-11-21";

const ESQUEMA = `
CREATE TABLE users (
  id int NOT NULL, openId varchar(255) NOT NULL, name varchar(255) NOT NULL,
  email varchar(255) NULL, role enum('admin','user') NOT NULL DEFAULT 'user',
  papel enum('principal','secundario','comum') NOT NULL,
  titularUserId int NULL, situacao enum('convidado','ativo','inativo') NOT NULL,
  sessionVersion int NOT NULL DEFAULT 0, PRIMARY KEY (id), UNIQUE KEY openId (openId)
) ENGINE=InnoDB;
CREATE TABLE fazendas (
  id int NOT NULL, userId int NOT NULL, nome varchar(200) NOT NULL, PRIMARY KEY (id)
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
CREATE TABLE lotes (
  id int NOT NULL, userId int NOT NULL, nome varchar(100) NOT NULL,
  sigla varchar(20) NULL, dataCriacao date NULL, descricao text NULL,
  localizacao varchar(200) NULL, capacidade int NULL, fazendaId int NULL,
  pastoAtualId int NULL, dataEntradaPasto date NULL, ativo tinyint(1) NULL DEFAULT 1,
  createdAt timestamp NULL, updatedAt timestamp NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, sexo enum('macho','femea') NOT NULL,
  status enum('ativo','vendido','morto','transferido') NOT NULL DEFAULT 'ativo',
  loteId int NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE estoque (
  id int NOT NULL, produto_id int NULL, fazenda_id int NULL, nome varchar(100) NOT NULL,
  categoria varchar(50) NULL, subcategoria varchar(80) NULL, unidade varchar(20) NULL,
  quantidade decimal(10,2) NULL, quantidade_minima decimal(10,2) NULL,
  quantidade_maxima decimal(10,2) NULL, fabricante varchar(100) NULL,
  identificador_unico varchar(100) NULL, produzido_na_fazenda tinyint(1) NULL,
  controlar_saldo tinyint(1) NULL, monitorar_estoque tinyint(1) NULL,
  situacao varchar(20) NULL, embalagens text NULL, possui_carencia tinyint(1) NULL,
  carencia_abate_dias int NULL, carencia_abate_unidade varchar(8) NULL,
  carencia_leite_dias int NULL, observacoes_carencia text NULL,
  valor_unitario decimal(18,6) NULL, valor_total_estoque decimal(14,2) NULL,
  capital_inicializado_em timestamp NULL, localizacao varchar(200) NULL,
  observacoes text NULL, created_at timestamp NULL, updated_at timestamp NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE estoque_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, grupo_id varchar(40) NULL, operacao_id int NULL,
  estoque_id int NOT NULL, abastecimento_id int NULL, nutricao_fornecimento_id int NULL,
  nutricao_batida_id int NULL, fazenda_id int NULL, user_id int NULL,
  registrado_por varchar(150) NULL, tipo varchar(40) NULL, data_movimentacao date NOT NULL,
  quantidade decimal(12,2) NOT NULL, data_validade date NULL, destino varchar(150) NULL,
  manejo varchar(150) NULL, nota_fiscal varchar(60) NULL, frete decimal(12,2) NULL,
  fornecedor varchar(150) NULL, valor decimal(12,2) NULL,
  valor_estoque_movimentado decimal(14,2) NULL, observacoes text NULL,
  unidade_estoque_snapshot varchar(20) NULL, conteudo_por_unidade_snapshot decimal(12,4) NULL,
  unidade_conteudo_snapshot varchar(20) NULL, quantidade_fisica_snapshot decimal(12,3) NULL,
  unidade_fisica_snapshot varchar(20) NULL, status varchar(20) NULL,
  original_grupo_id varchar(40) NULL, motivo_estorno varchar(255) NULL,
  created_at timestamp NULL, updated_at timestamp NULL, updated_by_user_id int NULL,
  updated_by_nome varchar(150) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE nutricao_dietas (
  id int NOT NULL, userId int NOT NULL, fazendaId int NOT NULL, nome varchar(100) NOT NULL,
  descricao text NULL, tipo varchar(40) NOT NULL, categoriaAnimal varchar(50) NULL,
  objetivo varchar(40) NULL, formaUso varchar(30) NULL, status varchar(20) NOT NULL,
  dataInicio date NULL, dataFim date NULL, baseQuantidade decimal(12,3) NOT NULL,
  baseUnidade varchar(8) NOT NULL, createdAt timestamp NULL, updatedAt timestamp NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE nutricao_dieta_ingredientes (
  id int NOT NULL, dietaId int NOT NULL, produtoId int NOT NULL,
  quantidade decimal(12,3) NOT NULL, ordem int NOT NULL, createdAt timestamp NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE nutricao_fornecimentos (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  loteId int NOT NULL, planejamentoId int NULL, cochoId int NULL,
  cochoNomeSnapshot varchar(160) NULL, tipoOrigem varchar(20) NOT NULL,
  produtoId int NULL, dietaId int NULL, origemOperacional varchar(20) NOT NULL,
  batidaId int NULL, data date NOT NULL, hora varchar(5) NULL,
  quantidadeFornecidaKg decimal(12,3) NOT NULL, populacaoSnapshot int NOT NULL,
  origemNomeSnapshot varchar(120) NULL, custoUnitarioSnapshot decimal(12,4) NULL,
  custoTotalSnapshot decimal(12,2) NULL, custoPorKgSnapshot decimal(12,4) NULL,
  custoCompleto tinyint(1) NOT NULL, planejamentoMetaSnapshot varchar(80) NULL,
  planejamentoModalidadeSnapshot varchar(20) NULL,
  planejamentoNecessidadeKgSnapshot decimal(12,3) NULL, observacoes text NULL,
  status varchar(20) NOT NULL, motivoEstorno varchar(255) NULL,
  observacaoEstorno text NULL, estornadoPorUserId int NULL, estornadoEm timestamp NULL,
  createdAt timestamp NULL, updatedAt timestamp NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE nutricao_batidas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  dietaId int NOT NULL, data date NOT NULL, hora varchar(5) NULL,
  quantidadePreparadaKg decimal(12,3) NOT NULL, dietaNomeSnapshot varchar(120) NULL,
  custoTotalSnapshot decimal(12,2) NULL, custoKgSnapshot decimal(12,4) NULL,
  custoCompleto tinyint(1) NOT NULL, observacoes text NULL, status varchar(20) NOT NULL,
  motivoEstorno varchar(255) NULL, observacaoEstorno text NULL,
  estornadoPorUserId int NULL, estornadoEm timestamp NULL,
  createdAt timestamp NULL, updatedAt timestamp NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE nutricao_batida_ingredientes (
  id int NOT NULL AUTO_INCREMENT, batidaId int NOT NULL, produtoId int NOT NULL,
  produtoNomeSnapshot varchar(120) NULL, proporcaoSnapshot decimal(8,4) NULL,
  quantidadeKg decimal(12,3) NOT NULL, quantidadeUnidade decimal(12,3) NOT NULL,
  unidadeSnapshot varchar(20) NULL, custoUnitarioSnapshot decimal(12,4) NULL,
  custoTotalSnapshot decimal(12,2) NULL, custoConhecido tinyint(1) NOT NULL,
  ordem int NOT NULL, createdAt timestamp NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE batidas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, cochoId int NULL, dietaId int NULL,
  data date NOT NULL, quantidade decimal(8,2) NULL, responsavel varchar(200) NULL,
  observacoes text NULL, createdAt timestamp NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

type Banco = ReturnType<typeof drizzle<typeof schema>>;

function sessao(
  executorId: number,
  permissaoId: SessaoNutricao["permissaoId"],
  versao: number | null = 1,
): SessaoNutricao {
  return { executorId, sessionVersionDaSessao: versao, permissaoId };
}

function pedidoProduto(qtd = 10, extra: Record<string, unknown> = {}) {
  return {
    fazendaId: 10,
    loteId: 1,
    tipoOrigem: "produto" as const,
    produtoId: 101,
    data: "2026-11-01",
    quantidadeFornecidaKg: qtd,
    chaveOperacao: `forn-${randomUUID()}`,
    ...extra,
  };
}

function pedidoBatida(qtd = 10, extra: Record<string, unknown> = {}) {
  return {
    fazendaId: 10,
    dietaId: 1,
    data: "2026-11-01",
    quantidadePreparadaKg: qtd,
    chaveOperacao: `bat-${randomUUID()}`,
    ...extra,
  };
}

function pedidoDaBatida(batidaId: number, qtd = 10, extra: Record<string, unknown> = {}) {
  return {
    fazendaId: 10,
    loteId: 1,
    tipoOrigem: "dieta" as const,
    dietaId: 1,
    origemOperacional: "batida" as const,
    batidaId,
    data: "2026-11-01",
    quantidadeFornecidaKg: qtd,
    chaveOperacao: `forn-${randomUUID()}`,
    ...extra,
  };
}

function sentencasProposta() {
  return readFileSync(new URL("../drizzle/propostas/0073_nutricao_idempotencia.sql", import.meta.url), "utf8")
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((parte) => parte.trim())
    .filter(Boolean);
}

describe.sequential("nutrição crítica no mysql descartável", () => {
  let pool: mysql.Pool;
  let banco: Banco;

  async function saldo(id: number) {
    const [linhas] = await pool.query("SELECT quantidade FROM estoque WHERE id = ?", [id]);
    return Number((linhas as Array<{ quantidade: string }>)[0]?.quantidade);
  }

  async function contar(tabela: string) {
    const [linhas] = await pool.query(`SELECT COUNT(*) AS n FROM ${tabela}`);
    return Number((linhas as Array<{ n: number }>)[0]?.n);
  }

  async function limpar() {
    await pool.query("DELETE FROM batidas");
    await pool.query("DELETE FROM estoque_movimentacoes");
    await pool.query("DELETE FROM nutricao_fornecimentos");
    await pool.query("DELETE FROM nutricao_batida_ingredientes");
    await pool.query("DELETE FROM nutricao_batidas");
    await pool.query("UPDATE estoque SET quantidade = 100, valor_unitario = 5 WHERE id = 1");
    await pool.query("UPDATE estoque SET quantidade = 40, valor_unitario = 8 WHERE id = 2");
    await pool.query("UPDATE estoque SET quantidade = 50, valor_unitario = 9 WHERE id = 3");
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'nutricao.confirmar', 1),
        (2, 1, 'nutricao.estornar', 1),
        (4, 1, 'nutricao.visualizar', 1),
        (5, 1, 'nutricao.confirmar', 1),
        (5, 1, 'nutricao.estornar', 1)
    `);
    await pool.query("DELETE FROM usuario_fazendas");
    await pool.query(`
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
        (2, 10, 1), (2, 20, 1), (4, 10, 1), (5, 10, 1), (6, 10, 1)
    `);
  }

  async function restaurarIdempotencia() {
    for (const tabela of ["nutricao_fornecimentos", "nutricao_batidas"]) {
      const indice = tabela === "nutricao_fornecimentos"
        ? "nutricao_fornecimentos_user_chave_uq"
        : "nutricao_batidas_user_chave_uq";
      await pool.query(`ALTER TABLE ${tabela} DROP INDEX ${indice}`).catch(() => undefined);
      await pool.query(`ALTER TABLE ${tabela} DROP COLUMN chaveOperacao`).catch(() => undefined);
      await pool.query(`ALTER TABLE ${tabela} DROP COLUMN conteudoHash`).catch(() => undefined);
    }
    for (const sentenca of sentencasProposta()) await pool.query(sentenca);
  }

  async function segurarEstoque(id: number, depois: () => Promise<void>) {
    const trava = await mysql.createConnection({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
    });
    await trava.beginTransaction();
    await trava.query("SELECT id FROM estoque WHERE id = ? FOR UPDATE", [id]);
    const andamento = depois();
    await new Promise((resolver) => setTimeout(resolver, 250));
    await trava.rollback();
    await trava.end();
    return andamento;
  }

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
        await conn.query("SELECT 1 AS ok");
        await conn.query(ESQUEMA);
        for (const sentenca of sentencasProposta()) await conn.query(sentenca);
        await conn.query(`
          INSERT INTO users (id, openId, name, role, papel, titularUserId, situacao, sessionVersion) VALUES
            (1, 'p1', 'Principal', 'user', 'principal', 1, 'ativo', 1),
            (2, 'f2', 'Ambos', 'user', 'comum', 1, 'ativo', 1),
            (3, 'p3', 'Outro', 'user', 'principal', 3, 'ativo', 1),
            (4, 'f4', 'Olho', 'user', 'comum', 1, 'ativo', 1),
            (5, 'f5', 'Uma', 'user', 'comum', 1, 'ativo', 1),
            (6, 'f6', 'Nada', 'user', 'comum', 1, 'ativo', 1);
          INSERT INTO fazendas (id, userId, nome) VALUES
            (10, 1, 'Norte'), (20, 1, 'Sul'), (30, 3, 'Alheia');
          INSERT INTO lotes (id, userId, nome, fazendaId, ativo) VALUES
            (1, 1, 'L10', 10, 1), (2, 1, 'L20', 20, 1), (3, 3, 'L30', 30, 1);
          INSERT INTO animais (id, userId, sexo, status, loteId) VALUES
            (1, 1, 'macho', 'ativo', 1), (2, 1, 'femea', 'ativo', 2), (3, 3, 'macho', 'ativo', 3);
          INSERT INTO estoque (id, produto_id, fazenda_id, nome, unidade, quantidade, controlar_saldo, situacao, valor_unitario) VALUES
            (1, 101, 10, 'Milho', 'kg', 100, 1, 'ativo', 5),
            (2, 201, 20, 'Sal', 'kg', 40, 1, 'ativo', 8),
            (3, 301, 30, 'Alheio', 'kg', 50, 1, 'ativo', 9);
          INSERT INTO nutricao_dietas
            (id, userId, fazendaId, nome, tipo, formaUso, status, baseQuantidade, baseUnidade) VALUES
            (1, 1, 10, 'Mistura', 'racao', 'preparo_opcional', 'ativa', 100, 'kg');
          INSERT INTO nutricao_dieta_ingredientes (id, dietaId, produtoId, quantidade, ordem) VALUES
            (1, 1, 101, 100, 0);
        `);
        await conn.end();
        pool = mysql.createPool({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
          connectionLimit: 8,
        });
        banco = drizzle(pool, { schema, mode: "default" });
        definirBancoNutricaoFornecimentos(banco);
        definirBancoNutricaoBatidas(banco);
        definirBancoBatidasAntigas(banco);
        return;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    throw new Error(ultimo || "MySQL descartável não subiu.");
  }, 120_000);

  afterAll(async () => {
    definirBancoNutricaoFornecimentos(null);
    definirBancoNutricaoBatidas(null);
    definirBancoBatidasAntigas(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  it("administrador principal confirma o fornecimento no nome do titular", async () => {
    await limpar();
    const r = await nutricaoFornecimentosService.confirmar(
      1, "Principal", pedidoProduto(10), HOJE, sessao(1, "nutricao.confirmar"),
    );
    expect(await saldo(1)).toBe(90);
    const [linhas] = await pool.query(
      "SELECT userId, custoTotalSnapshot, custoPorKgSnapshot, status FROM nutricao_fornecimentos WHERE id = ?",
      [r.id],
    );
    const row = (linhas as Array<{ userId: number; custoTotalSnapshot: string; custoPorKgSnapshot: string; status: string }>)[0];
    expect(row.userId).toBe(1);
    expect(Number(row.custoTotalSnapshot)).toBe(50);
    expect(Number(row.custoPorKgSnapshot)).toBe(5);
    expect(row.status).toBe("confirmado");
    const [movs] = await pool.query(
      "SELECT user_id, quantidade, status FROM estoque_movimentacoes WHERE nutricao_fornecimento_id = ?",
      [r.id],
    );
    const mov = (movs as Array<{ user_id: number; quantidade: string; status: string }>)[0];
    expect(mov.user_id).toBe(1);
    expect(Number(mov.quantidade)).toBe(-10);
    expect(mov.status).toBe("ativa");
  });

  it("funcionário autorizado grava o fornecimento no titular", async () => {
    await limpar();
    const r = await nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedidoProduto(10), HOJE, sessao(2, "nutricao.confirmar"),
    );
    expect(await saldo(1)).toBe(90);
    const [linhas] = await pool.query("SELECT userId FROM nutricao_fornecimentos WHERE id = ?", [r.id]);
    expect((linhas as Array<{ userId: number }>)[0].userId).toBe(1);
    expect(await saldo(2)).toBe(40);
    expect(await saldo(3)).toBe(50);
  });

  it("funcionário sem permissão não baixa o saldo", async () => {
    await limpar();
    await expect(nutricaoFornecimentosService.confirmar(
      6, "Nada", pedidoProduto(10), HOJE, sessao(6, "nutricao.confirmar"),
    )).rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_SEM_PERMISSAO });
    expect(await saldo(1)).toBe(100);
    expect(await contar("nutricao_fornecimentos")).toBe(0);
  });

  it("funcionário só de olhar não confirma", async () => {
    await limpar();
    await expect(nutricaoFornecimentosService.confirmar(
      4, "Olho", pedidoProduto(10), HOJE, sessao(4, "nutricao.confirmar"),
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await saldo(1)).toBe(100);
  });

  it("fazenda concedida ao funcionário aceita o lançamento", async () => {
    await limpar();
    const r = await nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedidoProduto(5, { fazendaId: 20, loteId: 2, produtoId: 201 }), HOJE, sessao(2, "nutricao.confirmar"),
    );
    expect(r.id).toBeGreaterThan(0);
    expect(await saldo(2)).toBe(35);
    expect(await saldo(1)).toBe(100);
  });

  it("fazenda não concedida não consome o insumo", async () => {
    await limpar();
    await expect(nutricaoFornecimentosService.confirmar(
      5, "Uma", pedidoProduto(5, { fazendaId: 20, loteId: 2, produtoId: 201 }), HOJE, sessao(5, "nutricao.confirmar"),
    )).rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_FAZENDA });
    expect(await saldo(2)).toBe(40);
  });

  it("fazenda de outro titular não é encontrada", async () => {
    await limpar();
    await expect(nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedidoProduto(5, { fazendaId: 30, loteId: 3, produtoId: 301 }), HOJE, sessao(2, "nutricao.confirmar"),
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await saldo(3)).toBe(50);
    expect(await contar("nutricao_fornecimentos")).toBe(0);
  });

  it("lote de outra fazenda não é aceito pelo identificador", async () => {
    await limpar();
    await expect(nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedidoProduto(5, { loteId: 2 }), HOJE, sessao(2, "nutricao.confirmar"),
    )).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await saldo(1)).toBe(100);
    expect(await saldo(2)).toBe(40);
  });

  it("produto de outra fazenda não entra na baixa", async () => {
    await limpar();
    await expect(nutricaoFornecimentosService.confirmar(
      1, "Principal", pedidoProduto(5, { produtoId: 201 }), HOJE, sessao(1, "nutricao.confirmar"),
    )).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await saldo(1)).toBe(100);
    expect(await saldo(2)).toBe(40);
  });

  it("saldo insuficiente não grava fornecimento", async () => {
    await limpar();
    await pool.query("UPDATE estoque SET quantidade = 4 WHERE id = 1");
    await expect(nutricaoFornecimentosService.confirmar(
      1, "Principal", pedidoProduto(10), HOJE, sessao(1, "nutricao.confirmar"),
    )).rejects.toBeTruthy();
    expect(await saldo(1)).toBe(4);
    expect(await contar("nutricao_fornecimentos")).toBe(0);
  });

  it("batida confirmada baixa o ingrediente e congela o custo", async () => {
    await limpar();
    const r = await nutricaoBatidasService.confirmar(
      1, "Principal", pedidoBatida(20), HOJE, sessao(1, "nutricao.confirmar"),
    );
    expect(await saldo(1)).toBe(80);
    const [linhas] = await pool.query(
      "SELECT userId, custoTotalSnapshot, custoKgSnapshot FROM nutricao_batidas WHERE id = ?",
      [r.id],
    );
    const row = (linhas as Array<{ userId: number; custoTotalSnapshot: string; custoKgSnapshot: string }>)[0];
    expect(row.userId).toBe(1);
    expect(Number(row.custoTotalSnapshot)).toBe(100);
    expect(Number(row.custoKgSnapshot)).toBe(5);
    const [ings] = await pool.query("SELECT quantidade FROM nutricao_dieta_ingredientes WHERE id = 1");
    expect(Number((ings as Array<{ quantidade: string }>)[0].quantidade)).toBe(100);
  });

  it("fornecimento da batida não baixa o estoque de novo", async () => {
    await limpar();
    const batida = await nutricaoBatidasService.confirmar(
      1, "Principal", pedidoBatida(20), HOJE, sessao(1, "nutricao.confirmar"),
    );
    expect(await saldo(1)).toBe(80);
    await nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedidoDaBatida(batida.id, 10), HOJE, sessao(2, "nutricao.confirmar"),
    );
    expect(await saldo(1)).toBe(80);
    expect(await contar("estoque_movimentacoes")).toBe(1);
  });

  it("estorno devolve a quantidade e mantém o histórico", async () => {
    await limpar();
    const r = await nutricaoFornecimentosService.confirmar(
      1, "Principal", pedidoProduto(10), HOJE, sessao(1, "nutricao.confirmar"),
    );
    await pool.query("UPDATE estoque SET valor_unitario = 99 WHERE id = 1");
    await nutricaoFornecimentosService.estornar(
      2, "Ambos", { id: r.id, motivo: "erro de trato" }, HOJE, sessao(2, "nutricao.estornar"),
    );
    expect(await saldo(1)).toBe(100);
    const [linhas] = await pool.query(
      "SELECT status, estornadoPorUserId, custoTotalSnapshot FROM nutricao_fornecimentos WHERE id = ?",
      [r.id],
    );
    const row = (linhas as Array<{ status: string; estornadoPorUserId: number; custoTotalSnapshot: string }>)[0];
    expect(row.status).toBe("estornado");
    expect(row.estornadoPorUserId).toBe(2);
    expect(Number(row.custoTotalSnapshot)).toBe(50);
    const [movs] = await pool.query(
      "SELECT status, quantidade FROM estoque_movimentacoes WHERE nutricao_fornecimento_id = ? ORDER BY id",
      [r.id],
    );
    const lista = movs as Array<{ status: string; quantidade: string }>;
    expect(lista.map((m) => m.status)).toEqual(["estornada", "estorno"]);
    expect(Number(lista[1].quantidade)).toBe(10);
  });

  it("estorno da batida devolve o ingrediente", async () => {
    await limpar();
    const r = await nutricaoBatidasService.confirmar(
      2, "Ambos", pedidoBatida(15), HOJE, sessao(2, "nutricao.confirmar"),
    );
    expect(await saldo(1)).toBe(85);
    await nutricaoBatidasService.estornar(
      2, "Ambos", { id: r.id, motivo: "batida errada" }, HOJE, sessao(2, "nutricao.estornar"),
    );
    expect(await saldo(1)).toBe(100);
    const [linhas] = await pool.query("SELECT userId, estornadoPorUserId, status FROM nutricao_batidas WHERE id = ?", [r.id]);
    const row = (linhas as Array<{ userId: number; estornadoPorUserId: number; status: string }>)[0];
    expect(row.userId).toBe(1);
    expect(row.estornadoPorUserId).toBe(2);
    expect(row.status).toBe("estornado");
  });

  it("dois fornecimentos do mesmo produto não passam de cem quilos", async () => {
    await limpar();
    const corrida = await segurarEstoque(1, () => Promise.allSettled([
      nutricaoFornecimentosService.confirmar(1, "Principal", pedidoProduto(60), HOJE, sessao(1, "nutricao.confirmar")),
      nutricaoFornecimentosService.confirmar(2, "Ambos", pedidoProduto(60), HOJE, sessao(2, "nutricao.confirmar")),
    ]));
    const ok = corrida.filter((item) => item.status === "fulfilled");
    expect(ok).toHaveLength(1);
    expect(await saldo(1)).toBe(40);
    expect(await contar("nutricao_fornecimentos")).toBe(1);
  });

  it("duas batidas do mesmo ingrediente não furam o saldo", async () => {
    await limpar();
    const corrida = await segurarEstoque(1, () => Promise.allSettled([
      nutricaoBatidasService.confirmar(1, "Principal", pedidoBatida(60), HOJE, sessao(1, "nutricao.confirmar")),
      nutricaoBatidasService.confirmar(2, "Ambos", pedidoBatida(60), HOJE, sessao(2, "nutricao.confirmar")),
    ]));
    expect(corrida.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(await saldo(1)).toBe(40);
    expect(await contar("nutricao_batidas")).toBe(1);
  });

  it("batida e fornecimento disputam o mesmo insumo", async () => {
    await limpar();
    const corrida = await segurarEstoque(1, () => Promise.allSettled([
      nutricaoBatidasService.confirmar(1, "Principal", pedidoBatida(60), HOJE, sessao(1, "nutricao.confirmar")),
      nutricaoFornecimentosService.confirmar(2, "Ambos", pedidoProduto(60), HOJE, sessao(2, "nutricao.confirmar")),
    ]));
    expect(corrida.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(await saldo(1)).toBe(40);
  });

  it("ajuste de estoque no meio do fornecimento desfaz o lançamento", async () => {
    await limpar();
    const trava = await mysql.createConnection({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
    });
    await trava.beginTransaction();
    await trava.query("SELECT id FROM estoque WHERE id = 1 FOR UPDATE");
    const andamento = nutricaoFornecimentosService.confirmar(
      1, "Principal", pedidoProduto(10), HOJE, sessao(1, "nutricao.confirmar"),
    );
    await new Promise((resolver) => setTimeout(resolver, 250));
    await trava.query("UPDATE estoque SET quantidade = 3 WHERE id = 1");
    await trava.commit();
    await trava.end();
    await expect(andamento).rejects.toBeTruthy();
    expect(await saldo(1)).toBe(3);
    expect(await contar("nutricao_fornecimentos")).toBe(0);
    expect(await contar("estoque_movimentacoes")).toBe(0);
  });

  it("dois estornos da mesma operação creditam uma vez", async () => {
    await limpar();
    const r = await nutricaoFornecimentosService.confirmar(
      1, "Principal", pedidoProduto(10), HOJE, sessao(1, "nutricao.confirmar"),
    );
    const trava = await mysql.createConnection({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
    });
    await trava.beginTransaction();
    await trava.query("SELECT id FROM nutricao_fornecimentos WHERE id = ? FOR UPDATE", [r.id]);
    const corrida = Promise.allSettled([
      nutricaoFornecimentosService.estornar(1, "Principal", { id: r.id, motivo: "um" }, HOJE, sessao(1, "nutricao.estornar")),
      nutricaoFornecimentosService.estornar(2, "Ambos", { id: r.id, motivo: "dois" }, HOJE, sessao(2, "nutricao.estornar")),
    ]);
    await new Promise((resolver) => setTimeout(resolver, 250));
    await trava.rollback();
    await trava.end();
    const resultados = await corrida;
    expect(resultados.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(await saldo(1)).toBe(100);
    expect(await contar("estoque_movimentacoes")).toBe(2);
  });

  it("duas chaves diferentes do mesmo produto continuam sendo duas operações", async () => {
    await limpar();
    await nutricaoFornecimentosService.confirmar(
      1, "Principal", pedidoProduto(10), HOJE, sessao(1, "nutricao.confirmar"),
    );
    await nutricaoFornecimentosService.confirmar(
      1, "Principal", pedidoProduto(10), HOJE, sessao(1, "nutricao.confirmar"),
    );
    expect(await saldo(1)).toBe(80);
    expect(await contar("nutricao_fornecimentos")).toBe(2);
  });

  it("permissão revogada no meio impede a baixa", async () => {
    await limpar();
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2");
    await expect(nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedidoProduto(10), HOJE, sessao(2, "nutricao.confirmar"),
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await saldo(1)).toBe(100);
  });

  it("fazenda revogada no meio impede a baixa", async () => {
    await limpar();
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 10");
    await expect(nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedidoProduto(10), HOJE, sessao(2, "nutricao.confirmar"),
    )).rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_FAZENDA });
    expect(await saldo(1)).toBe(100);
  });

  it("sessão antiga é recusada", async () => {
    await limpar();
    await expect(nutricaoFornecimentosService.confirmar(
      1, "Principal", pedidoProduto(10), HOJE, sessao(1, "nutricao.confirmar", 9),
    )).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await saldo(1)).toBe(100);
  });

  it("deadlock entre dois produtos desfaz os dois lados", async () => {
    await limpar();
    let avisarUm: () => void = () => undefined;
    let avisarDois: () => void = () => undefined;
    const primeiro = new Promise<void>((resolver) => { avisarUm = resolver; });
    const segundo = new Promise<void>((resolver) => { avisarDois = resolver; });
    let soltar: () => void = () => undefined;
    const gate = new Promise<void>((resolver) => { soltar = resolver; });
    async function travar(inicio: number, depois: number, avisar: () => void) {
      const conn = await mysql.createConnection({
        host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
      });
      try {
        await conn.query("SET SESSION innodb_lock_wait_timeout = 5");
        await conn.beginTransaction();
        await conn.query("SELECT id FROM estoque WHERE id = ? FOR UPDATE", [inicio]);
        avisar();
        await gate;
        await conn.query("SELECT id FROM estoque WHERE id = ? FOR UPDATE", [depois]);
        await new Promise((resolver) => setTimeout(resolver, 200));
        await conn.rollback();
      } catch (erro) {
        await conn.rollback().catch(() => undefined);
        throw erro;
      } finally {
        await conn.end();
      }
    }
    const corrida = Promise.allSettled([
      travar(1, 2, avisarUm),
      travar(2, 1, avisarDois),
    ]);
    await primeiro;
    await segundo;
    soltar();
    const resultados = await corrida;
    expect(resultados.some((item) => item.status === "rejected")).toBe(true);
    expect(await saldo(1)).toBe(100);
    expect(await saldo(2)).toBe(40);
    expect(await contar("nutricao_fornecimentos")).toBe(0);
  });

  it("banco indisponível não confirma no arquivo", async () => {
    await limpar();
    const fechado = drizzle(mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada", database: "fd_teste_nao_conectar",
      connectTimeout: 1000,
    }), { schema, mode: "default" });
    definirBancoNutricaoFornecimentos(fechado);
    definirBancoNutricaoBatidas(fechado);
    try {
      await expect(nutricaoFornecimentosService.confirmar(
        1, "Principal", pedidoProduto(10), HOJE, sessao(1, "nutricao.confirmar"),
      )).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: MSG_NUTRICAO_SEM_MYSQL });
    } finally {
      definirBancoNutricaoFornecimentos(banco);
      definirBancoNutricaoBatidas(banco);
    }
    expect(await saldo(1)).toBe(100);
    expect(await contar("nutricao_fornecimentos")).toBe(0);
  });

  it("a mesma chave de fornecimento não baixa o estoque de novo", async () => {
    await limpar();
    const pedido = pedidoProduto(10);
    const primeira = await nutricaoFornecimentosService.confirmar(
      1, "Principal", pedido, HOJE, sessao(1, "nutricao.confirmar"),
    );
    const segunda = await nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedido, HOJE, sessao(2, "nutricao.confirmar"),
    );
    expect(segunda.id).toBe(primeira.id);
    expect(segunda.repetido).toBe(true);
    expect(segunda.status).toBe("confirmado");
    expect(await saldo(1)).toBe(90);
    expect(await contar("nutricao_fornecimentos")).toBe(1);
    expect(await contar("estoque_movimentacoes")).toBe(1);
  });

  it("duas conexões com a mesma chave geram um só consumo", async () => {
    await limpar();
    const pedido = pedidoProduto(10);
    const corrida = await segurarEstoque(1, () => Promise.allSettled([
      nutricaoFornecimentosService.confirmar(1, "Principal", pedido, HOJE, sessao(1, "nutricao.confirmar")),
      nutricaoFornecimentosService.confirmar(2, "Ambos", pedido, HOJE, sessao(2, "nutricao.confirmar")),
    ]));
    const ok = corrida.filter((item) => item.status === "fulfilled") as PromiseFulfilledResult<{ id: number }>[];
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ok.map((item) => item.value.id)).size).toBe(1);
    expect(await saldo(1)).toBe(90);
    expect(await contar("nutricao_fornecimentos")).toBe(1);
    expect(await contar("estoque_movimentacoes")).toBe(1);
  });

  it("a mesma chave com quantidade diferente é recusada", async () => {
    await limpar();
    const chave = `forn-${randomUUID()}`;
    await nutricaoFornecimentosService.confirmar(
      1, "Principal", pedidoProduto(10, { chaveOperacao: chave }), HOJE, sessao(1, "nutricao.confirmar"),
    );
    await expect(nutricaoFornecimentosService.confirmar(
      1, "Principal", pedidoProduto(12, { chaveOperacao: chave }), HOJE, sessao(1, "nutricao.confirmar"),
    )).rejects.toMatchObject({ code: "BAD_REQUEST", message: MSG_NUTRICAO_CHAVE_DIFERENTE });
    expect(await saldo(1)).toBe(90);
    expect(await contar("nutricao_fornecimentos")).toBe(1);
  });

  it("titulares diferentes podem repetir a mesma chave", async () => {
    await limpar();
    const chave = `forn-${randomUUID()}`;
    await nutricaoFornecimentosService.confirmar(
      1, "Principal", pedidoProduto(5, { chaveOperacao: chave }), HOJE, sessao(1, "nutricao.confirmar"),
    );
    await nutricaoFornecimentosService.confirmar(
      3, "Outro", pedidoProduto(5, { fazendaId: 30, loteId: 3, produtoId: 301, chaveOperacao: chave }), HOJE, sessao(3, "nutricao.confirmar"),
    );
    expect(await saldo(1)).toBe(95);
    expect(await saldo(3)).toBe(45);
    expect(await contar("nutricao_fornecimentos")).toBe(2);
  });

  it("falha antes do commit libera a chave para uma nova tentativa", async () => {
    await limpar();
    const chave = `forn-${randomUUID()}`;
    await pool.query("UPDATE estoque SET quantidade = 4 WHERE id = 1");
    await expect(nutricaoFornecimentosService.confirmar(
      1, "Principal", pedidoProduto(10, { chaveOperacao: chave }), HOJE, sessao(1, "nutricao.confirmar"),
    )).rejects.toBeTruthy();
    expect(await contar("nutricao_fornecimentos")).toBe(0);
    await pool.query("UPDATE estoque SET quantidade = 100 WHERE id = 1");
    const r = await nutricaoFornecimentosService.confirmar(
      1, "Principal", pedidoProduto(10, { chaveOperacao: chave }), HOJE, sessao(1, "nutricao.confirmar"),
    );
    expect(r.repetido).toBe(false);
    expect(await saldo(1)).toBe(90);
    expect(await contar("nutricao_fornecimentos")).toBe(1);
  });

  it("reenviar a chave depois do estorno não recria o consumo", async () => {
    await limpar();
    const pedido = pedidoProduto(10);
    const r = await nutricaoFornecimentosService.confirmar(
      1, "Principal", pedido, HOJE, sessao(1, "nutricao.confirmar"),
    );
    await nutricaoFornecimentosService.estornar(
      2, "Ambos", { id: r.id, motivo: "trato errado" }, HOJE, sessao(2, "nutricao.estornar"),
    );
    const deNovo = await nutricaoFornecimentosService.confirmar(
      1, "Principal", pedido, HOJE, sessao(1, "nutricao.confirmar"),
    );
    expect(deNovo.id).toBe(r.id);
    expect(deNovo.repetido).toBe(true);
    expect(deNovo.status).toBe("estornado");
    expect(await saldo(1)).toBe(100);
    expect(await contar("nutricao_fornecimentos")).toBe(1);
    expect(await contar("estoque_movimentacoes")).toBe(2);
  });

  it("a mesma chave de batida não baixa o ingrediente de novo", async () => {
    await limpar();
    const pedido = pedidoBatida(20);
    const primeira = await nutricaoBatidasService.confirmar(
      1, "Principal", pedido, HOJE, sessao(1, "nutricao.confirmar"),
    );
    const segunda = await nutricaoBatidasService.confirmar(
      2, "Ambos", pedido, HOJE, sessao(2, "nutricao.confirmar"),
    );
    expect(segunda.id).toBe(primeira.id);
    expect(segunda.repetido).toBe(true);
    expect(await saldo(1)).toBe(80);
    expect(await contar("nutricao_batidas")).toBe(1);
    expect(await contar("estoque_movimentacoes")).toBe(1);
  });

  it("duas conexões com a mesma chave de batida geram um só consumo", async () => {
    await limpar();
    const pedido = pedidoBatida(20);
    const corrida = await segurarEstoque(1, () => Promise.allSettled([
      nutricaoBatidasService.confirmar(1, "Principal", pedido, HOJE, sessao(1, "nutricao.confirmar")),
      nutricaoBatidasService.confirmar(2, "Ambos", pedido, HOJE, sessao(2, "nutricao.confirmar")),
    ]));
    const ok = corrida.filter((item) => item.status === "fulfilled") as PromiseFulfilledResult<{ id: number }>[];
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ok.map((item) => item.value.id)).size).toBe(1);
    expect(await saldo(1)).toBe(80);
    expect(await contar("nutricao_batidas")).toBe(1);
  });

  it("a mesma chave de batida com quantidade diferente é recusada", async () => {
    await limpar();
    const chave = `bat-${randomUUID()}`;
    await nutricaoBatidasService.confirmar(
      1, "Principal", pedidoBatida(10, { chaveOperacao: chave }), HOJE, sessao(1, "nutricao.confirmar"),
    );
    await expect(nutricaoBatidasService.confirmar(
      1, "Principal", pedidoBatida(12, { chaveOperacao: chave }), HOJE, sessao(1, "nutricao.confirmar"),
    )).rejects.toMatchObject({ message: MSG_NUTRICAO_CHAVE_DIFERENTE });
    expect(await saldo(1)).toBe(90);
    expect(await contar("nutricao_batidas")).toBe(1);
  });

  it("duas chaves de batida parecidas continuam sendo duas operações", async () => {
    await limpar();
    await nutricaoBatidasService.confirmar(1, "Principal", pedidoBatida(10), HOJE, sessao(1, "nutricao.confirmar"));
    await nutricaoBatidasService.confirmar(1, "Principal", pedidoBatida(10), HOJE, sessao(1, "nutricao.confirmar"));
    expect(await saldo(1)).toBe(80);
    expect(await contar("nutricao_batidas")).toBe(2);
  });

  it("reenviar o fornecimento da batida não distribui duas vezes", async () => {
    await limpar();
    const batida = await nutricaoBatidasService.confirmar(
      1, "Principal", pedidoBatida(20), HOJE, sessao(1, "nutricao.confirmar"),
    );
    const pedido = pedidoDaBatida(batida.id, 10);
    const primeira = await nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedido, HOJE, sessao(2, "nutricao.confirmar"),
    );
    const segunda = await nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedido, HOJE, sessao(2, "nutricao.confirmar"),
    );
    expect(segunda.id).toBe(primeira.id);
    expect(await saldo(1)).toBe(80);
    expect(await contar("nutricao_fornecimentos")).toBe(1);
    expect(await contar("estoque_movimentacoes")).toBe(1);
  });

  it("duas distribuições da mesma batida não passam do preparado", async () => {
    await limpar();
    const batida = await nutricaoBatidasService.confirmar(
      1, "Principal", pedidoBatida(20), HOJE, sessao(1, "nutricao.confirmar"),
    );
    const trava = await mysql.createConnection({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
    });
    await trava.beginTransaction();
    await trava.query("SELECT id FROM nutricao_batidas WHERE id = ? FOR UPDATE", [batida.id]);
    const corrida = Promise.allSettled([
      nutricaoFornecimentosService.confirmar(1, "Principal", pedidoDaBatida(batida.id, 15), HOJE, sessao(1, "nutricao.confirmar")),
      nutricaoFornecimentosService.confirmar(2, "Ambos", pedidoDaBatida(batida.id, 15), HOJE, sessao(2, "nutricao.confirmar")),
    ]);
    await new Promise((resolver) => setTimeout(resolver, 250));
    await trava.rollback();
    await trava.end();
    const resultados = await corrida;
    expect(resultados.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(await contar("nutricao_fornecimentos")).toBe(1);
    expect(await saldo(1)).toBe(80);
  });

  it("saída manual no meio da confirmação desfaz o lançamento", async () => {
    await limpar();
    const trava = await mysql.createConnection({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
    });
    await trava.beginTransaction();
    await trava.query("SELECT id FROM estoque WHERE id = 1 FOR UPDATE");
    const andamento = nutricaoFornecimentosService.confirmar(
      1, "Principal", pedidoProduto(10), HOJE, sessao(1, "nutricao.confirmar"),
    );
    await new Promise((resolver) => setTimeout(resolver, 250));
    await trava.query("UPDATE estoque SET quantidade = 2 WHERE id = 1");
    await trava.commit();
    await trava.end();
    await expect(andamento).rejects.toBeTruthy();
    expect(await saldo(1)).toBe(2);
    expect(await contar("nutricao_fornecimentos")).toBe(0);
  });

  it("tratamento que trava o mesmo produto desfaz a confirmação", async () => {
    await limpar();
    const trava = await mysql.createConnection({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
    });
    await trava.beginTransaction();
    await trava.query("SELECT id FROM estoque WHERE id = 1 FOR UPDATE");
    const andamento = nutricaoBatidasService.confirmar(
      1, "Principal", pedidoBatida(10), HOJE, sessao(1, "nutricao.confirmar"),
    );
    await new Promise((resolver) => setTimeout(resolver, 250));
    await trava.query("UPDATE estoque SET quantidade = 1 WHERE id = 1");
    await trava.commit();
    await trava.end();
    await expect(andamento).rejects.toBeTruthy();
    expect(await saldo(1)).toBe(1);
    expect(await contar("nutricao_batidas")).toBe(0);
  });

  it("sem a estrutura da proposta a confirmação não baixa estoque", async () => {
    await limpar();
    await pool.query("ALTER TABLE nutricao_fornecimentos DROP INDEX nutricao_fornecimentos_user_chave_uq");
    await pool.query("ALTER TABLE nutricao_fornecimentos DROP COLUMN chaveOperacao, DROP COLUMN conteudoHash");
    try {
      await expect(nutricaoFornecimentosService.confirmar(
        1, "Principal", pedidoProduto(10), HOJE, sessao(1, "nutricao.confirmar"),
      )).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: MSG_NUTRICAO_SEM_IDEMPOTENCIA });
      expect(await saldo(1)).toBe(100);
      expect(await contar("nutricao_fornecimentos")).toBe(0);
    } finally {
      await restaurarIdempotencia();
    }
  });

  it("sem o índice único a confirmação não baixa estoque", async () => {
    await limpar();
    await pool.query("ALTER TABLE nutricao_batidas DROP INDEX nutricao_batidas_user_chave_uq");
    try {
      await expect(nutricaoBatidasService.confirmar(
        1, "Principal", pedidoBatida(10), HOJE, sessao(1, "nutricao.confirmar"),
      )).rejects.toMatchObject({ message: MSG_NUTRICAO_SEM_IDEMPOTENCIA });
      expect(await saldo(1)).toBe(100);
      expect(await contar("nutricao_batidas")).toBe(0);
    } finally {
      await restaurarIdempotencia();
    }
  });

  it("coluna incompatível impede a confirmação", async () => {
    await limpar();
    await pool.query("ALTER TABLE nutricao_fornecimentos DROP INDEX nutricao_fornecimentos_user_chave_uq");
    await pool.query("ALTER TABLE nutricao_fornecimentos DROP COLUMN chaveOperacao");
    await pool.query("ALTER TABLE nutricao_fornecimentos ADD COLUMN chaveOperacao int NULL");
    try {
      await expect(nutricaoFornecimentosService.confirmar(
        1, "Principal", pedidoProduto(10), HOJE, sessao(1, "nutricao.confirmar"),
      )).rejects.toMatchObject({ message: MSG_NUTRICAO_SEM_IDEMPOTENCIA });
      expect(await saldo(1)).toBe(100);
    } finally {
      await restaurarIdempotencia();
    }
  });

  it("segunda aplicação da proposta não apaga a identidade já gravada", async () => {
    await limpar();
    await expect(pool.query(sentencasProposta()[0])).rejects.toBeTruthy();
    const r = await nutricaoFornecimentosService.confirmar(
      1, "Principal", pedidoProduto(10), HOJE, sessao(1, "nutricao.confirmar"),
    );
    expect(r.repetido).toBe(false);
    expect(await saldo(1)).toBe(90);
  });

  it("cadastro e exclusão antigos de batida não gravam nem apagam", () => {
    expect(() => recusarCadastroBatidaAntiga()).toThrow(MSG_BATIDA_ANTIGA_CADASTRO);
    expect(() => recusarExclusaoBatidaAntiga()).toThrow(MSG_BATIDA_ANTIGA_EXCLUSAO);
  });

  it("consulta antiga mostra só o rascunho do titular", async () => {
    await limpar();
    await pool.query(`
      INSERT INTO batidas (userId, data, quantidade, responsavel) VALUES
        (1, '2026-11-01', 3, 'Titular'),
        (2, '2026-11-01', 9, 'Funcionario')
    `);
    const linhas = await listarBatidasAntigas({ executorId: 1, sessionVersionDaSessao: 1 });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.userId).toBe(1);
    await expect(listarBatidasAntigas({ executorId: 2, sessionVersionDaSessao: 1 }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_BATIDA_ANTIGA_LISTA });
    await expect(listarBatidasAntigas({ executorId: 1, sessionVersionDaSessao: 9 }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const [ainda] = await pool.query("SELECT userId FROM batidas ORDER BY userId");
    expect((ainda as Array<{ userId: number }>).map((row) => row.userId)).toEqual([1, 2]);
  });

  it("fornecimento antigo no nome do funcionário não muda de dono", async () => {
    await limpar();
    await pool.query(`
      INSERT INTO nutricao_fornecimentos
        (userId, fazendaId, loteId, tipoOrigem, origemOperacional, data, quantidadeFornecidaKg, populacaoSnapshot, custoCompleto, status)
      VALUES (2, 10, 1, 'produto', 'direta', '2026-11-01', 5, 1, 1, 'confirmado')
    `);
    const [linhas] = await pool.query("SELECT id FROM nutricao_fornecimentos");
    const id = Number((linhas as Array<{ id: number }>)[0]?.id);
    await expect(nutricaoFornecimentosService.estornar(
      1, "Principal", { id, motivo: "antigo" }, HOJE, sessao(1, "nutricao.estornar"),
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(nutricaoFornecimentosService.estornar(
      2, "Ambos", { id, motivo: "antigo" }, HOJE, sessao(2, "nutricao.estornar"),
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [depois] = await pool.query("SELECT userId, status FROM nutricao_fornecimentos WHERE id = ?", [id]);
    const row = (depois as Array<{ userId: number; status: string }>)[0];
    expect(row.userId).toBe(2);
    expect(row.status).toBe("confirmado");
    expect(await saldo(1)).toBe(100);
  });

  it("caminhos adaptados não usam o arquivo local", () => {
    const fornecimento = readFileSync(new URL("./nutricaoFornecimentos.ts", import.meta.url), "utf8");
    const batida = readFileSync(new URL("./nutricaoBatidas.ts", import.meta.url), "utf8");
    const rotaForn = readFileSync(new URL("./nutricaoFornecimentosRouter.ts", import.meta.url), "utf8");
    const rotaBat = readFileSync(new URL("./nutricaoBatidasRouter.ts", import.meta.url), "utf8");
    for (const src of [fornecimento, batida]) {
      expect(src).not.toContain("getLocalFazenda");
      expect(src).not.toContain("devLocalStore");
      expect(src).toContain("exigirProdutoDaFazenda");
      expect(src).toContain("pularAssert");
    }
    expect(rotaForn).toContain('permissaoId: "nutricao.confirmar"');
    expect(rotaForn).toContain('permissaoId: "nutricao.estornar"');
    expect(rotaBat).toContain("sessionVersionDaSessao: ctx.user.sessionVersion ?? null");
    const form = readFileSync(new URL("../client/src/pages/NutricaoFornecimentoFormPage.tsx", import.meta.url), "utf8");
    const detalhe = readFileSync(new URL("../client/src/pages/NutricaoFornecimentoDetalhePage.tsx", import.meta.url), "utf8");
    const formBat = readFileSync(new URL("../client/src/pages/NutricaoBatidaFormPage.tsx", import.meta.url), "utf8");
    const detalheBat = readFileSync(new URL("../client/src/pages/NutricaoBatidaDetalhePage.tsx", import.meta.url), "utf8");
    for (const tela of [form, detalhe, formBat, detalheBat]) {
      expect(tela).toContain("onError: e => toast.error(e.message)");
    }
    expect(form).toContain("nutricaoFornecimentos.confirmar");
    expect(form).toContain("decidirChaveNutricao");
    expect(form.split("chaveRef.current = null").length - 1).toBe(1);
    expect(formBat).toContain("nutricaoBatidas.confirmar");
    expect(formBat).toContain("decidirChaveNutricao");
    expect(formBat.split("chaveRef.current = null").length - 1).toBe(1);
    expect(rotaForn).toContain("chaveOperacao");
    expect(rotaBat).toContain("chaveOperacao");
    const rotas = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    expect(rotas).toContain("recusarCadastroBatidaAntiga");
    expect(rotas).toContain("recusarExclusaoBatidaAntiga");
    expect(rotas).not.toContain("db.insert(batidas)");
    expect(rotas).not.toContain("db.delete(batidas)");
    const journal = readFileSync(new URL("../drizzle/migrations/meta/_journal.json", import.meta.url), "utf8");
    expect(journal).not.toContain("0073_nutricao_idempotencia");
    expect(existsSync(new URL("../drizzle/propostas/0073_nutricao_idempotencia.sql", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../drizzle/migrations/0073_nutricao_idempotencia.sql", import.meta.url))).toBe(false);
  });
});
