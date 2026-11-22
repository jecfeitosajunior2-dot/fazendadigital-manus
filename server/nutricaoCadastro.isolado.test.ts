import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { env } from "./_core/env";
import { MSG_ESTOQUE_DISPUTADO } from "./estoqueConcorrencia";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { definirBancoNutricaoBatidas, nutricaoBatidasService } from "./nutricaoBatidas";
import { definirBancoNutricaoCochos, nutricaoCochosService } from "./nutricaoCochos";
import { definirBancoNutricaoDietas, nutricaoDietasService } from "./nutricaoDietas";
import {
  MSG_NUTRICAO_FAZENDA,
  MSG_NUTRICAO_SEM_MYSQL,
  MSG_NUTRICAO_SEM_PERMISSAO,
  type SessaoNutricao,
} from "./nutricaoOperacaoAutorizada";
import { MSG_BATIDA_DIETA } from "../shared/nutricaoBatidas";
import { MSG_COCHO_CODIGO, MSG_COCHO_FAZENDA_FIXA, MSG_COCHO_PASTO, MSG_FORN_COCHO_INATIVO, validarCochoNoFornecimento } from "../shared/nutricaoCochos";
import { MSG_DIETA_PRODUTO } from "../shared/nutricaoDietas";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bh-cadastro";
const PORTA = 3386;
const SENHA = "isolado-h4bh";
const BANCO = "fd_h4bh";
const HOJE = "2026-11-22";

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
CREATE TABLE pastos (
  id int NOT NULL, userId int NOT NULL, fazendaId int NOT NULL, nome varchar(100) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE lotes (
  id int NOT NULL, userId int NOT NULL, nome varchar(100) NOT NULL, fazendaId int NULL,
  PRIMARY KEY (id)
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
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  nome varchar(100) NOT NULL, descricao text NULL, tipo varchar(40) NOT NULL,
  categoriaAnimal varchar(50) NULL, objetivo varchar(40) NULL, formaUso varchar(30) NULL,
  status varchar(20) NOT NULL, dataInicio date NULL, dataFim date NULL,
  baseQuantidade decimal(12,3) NOT NULL, baseUnidade varchar(8) NOT NULL,
  createdAt timestamp NULL, updatedAt timestamp NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE nutricao_dieta_ingredientes (
  id int NOT NULL AUTO_INCREMENT, dietaId int NOT NULL, produtoId int NOT NULL,
  quantidade decimal(12,3) NOT NULL, ordem int NOT NULL, createdAt timestamp NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE nutricao_batidas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  dietaId int NOT NULL, data date NOT NULL, hora varchar(5) NULL,
  quantidadePreparadaKg decimal(12,3) NOT NULL, dietaNomeSnapshot varchar(120) NULL,
  custoTotalSnapshot decimal(12,2) NULL, custoKgSnapshot decimal(12,4) NULL,
  custoCompleto tinyint(1) NOT NULL, observacoes text NULL, status varchar(20) NOT NULL,
  motivoEstorno varchar(255) NULL, observacaoEstorno text NULL,
  estornadoPorUserId int NULL, estornadoEm timestamp NULL,
  createdAt timestamp NULL, updatedAt timestamp NULL,
  chaveOperacao varchar(80) NULL, conteudoHash varchar(64) NULL,
  PRIMARY KEY (id), UNIQUE KEY nutricao_batidas_user_chave_uq (userId, chaveOperacao)
) ENGINE=InnoDB;
CREATE TABLE nutricao_batida_ingredientes (
  id int NOT NULL AUTO_INCREMENT, batidaId int NOT NULL, produtoId int NOT NULL,
  produtoNomeSnapshot varchar(120) NULL, proporcaoSnapshot decimal(8,4) NULL,
  quantidadeKg decimal(12,3) NOT NULL, quantidadeUnidade decimal(12,3) NOT NULL,
  unidadeSnapshot varchar(20) NULL, custoUnitarioSnapshot decimal(12,4) NULL,
  custoTotalSnapshot decimal(12,2) NULL, custoConhecido tinyint(1) NOT NULL,
  ordem int NOT NULL, createdAt timestamp NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE nutricao_cochos (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  nome varchar(100) NOT NULL, codigo varchar(30) NULL, tipo varchar(30) NOT NULL,
  pastoId int NULL, localizacaoDescricao varchar(200) NULL,
  comprimentoMetros decimal(10,2) NULL, larguraMetros decimal(10,2) NULL,
  capacidadeKg decimal(12,3) NULL, ladosAcesso int NULL, coberto tinyint(1) NOT NULL DEFAULT 0,
  observacoes text NULL, status varchar(20) NOT NULL, createdAt timestamp NULL,
  updatedAt timestamp NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE nutricao_fornecimentos (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  loteId int NOT NULL, cochoId int NULL, cochoNomeSnapshot varchar(160) NULL,
  data date NOT NULL, hora varchar(5) NULL, origemNomeSnapshot varchar(120) NULL,
  quantidadeFornecidaKg decimal(12,3) NOT NULL, status varchar(20) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE nutricao_planejamentos (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  loteId int NOT NULL, dietaId int NULL, nome varchar(100) NULL, status varchar(20) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE nutricao_cocho_leituras (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  cochoId int NOT NULL, data date NOT NULL, cochoNomeSnapshot varchar(160) NULL,
  status varchar(20) NOT NULL, PRIMARY KEY (id)
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

function receita(extra: Record<string, unknown> = {}) {
  return {
    fazendaId: 10,
    nome: "Mistura Norte",
    tipo: "racao_concentrada" as const,
    formaUso: "preparo_opcional" as const,
    baseQuantidade: 100,
    ingredientes: [{ produtoId: 101, quantidade: 100 }],
    ...extra,
  };
}

function cocho(extra: Record<string, unknown> = {}) {
  return {
    fazendaId: 10,
    nome: "Cocho Norte",
    codigo: "CN-1",
    tipo: "racao_dieta" as const,
    pastoId: 1,
    capacidadeKg: 200,
    ...extra,
  };
}

describe.sequential("cadastro de dietas e cochos no mysql descartável", () => {
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
    await pool.query("DELETE FROM nutricao_cocho_leituras");
    await pool.query("DELETE FROM nutricao_planejamentos");
    await pool.query("DELETE FROM nutricao_fornecimentos");
    await pool.query("DELETE FROM nutricao_batida_ingredientes");
    await pool.query("DELETE FROM nutricao_batidas");
    await pool.query("DELETE FROM estoque_movimentacoes");
    await pool.query("DELETE FROM nutricao_dieta_ingredientes");
    await pool.query("DELETE FROM nutricao_dietas");
    await pool.query("DELETE FROM nutricao_cochos");
    await pool.query("UPDATE estoque SET quantidade = 100, valor_unitario = 5 WHERE id = 1");
    await pool.query("UPDATE estoque SET quantidade = 40, valor_unitario = 8 WHERE id = 2");
    await pool.query("UPDATE estoque SET quantidade = 50, valor_unitario = 4 WHERE id = 4");
    await pool.query("UPDATE users SET sessionVersion = 1");
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'nutricao.visualizar', 1),
        (2, 1, 'nutricao.criar', 1),
        (2, 1, 'nutricao.editar', 1),
        (2, 1, 'nutricao.inativar', 1),
        (2, 1, 'nutricao.confirmar', 1),
        (4, 1, 'nutricao.visualizar', 1),
        (5, 1, 'nutricao.visualizar', 1),
        (5, 1, 'nutricao.criar', 1),
        (5, 1, 'nutricao.editar', 1),
        (5, 1, 'nutricao.inativar', 1)
    `);
    await pool.query("DELETE FROM usuario_fazendas");
    await pool.query(`
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
        (2, 10, 1), (2, 20, 1), (4, 10, 1), (5, 10, 1), (6, 10, 1)
    `);
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
          INSERT INTO pastos (id, userId, fazendaId, nome) VALUES
            (1, 1, 10, 'Pasto Norte'), (2, 1, 20, 'Pasto Sul'), (3, 3, 30, 'Pasto Alheio');
          INSERT INTO lotes (id, userId, nome, fazendaId) VALUES
            (1, 1, 'Lote Norte', 10);
          INSERT INTO estoque (id, produto_id, fazenda_id, nome, unidade, quantidade, controlar_saldo, situacao, valor_unitario) VALUES
            (1, 101, 10, 'Milho', 'kg', 100, 1, 'ativo', 5),
            (2, 201, 20, 'Sal', 'kg', 40, 1, 'ativo', 8),
            (3, 301, 30, 'Alheio', 'kg', 20, 1, 'ativo', 9),
            (4, 102, 10, 'Farelo', 'kg', 50, 1, 'ativo', 4),
            (5, 103, 10, 'Velho', 'kg', 10, 1, 'inativo', 3);
        `);
        await conn.end();
        pool = mysql.createPool({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
          connectionLimit: 8,
        });
        banco = drizzle(pool, { schema, mode: "default" });
        definirBancoNutricaoDietas(banco);
        definirBancoNutricaoCochos(banco);
        definirBancoNutricaoBatidas(banco);
        return;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    throw new Error(ultimo || "MySQL descartável não subiu.");
  }, 120_000);

  afterAll(async () => {
    definirBancoNutricaoDietas(null);
    definirBancoNutricaoCochos(null);
    definirBancoNutricaoBatidas(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  it("administrador principal grava a dieta no próprio nome", async () => {
    await limpar();
    const r = await nutricaoDietasService.criar(1, receita(), sessao(1, "nutricao.criar"));
    const detalhe = await nutricaoDietasService.obter(1, r.id, sessao(1, "nutricao.visualizar"));
    expect(detalhe.userId).toBe(1);
    expect(detalhe.nome).toBe("Mistura Norte");
    expect(detalhe.tipo).toBe("racao_concentrada");
    expect(detalhe.ingredientes).toHaveLength(1);
    expect(detalhe.ingredientes[0]?.produtoId).toBe(101);
    expect(Number(detalhe.ingredientes[0]?.quantidade)).toBe(100);
    expect(detalhe.custo).toBeTruthy();
    expect(await contar("estoque_movimentacoes")).toBe(0);
    expect(await saldo(1)).toBe(100);
  });

  it("funcionário grava a dieta no titular", async () => {
    await limpar();
    const r = await nutricaoDietasService.criar(2, receita({ nome: "Do peão" }), sessao(2, "nutricao.criar"));
    const [linhas] = await pool.query("SELECT userId, fazendaId, nome FROM nutricao_dietas WHERE id = ?", [r.id]);
    const row = (linhas as Array<{ userId: number; fazendaId: number; nome: string }>)[0];
    expect(row.userId).toBe(1);
    expect(row.fazendaId).toBe(10);
    expect(row.nome).toBe("Do peão");
  });

  it("lista do funcionário mostra a dieta cadastrada pelo colega", async () => {
    await limpar();
    await nutricaoDietasService.criar(2, receita({ nome: "Do colega" }), sessao(2, "nutricao.criar"));
    const lista = await nutricaoDietasService.listar(4, { fazendaId: 10 }, sessao(4, "nutricao.visualizar"));
    expect(lista.map((item) => item.nome)).toEqual(["Do colega"]);
    expect(lista[0]?.userId).toBe(1);
  });

  it("lista vazia permanece vazia", async () => {
    await limpar();
    const lista = await nutricaoDietasService.listar(1, { fazendaId: 10 }, sessao(1, "nutricao.visualizar"));
    expect(lista).toEqual([]);
  });

  it("funcionário sem permissão não lista dieta", async () => {
    await limpar();
    await nutricaoDietasService.criar(1, receita(), sessao(1, "nutricao.criar"));
    await expect(nutricaoDietasService.listar(6, { fazendaId: 10 }, sessao(6, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_SEM_PERMISSAO });
  });

  it("fazenda não concedida não mostra a dieta", async () => {
    await limpar();
    const r = await nutricaoDietasService.criar(
      1,
      receita({ fazendaId: 20, nome: "Só do Sul", ingredientes: [{ produtoId: 201, quantidade: 100 }] }),
      sessao(1, "nutricao.criar"),
    );
    await expect(nutricaoDietasService.listar(5, { fazendaId: 20 }, sessao(5, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_FAZENDA });
    await expect(nutricaoDietasService.obter(5, r.id, sessao(5, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_FAZENDA });
    const visivel = await nutricaoDietasService.listar(5, { fazendaId: 10 }, sessao(5, "nutricao.visualizar"));
    expect(visivel.map((item) => item.nome)).not.toContain("Só do Sul");
  });

  it("outro titular não vê a dieta", async () => {
    await limpar();
    const r = await nutricaoDietasService.criar(1, receita({ nome: "Da conta 1" }), sessao(1, "nutricao.criar"));
    await expect(nutricaoDietasService.obter(3, r.id, sessao(3, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    const lista = await nutricaoDietasService.listar(3, { fazendaId: 30 }, sessao(3, "nutricao.visualizar"));
    expect(lista).toEqual([]);
  });

  it("produto de outra fazenda não entra na receita", async () => {
    await limpar();
    await expect(nutricaoDietasService.criar(
      2,
      receita({ ingredientes: [{ produtoId: 201, quantidade: 100 }] }),
      sessao(2, "nutricao.criar"),
    )).rejects.toMatchObject({ message: MSG_DIETA_PRODUTO });
    expect(await contar("nutricao_dietas")).toBe(0);
    expect(await contar("nutricao_dieta_ingredientes")).toBe(0);
    expect(await saldo(2)).toBe(40);
  });

  it("formulação lê o custo e não mexe no saldo", async () => {
    await limpar();
    const produtos = await nutricaoDietasService.listarProdutosFormulacao(2, 10, sessao(2, "nutricao.visualizar"));
    const ids = produtos.map((item) => item.produtoId).sort((a, b) => a - b);
    expect(ids).toEqual([101, 102]);
    const milho = produtos.find((item) => item.produtoId === 101);
    expect(milho?.valorUnitario).toBe(5);
    expect(milho?.unidade).toBe("kg");
    expect(await saldo(1)).toBe(100);
    expect(await contar("estoque_movimentacoes")).toBe(0);
    await expect(nutricaoDietasService.listarProdutosFormulacao(5, 20, sessao(5, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_FAZENDA });
  });

  it("edição troca só a receita viva", async () => {
    await limpar();
    const r = await nutricaoDietasService.criar(2, receita(), sessao(2, "nutricao.criar"));
    await nutricaoDietasService.editar(
      2,
      r.id,
      receita({
        nome: "Mistura nova",
        ingredientes: [
          { produtoId: 101, quantidade: 60 },
          { produtoId: 102, quantidade: 40 },
        ],
      }),
      sessao(2, "nutricao.editar"),
    );
    const [ings] = await pool.query(
      "SELECT produtoId, quantidade FROM nutricao_dieta_ingredientes WHERE dietaId = ? ORDER BY produtoId",
      [r.id],
    );
    expect(ings).toEqual([
      { produtoId: 101, quantidade: "60.000" },
      { produtoId: 102, quantidade: "40.000" },
    ]);
    expect(await saldo(1)).toBe(100);
    expect(await contar("estoque_movimentacoes")).toBe(0);
  });

  it("batida já confirmada não muda quando a dieta é editada", async () => {
    await limpar();
    const r = await nutricaoDietasService.criar(1, receita({ nome: "Para bater" }), sessao(1, "nutricao.criar"));
    const batida = await nutricaoBatidasService.confirmar(
      2, "Ambos",
      {
        fazendaId: 10,
        dietaId: r.id,
        data: "2026-11-01",
        quantidadePreparadaKg: 10,
        chaveOperacao: `bat-${randomUUID()}`,
      },
      HOJE,
      sessao(2, "nutricao.confirmar"),
    );
    const [antes] = await pool.query(
      "SELECT produtoId, quantidadeKg, custoTotalSnapshot FROM nutricao_batida_ingredientes WHERE batidaId = ?",
      [batida.id],
    );
    await nutricaoDietasService.editar(
      2,
      r.id,
      receita({
        nome: "Receita depois",
        ingredientes: [
          { produtoId: 101, quantidade: 70 },
          { produtoId: 102, quantidade: 30 },
        ],
      }),
      sessao(2, "nutricao.editar"),
    );
    const [depois] = await pool.query(
      "SELECT produtoId, quantidadeKg, custoTotalSnapshot FROM nutricao_batida_ingredientes WHERE batidaId = ?",
      [batida.id],
    );
    expect(depois).toEqual(antes);
    const [cabeca] = await pool.query("SELECT dietaNomeSnapshot, custoTotalSnapshot FROM nutricao_batidas WHERE id = ?", [batida.id]);
    expect((cabeca as Array<{ dietaNomeSnapshot: string }>)[0]?.dietaNomeSnapshot).toBe("Para bater");
    expect(await saldo(1)).toBe(90);
  });

  it("dieta inativa guarda o ingrediente e não entra em batida nova", async () => {
    await limpar();
    const r = await nutricaoDietasService.criar(2, receita(), sessao(2, "nutricao.criar"));
    const status = await nutricaoDietasService.inativar(2, r.id, sessao(2, "nutricao.inativar"));
    expect(status.status).toBe("inativa");
    expect(await contar("nutricao_dieta_ingredientes")).toBe(1);
    const historico = await nutricaoDietasService.obter(4, r.id, sessao(4, "nutricao.visualizar"));
    expect(historico.status).toBe("inativa");
    expect(historico.nome).toBe("Mistura Norte");
    await expect(nutricaoBatidasService.confirmar(
      2, "Ambos",
      {
        fazendaId: 10,
        dietaId: r.id,
        data: "2026-11-01",
        quantidadePreparadaKg: 10,
        chaveOperacao: `bat-${randomUUID()}`,
      },
      HOJE,
      sessao(2, "nutricao.confirmar"),
    )).rejects.toMatchObject({ message: MSG_BATIDA_DIETA });
    expect(await contar("nutricao_batidas")).toBe(0);
    expect(await saldo(1)).toBe(100);
  });

  it("reativar devolve a dieta ativa", async () => {
    await limpar();
    const r = await nutricaoDietasService.criar(2, receita(), sessao(2, "nutricao.criar"));
    await nutricaoDietasService.inativar(2, r.id, sessao(2, "nutricao.inativar"));
    const status = await nutricaoDietasService.reativar(2, r.id, sessao(2, "nutricao.inativar"));
    expect(status.status).toBe("ativa");
    const detalhe = await nutricaoDietasService.obter(1, r.id, sessao(1, "nutricao.visualizar"));
    expect(detalhe.status).toBe("ativa");
    expect(detalhe.ingredientes).toHaveLength(1);
  });

  it("duas edições da mesma dieta não misturam a receita", async () => {
    await limpar();
    const r = await nutricaoDietasService.criar(1, receita(), sessao(1, "nutricao.criar"));
    await Promise.all([
      nutricaoDietasService.editar(2, r.id, receita({ nome: "Só milho" }), sessao(2, "nutricao.editar")),
      nutricaoDietasService.editar(
        1,
        r.id,
        receita({
          nome: "Meia a meia",
          ingredientes: [
            { produtoId: 101, quantidade: 60 },
            { produtoId: 102, quantidade: 40 },
          ],
        }),
        sessao(1, "nutricao.editar"),
      ),
    ]);
    const [ings] = await pool.query(
      "SELECT produtoId, quantidade FROM nutricao_dieta_ingredientes WHERE dietaId = ? ORDER BY produtoId",
      [r.id],
    );
    const pares = (ings as Array<{ produtoId: number; quantidade: string }>)
      .map((item) => `${item.produtoId}:${Number(item.quantidade)}`);
    expect(["101:100", "101:60|102:40"]).toContain(pares.join("|"));
  });

  it("disputa de trava desfaz a edição da dieta", async () => {
    await limpar();
    const r = await nutricaoDietasService.criar(1, receita({ nome: "Original" }), sessao(1, "nutricao.criar"));
    const trava = await mysql.createConnection({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
    });
    await trava.beginTransaction();
    await trava.query("SELECT id FROM nutricao_dietas WHERE id = ? FOR UPDATE", [r.id]);
    const edicao = nutricaoDietasService.editar(
      2, r.id, receita({ nome: "Durante a disputa" }), sessao(2, "nutricao.editar"),
    ).then(() => "gravou").catch((erro: { code?: string; message?: string }) => erro);
    await new Promise((resolver) => setTimeout(resolver, 400));
    let vitima = "";
    try {
      await trava.query("SELECT id FROM fazendas WHERE id = 10 FOR UPDATE");
      vitima = "servico";
    } catch (erro) {
      const codigo = (erro as { errno?: number }).errno;
      vitima = codigo === 1213 ? "trava" : "outro";
    }
    await trava.rollback();
    await trava.end();
    const resultado = await edicao;
    const [linhas] = await pool.query("SELECT nome FROM nutricao_dietas WHERE id = ?", [r.id]);
    const nome = (linhas as Array<{ nome: string }>)[0]?.nome;
    if (vitima === "trava") {
      expect(resultado).toBe("gravou");
      expect(nome).toBe("Durante a disputa");
    } else {
      expect(vitima).toBe("servico");
      expect(resultado).toMatchObject({ code: "CONFLICT", message: MSG_ESTOQUE_DISPUTADO });
      expect(nome).toBe("Original");
    }
    const [ings] = await pool.query("SELECT produtoId FROM nutricao_dieta_ingredientes WHERE dietaId = ?", [r.id]);
    expect((ings as Array<{ produtoId: number }>).map((item) => item.produtoId)).toEqual([101]);
  });

  it("permissão revogada impede a edição da dieta", async () => {
    await limpar();
    const r = await nutricaoDietasService.criar(2, receita({ nome: "Firme" }), sessao(2, "nutricao.criar"));
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = 'nutricao.editar'");
    await expect(nutricaoDietasService.editar(2, r.id, receita({ nome: "Mudou" }), sessao(2, "nutricao.editar")))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_SEM_PERMISSAO });
    const [linhas] = await pool.query("SELECT nome FROM nutricao_dietas WHERE id = ?", [r.id]);
    expect((linhas as Array<{ nome: string }>)[0]?.nome).toBe("Firme");
  });

  it("fazenda revogada impede a lista", async () => {
    await limpar();
    await nutricaoDietasService.criar(1, receita({ nome: "Da Norte" }), sessao(1, "nutricao.criar"));
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 10");
    await expect(nutricaoDietasService.listar(2, { fazendaId: 10 }, sessao(2, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_FAZENDA });
  });

  it("sessão revogada impede a edição", async () => {
    await limpar();
    const r = await nutricaoDietasService.criar(2, receita({ nome: "Sessão" }), sessao(2, "nutricao.criar"));
    await pool.query("UPDATE users SET sessionVersion = 2 WHERE id = 2");
    await expect(nutricaoDietasService.editar(2, r.id, receita({ nome: "Tarde" }), sessao(2, "nutricao.editar", 1)))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const [linhas] = await pool.query("SELECT nome FROM nutricao_dietas WHERE id = ?", [r.id]);
    expect((linhas as Array<{ nome: string }>)[0]?.nome).toBe("Sessão");
  });

  it("produto inválido não grava dieta", async () => {
    await limpar();
    await expect(nutricaoDietasService.criar(
      2,
      receita({ ingredientes: [{ produtoId: 101, quantidade: 0 }] }),
      sessao(2, "nutricao.criar"),
    )).rejects.toBeTruthy();
    expect(await contar("nutricao_dietas")).toBe(0);
  });

  it("mysql indisponível não completa a lista com arquivo", async () => {
    const fechado = drizzle(mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada", database: "fd_teste_nao_conectar",
      connectTimeout: 1000,
    }), { schema, mode: "default" });
    definirBancoNutricaoDietas(fechado);
    await expect(nutricaoDietasService.listar(1, { fazendaId: 10 }, sessao(1, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: MSG_NUTRICAO_SEM_MYSQL });
    definirBancoNutricaoDietas(banco);
  });

  it("planejamento antigo continua apontando para a dieta", async () => {
    await limpar();
    const r = await nutricaoDietasService.criar(1, receita({ nome: "Do plano" }), sessao(1, "nutricao.criar"));
    await pool.query(
      "INSERT INTO nutricao_planejamentos (userId, fazendaId, loteId, dietaId, nome, status) VALUES (1, 10, 1, ?, 'Plano', 'ativo')",
      [r.id],
    );
    await nutricaoDietasService.editar(2, r.id, receita({ nome: "Plano editado" }), sessao(2, "nutricao.editar"));
    const [linhas] = await pool.query("SELECT dietaId, status, nome FROM nutricao_planejamentos");
    const plano = (linhas as Array<{ dietaId: number; status: string; nome: string }>)[0];
    expect(plano.dietaId).toBe(r.id);
    expect(plano.status).toBe("ativo");
    expect(plano.nome).toBe("Plano");
  });

  it("administrador principal grava o cocho no pasto da fazenda", async () => {
    await limpar();
    const r = await nutricaoCochosService.criar(1, cocho(), sessao(1, "nutricao.criar"));
    const detalhe = await nutricaoCochosService.obter(1, r.id, sessao(1, "nutricao.visualizar"));
    expect(detalhe.userId).toBe(1);
    expect(detalhe.nome).toBe("Cocho Norte");
    expect(detalhe.pastoId).toBe(1);
    expect(Number(detalhe.capacidadeKg)).toBe(200);
    expect(detalhe.status).toBe("ativo");
    expect(await contar("nutricao_fornecimentos")).toBe(0);
  });

  it("funcionário grava o cocho no titular", async () => {
    await limpar();
    const r = await nutricaoCochosService.criar(2, cocho({ nome: "Do peão", codigo: "CN-2" }), sessao(2, "nutricao.criar"));
    const [linhas] = await pool.query("SELECT userId, fazendaId, pastoId FROM nutricao_cochos WHERE id = ?", [r.id]);
    const row = (linhas as Array<{ userId: number; fazendaId: number; pastoId: number }>)[0];
    expect(row.userId).toBe(1);
    expect(row.fazendaId).toBe(10);
    expect(row.pastoId).toBe(1);
  });

  it("pasto de outra fazenda é recusado", async () => {
    await limpar();
    await expect(nutricaoCochosService.criar(2, cocho({ pastoId: 2 }), sessao(2, "nutricao.criar")))
      .rejects.toMatchObject({ message: MSG_COCHO_PASTO });
    expect(await contar("nutricao_cochos")).toBe(0);
  });

  it("pasto de outro titular é recusado", async () => {
    await limpar();
    await expect(nutricaoCochosService.criar(1, cocho({ pastoId: 3 }), sessao(1, "nutricao.criar")))
      .rejects.toMatchObject({ message: MSG_COCHO_PASTO });
    expect(await contar("nutricao_cochos")).toBe(0);
  });

  it("lista de pastos só traz os da fazenda concedida", async () => {
    await limpar();
    const norte = await nutricaoCochosService.listarPastos(5, 10, sessao(5, "nutricao.visualizar"));
    expect(norte.map((item) => item.nome)).toEqual(["Pasto Norte"]);
    await expect(nutricaoCochosService.listarPastos(5, 20, sessao(5, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_FAZENDA });
    const sul = await nutricaoCochosService.listarPastos(2, 20, sessao(2, "nutricao.visualizar"));
    expect(sul.map((item) => item.nome)).toEqual(["Pasto Sul"]);
  });

  it("identificador direto de outra fazenda não abre o cocho", async () => {
    await limpar();
    const r = await nutricaoCochosService.criar(
      1, cocho({ fazendaId: 20, pastoId: 2, nome: "Cocho Sul", codigo: "CS-1" }), sessao(1, "nutricao.criar"),
    );
    await expect(nutricaoCochosService.obter(5, r.id, sessao(5, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_FAZENDA });
    const lista = await nutricaoCochosService.listar(5, { fazendaId: 10 }, sessao(5, "nutricao.visualizar"));
    expect(lista.map((item) => item.nome)).not.toContain("Cocho Sul");
  });

  it("fazenda do cocho não muda na edição", async () => {
    await limpar();
    const r = await nutricaoCochosService.criar(2, cocho(), sessao(2, "nutricao.criar"));
    await expect(nutricaoCochosService.editar(
      2, r.id, cocho({ fazendaId: 20, pastoId: 2, nome: "Mudou de fazenda" }), sessao(2, "nutricao.editar"),
    )).rejects.toMatchObject({ message: MSG_COCHO_FAZENDA_FIXA });
    const [linhas] = await pool.query("SELECT fazendaId, nome FROM nutricao_cochos WHERE id = ?", [r.id]);
    const row = (linhas as Array<{ fazendaId: number; nome: string }>)[0];
    expect(row.fazendaId).toBe(10);
    expect(row.nome).toBe("Cocho Norte");
  });

  it("nome novo não reescreve o fornecimento antigo", async () => {
    await limpar();
    const r = await nutricaoCochosService.criar(1, cocho({ nome: "Cocho Velho" }), sessao(1, "nutricao.criar"));
    await pool.query(`
      INSERT INTO nutricao_fornecimentos
        (userId, fazendaId, loteId, cochoId, cochoNomeSnapshot, data, quantidadeFornecidaKg, status)
      VALUES (1, 10, 1, ?, 'Cocho Velho', '2026-11-01', 8, 'confirmado')
    `, [r.id]);
    await nutricaoCochosService.editar(2, r.id, cocho({ nome: "Cocho Novo" }), sessao(2, "nutricao.editar"));
    const detalhe = await nutricaoCochosService.obter(2, r.id, sessao(2, "nutricao.visualizar"));
    expect(detalhe.nome).toBe("Cocho Novo");
    expect(detalhe.fornecimentos[0]?.cochoId).toBe(r.id);
    const [linhas] = await pool.query("SELECT cochoNomeSnapshot, status FROM nutricao_fornecimentos");
    const row = (linhas as Array<{ cochoNomeSnapshot: string; status: string }>)[0];
    expect(row.cochoNomeSnapshot).toBe("Cocho Velho");
    expect(row.status).toBe("confirmado");
  });

  it("cocho inativo não serve para trato novo e o histórico fica", async () => {
    await limpar();
    const r = await nutricaoCochosService.criar(2, cocho(), sessao(2, "nutricao.criar"));
    await pool.query(`
      INSERT INTO nutricao_fornecimentos
        (userId, fazendaId, loteId, cochoId, cochoNomeSnapshot, data, quantidadeFornecidaKg, status)
      VALUES (1, 10, 1, ?, 'Cocho Norte', '2026-11-01', 8, 'confirmado')
    `, [r.id]);
    const status = await nutricaoCochosService.inativar(2, r.id, sessao(2, "nutricao.inativar"));
    expect(status.status).toBe("inativo");
    const detalhe = await nutricaoCochosService.obter(4, r.id, sessao(4, "nutricao.visualizar"));
    expect(detalhe.fornecimentos).toHaveLength(1);
    const regra = validarCochoNoFornecimento(
      { fazendaId: 10, cochoId: r.id },
      { id: r.id, userId: 1, fazendaId: 10, status: detalhe.status, nome: detalhe.nome },
    );
    expect(regra).toEqual({ ok: false, message: MSG_FORN_COCHO_INATIVO });
    expect(await contar("nutricao_fornecimentos")).toBe(1);
  });

  it("reativar devolve o cocho", async () => {
    await limpar();
    const r = await nutricaoCochosService.criar(2, cocho(), sessao(2, "nutricao.criar"));
    await nutricaoCochosService.inativar(2, r.id, sessao(2, "nutricao.inativar"));
    const status = await nutricaoCochosService.reativar(2, r.id, sessao(2, "nutricao.inativar"));
    expect(status.status).toBe("ativo");
  });

  it("dois cadastros com o mesmo código não duplicam", async () => {
    await limpar();
    const resultados = await Promise.all([
      nutricaoCochosService.criar(2, cocho({ codigo: "DUP" }), sessao(2, "nutricao.criar"))
        .then(() => "ok")
        .catch((erro: { message?: string }) => erro.message),
      nutricaoCochosService.criar(1, cocho({ codigo: "dup", nome: "Outro" }), sessao(1, "nutricao.criar"))
        .then(() => "ok")
        .catch((erro: { message?: string }) => erro.message),
    ]);
    expect(resultados.filter((item) => item === "ok")).toHaveLength(1);
    expect(resultados).toContain(MSG_COCHO_CODIGO);
    expect(await contar("nutricao_cochos")).toBe(1);
  });

  it("leitura antiga não muda quando o pasto do cocho muda", async () => {
    await limpar();
    await pool.query("INSERT INTO pastos (id, userId, fazendaId, nome) VALUES (4, 1, 10, 'Pasto Fundo')");
    const r = await nutricaoCochosService.criar(1, cocho({ nome: "Cocho Lido", pastoId: 1 }), sessao(1, "nutricao.criar"));
    await pool.query(`
      INSERT INTO nutricao_cocho_leituras (userId, fazendaId, cochoId, data, cochoNomeSnapshot, status)
      VALUES (1, 10, ?, '2026-11-01', 'Cocho Lido', 'ativa')
    `, [r.id]);
    await nutricaoCochosService.editar(2, r.id, cocho({ nome: "Cocho Lido", pastoId: 4 }), sessao(2, "nutricao.editar"));
    const [cochos] = await pool.query("SELECT pastoId FROM nutricao_cochos WHERE id = ?", [r.id]);
    expect((cochos as Array<{ pastoId: number }>)[0]?.pastoId).toBe(4);
    const [leituras] = await pool.query("SELECT cochoId, cochoNomeSnapshot, status FROM nutricao_cocho_leituras");
    expect(leituras).toEqual([{ cochoId: r.id, cochoNomeSnapshot: "Cocho Lido", status: "ativa" }]);
  });

  it("falha dentro da transação não deixa cocho pela metade", async () => {
    await limpar();
    await expect(nutricaoCochosService.criar(2, cocho({ pastoId: 99 }), sessao(2, "nutricao.criar")))
      .rejects.toMatchObject({ message: MSG_COCHO_PASTO });
    expect(await contar("nutricao_cochos")).toBe(0);
  });

  it("telas e rotas de dieta e cocho não leem o arquivo local", () => {
    const dieta = readFileSync(new URL("./nutricaoDietas.ts", import.meta.url), "utf8");
    const cochoSrc = readFileSync(new URL("./nutricaoCochos.ts", import.meta.url), "utf8");
    const rotaDieta = readFileSync(new URL("./nutricaoDietasRouter.ts", import.meta.url), "utf8");
    const rotaCocho = readFileSync(new URL("./nutricaoCochosRouter.ts", import.meta.url), "utf8");
    for (const src of [dieta, cochoSrc]) {
      expect(src).not.toContain("getLocalFazenda");
      expect(src).not.toContain("devLocalStore");
    }
    expect(dieta).toContain("quantidade: estoque.quantidade");
    expect(dieta).toContain("custoMedioFonteTecnica");
    expect(dieta).not.toContain("estoqueMovimentacoes");
    expect(rotaDieta).toContain('sessaoDe(ctx.user, "nutricao.visualizar")');
    expect(rotaDieta).toContain('sessaoDe(ctx.user, "nutricao.criar")');
    expect(rotaDieta).toContain('sessaoDe(ctx.user, "nutricao.editar")');
    expect(rotaDieta).toContain('sessaoDe(ctx.user, "nutricao.inativar")');
    expect(rotaCocho).toContain('sessaoDe(ctx.user, "nutricao.visualizar")');
    expect(rotaCocho).toContain('sessaoDe(ctx.user, "nutricao.criar")');
    expect(rotaCocho).toContain('sessaoDe(ctx.user, "nutricao.editar")');
    expect(rotaCocho).toContain('sessaoDe(ctx.user, "nutricao.inativar")');
    const formDieta = readFileSync(new URL("../client/src/pages/NutricaoDietaFormPage.tsx", import.meta.url), "utf8");
    const detalheDieta = readFileSync(new URL("../client/src/pages/NutricaoDietaDetalhePage.tsx", import.meta.url), "utf8");
    const formCocho = readFileSync(new URL("../client/src/pages/NutricaoCochoFormPage.tsx", import.meta.url), "utf8");
    const detalheCocho = readFileSync(new URL("../client/src/pages/NutricaoCochoDetalhePage.tsx", import.meta.url), "utf8");
    expect(formDieta).toContain("toast.success");
    expect(formDieta).toContain("tratarErroSalvar");
    expect(detalheDieta).toContain("onError: e => toast.error(e.message)");
    expect(formCocho).toContain("onError: e => toast.error(e.message)");
    expect(detalheCocho).toContain("onError: e => toast.error(e.message)");
  });
});
