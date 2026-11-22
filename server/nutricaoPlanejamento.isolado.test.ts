import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { env } from "./_core/env";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { definirBancoNutricaoBatidas, definirGanchoReceitaBatida, nutricaoBatidasService } from "./nutricaoBatidas";
import { definirBancoNutricaoDietas, nutricaoDietasService } from "./nutricaoDietas";
import { definirBancoNutricaoPlanejamento, nutricaoPlanejamentoService } from "./nutricaoPlanejamento";
import {
  MSG_NUTRICAO_FAZENDA,
  MSG_NUTRICAO_SEM_MYSQL,
  MSG_NUTRICAO_SEM_PERMISSAO,
  type SessaoNutricao,
} from "./nutricaoOperacaoAutorizada";
import { MSG_BATIDA_DIETA } from "../shared/nutricaoBatidas";
import { MSG_ESTOQUE_DISPUTADO } from "./estoqueConcorrencia";
import {
  MSG_PLAN_CANCELAR_COM_EXECUCAO,
  MSG_PLAN_CONFLITO,
  MSG_PLAN_DIETA_INATIVA,
  MSG_PLAN_LOTE_FAZENDA,
  MSG_PLAN_PRODUTO,
  MSG_PLAN_SUBSTITUIR_STATUS,
  type NutricaoPlanInput,
} from "../shared/nutricaoPlanejamento";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bi-plano";
const PORTA = 3388;
const SENHA = "isolado-h4bi";
const BANCO = "fd_h4bi";
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
CREATE TABLE lotes (
  id int NOT NULL, userId int NOT NULL, nome varchar(100) NOT NULL, fazendaId int NULL,
  ativo tinyint(1) NULL DEFAULT 1, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, loteId int NULL,
  status enum('ativo','vendido','morto','transferido') NOT NULL DEFAULT 'ativo',
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pesagens (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  peso decimal(10,2) NOT NULL, data date NOT NULL, PRIMARY KEY (id)
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
CREATE TABLE nutricao_planejamentos (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  loteId int NOT NULL, tipoOrigem varchar(20) NOT NULL, produtoId int NULL, dietaId int NULL,
  modalidadeMeta varchar(20) NOT NULL, valorMeta decimal(12,4) NULL, frequencia varchar(30) NOT NULL,
  tratosPorDia int NULL, frequenciaIntervaloDias int NULL, frequenciaDiasSemana varchar(20) NULL,
  nome varchar(100) NULL, observacoes text NULL, dataInicio date NOT NULL, dataFim date NULL,
  status varchar(20) NOT NULL, createdAt timestamp NULL, updatedAt timestamp NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE nutricao_fornecimentos (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  loteId int NOT NULL, planejamentoId int NULL, data date NOT NULL,
  quantidadeFornecidaKg decimal(12,3) NOT NULL, status varchar(20) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

type Banco = ReturnType<typeof drizzle<typeof schema>>;

function sessao(executorId: number, permissaoId: SessaoNutricao["permissaoId"], versao: number | null = 1): SessaoNutricao {
  return { executorId, sessionVersionDaSessao: versao, permissaoId };
}

function receita(extra: Record<string, unknown> = {}) {
  return {
    fazendaId: 10,
    nome: "Receita velha",
    tipo: "racao_concentrada" as const,
    formaUso: "preparo_opcional" as const,
    baseQuantidade: 100,
    ingredientes: [
      { produtoId: 101, quantidade: 70 },
      { produtoId: 102, quantidade: 30 },
    ],
    ...extra,
  };
}

function receitaNova() {
  return receita({
    nome: "Receita nova",
    ingredientes: [
      { produtoId: 101, quantidade: 50 },
      { produtoId: 102, quantidade: 50 },
    ],
  });
}

function plano(extra: Partial<NutricaoPlanInput> = {}): NutricaoPlanInput {
  return {
    fazendaId: 10,
    loteId: 1,
    tipoOrigem: "produto",
    produtoId: 101,
    modalidadeMeta: "g_cab_dia",
    valorMeta: 100,
    frequencia: "diaria",
    dataInicio: "2026-12-01",
    ...extra,
  };
}

describe.sequential("receita da batida e planejamento no mysql descartável", () => {
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

  async function paresDieta(dietaId: number) {
    const [linhas] = await pool.query(
      "SELECT produtoId, quantidade FROM nutricao_dieta_ingredientes WHERE dietaId = ? ORDER BY produtoId",
      [dietaId],
    );
    return (linhas as Array<{ produtoId: number; quantidade: string }>)
      .map((item) => `${item.produtoId}:${Number(item.quantidade)}`)
      .join("|");
  }

  async function paresBatida(batidaId: number) {
    const [linhas] = await pool.query(
      "SELECT produtoId, quantidadeKg FROM nutricao_batida_ingredientes WHERE batidaId = ? ORDER BY produtoId",
      [batidaId],
    );
    return (linhas as Array<{ produtoId: number; quantidadeKg: string }>)
      .map((item) => `${item.produtoId}:${Number(item.quantidadeKg)}`)
      .join("|");
  }

  async function limpar() {
    definirGanchoReceitaBatida(null);
    await pool.query("DELETE FROM nutricao_batida_ingredientes");
    await pool.query("DELETE FROM nutricao_batidas");
    await pool.query("DELETE FROM estoque_movimentacoes");
    await pool.query("DELETE FROM nutricao_fornecimentos");
    await pool.query("DELETE FROM nutricao_planejamentos");
    await pool.query("DELETE FROM nutricao_dieta_ingredientes");
    await pool.query("DELETE FROM nutricao_dietas");
    await pool.query("UPDATE estoque SET quantidade = 100, valor_unitario = 5 WHERE id = 1");
    await pool.query("UPDATE estoque SET quantidade = 80, valor_unitario = 4 WHERE id = 2");
    await pool.query("UPDATE estoque SET quantidade = 40, valor_unitario = 8 WHERE id = 3");
    await pool.query("UPDATE users SET sessionVersion = 1");
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'nutricao.visualizar', 1),
        (2, 1, 'nutricao.criar', 1),
        (2, 1, 'nutricao.editar', 1),
        (2, 1, 'nutricao.inativar', 1),
        (2, 1, 'nutricao.cancelar', 1),
        (2, 1, 'nutricao.confirmar', 1),
        (4, 1, 'nutricao.visualizar', 1),
        (5, 1, 'nutricao.visualizar', 1),
        (5, 1, 'nutricao.criar', 1),
        (5, 1, 'nutricao.editar', 1),
        (5, 1, 'nutricao.inativar', 1),
        (5, 1, 'nutricao.cancelar', 1)
    `);
    await pool.query("DELETE FROM usuario_fazendas");
    await pool.query(`
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
        (2, 10, 1), (2, 20, 1), (4, 10, 1), (5, 10, 1), (6, 10, 1)
    `);
  }

  async function criarDieta() {
    const r = await nutricaoDietasService.criar(1, receita(), sessao(1, "nutricao.criar"));
    return r.id;
  }

  function pedidoBatida(dietaId: number, qtd = 10) {
    return {
      fazendaId: 10,
      dietaId,
      data: "2026-11-01",
      quantidadePreparadaKg: qtd,
      chaveOperacao: `bat-${randomUUID()}`,
    };
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
          INSERT INTO lotes (id, userId, nome, fazendaId, ativo) VALUES
            (1, 1, 'Lote Norte', 10, 1), (2, 1, 'Lote Sul', 20, 1), (3, 3, 'Lote Alheio', 30, 1);
          INSERT INTO animais (id, userId, loteId, status) VALUES (1, 1, 1, 'ativo');
          INSERT INTO estoque (id, produto_id, fazenda_id, nome, unidade, quantidade, controlar_saldo, situacao, valor_unitario) VALUES
            (1, 101, 10, 'Milho', 'kg', 100, 1, 'ativo', 5),
            (2, 102, 10, 'Farelo', 'kg', 80, 1, 'ativo', 4),
            (3, 201, 20, 'Sal', 'kg', 40, 1, 'ativo', 8);
        `);
        await conn.end();
        pool = mysql.createPool({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
          connectionLimit: 8,
        });
        banco = drizzle(pool, { schema, mode: "default" });
        definirBancoNutricaoDietas(banco);
        definirBancoNutricaoBatidas(banco);
        definirBancoNutricaoPlanejamento(banco);
        return;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    throw new Error(ultimo || "MySQL descartável não subiu.");
  }, 120_000);

  afterAll(async () => {
    definirGanchoReceitaBatida(null);
    definirBancoNutricaoDietas(null);
    definirBancoNutricaoBatidas(null);
    definirBancoNutricaoPlanejamento(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  it("edição durante a montagem congela a receita antiga inteira", async () => {
    await limpar();
    const dietaId = await criarDieta();
    let edicao: Promise<unknown> = Promise.resolve();
    definirGanchoReceitaBatida(async () => {
      edicao = nutricaoDietasService.editar(2, dietaId, receitaNova(), sessao(2, "nutricao.editar"));
      await new Promise((resolver) => setTimeout(resolver, 400));
      expect(await paresDieta(dietaId)).toBe("101:70|102:30");
    });
    const batida = await nutricaoBatidasService.confirmar(
      2, "Ambos", pedidoBatida(dietaId), HOJE, sessao(2, "nutricao.confirmar"),
    );
    await edicao;
    definirGanchoReceitaBatida(null);
    const [cabeca] = await pool.query("SELECT dietaNomeSnapshot FROM nutricao_batidas WHERE id = ?", [batida.id]);
    expect((cabeca as Array<{ dietaNomeSnapshot: string }>)[0]?.dietaNomeSnapshot).toBe("Receita velha");
    expect(await paresBatida(batida.id)).toBe("101:7|102:3");
    const [viva] = await pool.query("SELECT nome FROM nutricao_dietas WHERE id = ?", [dietaId]);
    expect((viva as Array<{ nome: string }>)[0]?.nome).toBe("Receita nova");
    expect(await paresDieta(dietaId)).toBe("101:50|102:50");
    expect(await saldo(1)).toBe(93);
    expect(await saldo(2)).toBe(77);
  });

  it("edição concluída antes congela a receita nova inteira", async () => {
    await limpar();
    const dietaId = await criarDieta();
    await nutricaoDietasService.editar(2, dietaId, receitaNova(), sessao(2, "nutricao.editar"));
    const batida = await nutricaoBatidasService.confirmar(
      2, "Ambos", pedidoBatida(dietaId), HOJE, sessao(2, "nutricao.confirmar"),
    );
    const [cabeca] = await pool.query("SELECT dietaNomeSnapshot FROM nutricao_batidas WHERE id = ?", [batida.id]);
    expect((cabeca as Array<{ dietaNomeSnapshot: string }>)[0]?.dietaNomeSnapshot).toBe("Receita nova");
    expect(await paresBatida(batida.id)).toBe("101:5|102:5");
  });

  it("dieta inativada antes da trava não vira batida", async () => {
    await limpar();
    const dietaId = await criarDieta();
    await nutricaoDietasService.inativar(2, dietaId, sessao(2, "nutricao.inativar"));
    await expect(nutricaoBatidasService.confirmar(
      2, "Ambos", pedidoBatida(dietaId), HOJE, sessao(2, "nutricao.confirmar"),
    )).rejects.toMatchObject({ message: MSG_BATIDA_DIETA });
    expect(await contar("nutricao_batidas")).toBe(0);
    expect(await saldo(1)).toBe(100);
    expect(await saldo(2)).toBe(80);
  });

  it("inativação durante a montagem não mistura a receita", async () => {
    await limpar();
    const dietaId = await criarDieta();
    let baixa: Promise<unknown> = Promise.resolve();
    definirGanchoReceitaBatida(async () => {
      baixa = nutricaoDietasService.inativar(2, dietaId, sessao(2, "nutricao.inativar"));
      await new Promise((resolver) => setTimeout(resolver, 300));
      const [linhas] = await pool.query("SELECT status FROM nutricao_dietas WHERE id = ?", [dietaId]);
      expect((linhas as Array<{ status: string }>)[0]?.status).toBe("ativa");
    });
    const batida = await nutricaoBatidasService.confirmar(
      1, "Principal", pedidoBatida(dietaId), HOJE, sessao(1, "nutricao.confirmar"),
    );
    await baixa;
    definirGanchoReceitaBatida(null);
    expect(await paresBatida(batida.id)).toBe("101:7|102:3");
    const [linhas] = await pool.query("SELECT status FROM nutricao_dietas WHERE id = ?", [dietaId]);
    expect((linhas as Array<{ status: string }>)[0]?.status).toBe("inativa");
    expect(await contar("nutricao_batidas")).toBe(1);
  });

  it("duas confirmações da mesma dieta debitam duas receitas inteiras", async () => {
    await limpar();
    const dietaId = await criarDieta();
    const [a, b] = await Promise.all([
      nutricaoBatidasService.confirmar(2, "Ambos", pedidoBatida(dietaId), HOJE, sessao(2, "nutricao.confirmar")),
      nutricaoBatidasService.confirmar(1, "Principal", pedidoBatida(dietaId), HOJE, sessao(1, "nutricao.confirmar")),
    ]);
    expect(await paresBatida(a.id)).toBe("101:7|102:3");
    expect(await paresBatida(b.id)).toBe("101:7|102:3");
    expect(await saldo(1)).toBe(86);
    expect(await saldo(2)).toBe(74);
  });

  it("disputa de trava desfaz a batida inteira", async () => {
    await limpar();
    const dietaId = await criarDieta();
    const trava = await mysql.createConnection({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
    });
    await trava.beginTransaction();
    await trava.query("SELECT id FROM estoque WHERE id = 1 FOR UPDATE");
    const ida = nutricaoBatidasService.confirmar(
      2, "Ambos", pedidoBatida(dietaId), HOJE, sessao(2, "nutricao.confirmar"),
    ).then(() => "gravou").catch((erro: { code?: string; message?: string }) => erro);
    await new Promise((resolver) => setTimeout(resolver, 400));
    let vitima = "";
    try {
      await trava.query("SELECT id FROM nutricao_dietas WHERE id = ? FOR UPDATE", [dietaId]);
      vitima = "servico";
    } catch (erro) {
      vitima = (erro as { errno?: number }).errno === 1213 ? "trava" : "outro";
    }
    await trava.rollback();
    await trava.end();
    const resultado = await ida;
    if (vitima === "trava") {
      expect(resultado).toBe("gravou");
      expect(await saldo(1)).toBe(93);
    } else {
      expect(vitima).toBe("servico");
      expect(resultado).toMatchObject({ code: "CONFLICT", message: MSG_ESTOQUE_DISPUTADO });
      expect(await contar("nutricao_batidas")).toBe(0);
      expect(await saldo(1)).toBe(100);
      expect(await saldo(2)).toBe(80);
    }
  });

  it("funcionário grava o planejamento no titular", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(2, plano({ nome: "Do peão" }), HOJE, sessao(2, "nutricao.criar"));
    const [linhas] = await pool.query("SELECT userId, fazendaId, nome, valorMeta FROM nutricao_planejamentos WHERE id = ?", [r.id]);
    const row = (linhas as Array<{ userId: number; fazendaId: number; nome: string; valorMeta: string }>)[0];
    expect(row.userId).toBe(1);
    expect(row.fazendaId).toBe(10);
    expect(row.nome).toBe("Do peão");
    expect(Number(row.valorMeta)).toBe(100);
    expect(await contar("estoque_movimentacoes")).toBe(0);
    expect(await saldo(1)).toBe(100);
  });

  it("lista vazia de planejamento permanece vazia", async () => {
    await limpar();
    const lista = await nutricaoPlanejamentoService.listar(1, { fazendaId: 10 }, HOJE, sessao(1, "nutricao.visualizar"));
    expect(lista).toEqual([]);
  });

  it("funcionário sem permissão não lista planejamento", async () => {
    await limpar();
    await nutricaoPlanejamentoService.criar(1, plano(), HOJE, sessao(1, "nutricao.criar"));
    await expect(nutricaoPlanejamentoService.listar(6, { fazendaId: 10 }, HOJE, sessao(6, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_SEM_PERMISSAO });
  });

  it("fazenda não concedida não mostra o planejamento", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(
      1, plano({ fazendaId: 20, loteId: 2, produtoId: 201, nome: "Só do Sul" }), HOJE, sessao(1, "nutricao.criar"),
    );
    await expect(nutricaoPlanejamentoService.listar(5, { fazendaId: 20 }, HOJE, sessao(5, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_FAZENDA });
    await expect(nutricaoPlanejamentoService.obter(5, r.id, HOJE, sessao(5, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_FAZENDA });
    const norte = await nutricaoPlanejamentoService.listar(5, { fazendaId: 10 }, HOJE, sessao(5, "nutricao.visualizar"));
    expect(norte.map((item) => item.nome)).not.toContain("Só do Sul");
  });

  it("outro titular não vê o planejamento", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(1, plano({ nome: "Da conta 1" }), HOJE, sessao(1, "nutricao.criar"));
    await expect(nutricaoPlanejamentoService.obter(3, r.id, HOJE, sessao(3, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lote de outra fazenda não entra no planejamento", async () => {
    await limpar();
    await expect(nutricaoPlanejamentoService.criar(2, plano({ loteId: 2 }), HOJE, sessao(2, "nutricao.criar")))
      .rejects.toMatchObject({ message: MSG_PLAN_LOTE_FAZENDA });
    expect(await contar("nutricao_planejamentos")).toBe(0);
  });

  it("dieta de outra fazenda não entra no planejamento", async () => {
    await limpar();
    const dietaSul = await nutricaoDietasService.criar(
      1,
      receita({ fazendaId: 20, nome: "Dieta Sul", ingredientes: [{ produtoId: 201, quantidade: 100 }] }),
      sessao(1, "nutricao.criar"),
    );
    await expect(nutricaoPlanejamentoService.criar(
      2,
      plano({ tipoOrigem: "dieta", produtoId: null, dietaId: dietaSul.id }),
      HOJE,
      sessao(2, "nutricao.criar"),
    )).rejects.toBeTruthy();
    expect(await contar("nutricao_planejamentos")).toBe(0);
  });

  it("produto de outra fazenda não entra no planejamento", async () => {
    await limpar();
    await expect(nutricaoPlanejamentoService.criar(2, plano({ produtoId: 201 }), HOJE, sessao(2, "nutricao.criar")))
      .rejects.toMatchObject({ message: MSG_PLAN_PRODUTO });
    expect(await contar("nutricao_planejamentos")).toBe(0);
    expect(await saldo(3)).toBe(40);
  });

  it("prévia calcula a necessidade e não grava nada", async () => {
    await limpar();
    const previa = await nutricaoPlanejamentoService.preview(4, plano(), HOJE, sessao(4, "nutricao.visualizar"));
    expect(previa.necessidadeKgDia).toBe(0.1);
    expect(await contar("nutricao_planejamentos")).toBe(0);
    expect(await contar("nutricao_batidas")).toBe(0);
    expect(await contar("estoque_movimentacoes")).toBe(0);
    const produtos = await nutricaoPlanejamentoService.listarProdutos(4, 10, sessao(4, "nutricao.visualizar"));
    const milho = produtos.find((item) => item.produtoId === 101);
    expect(Number(milho?.quantidade)).toBe(100);
    expect(milho?.valorUnitario).toBe(5);
    expect(produtos.map((item) => item.produtoId)).not.toContain(201);
    await expect(nutricaoPlanejamentoService.listarProdutos(5, 20, sessao(5, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_FAZENDA });
  });

  it("edição do planejamento não reescreve o fornecimento", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(2, plano({ nome: "Original", valorMeta: 100 }), HOJE, sessao(2, "nutricao.criar"));
    await pool.query(`
      INSERT INTO nutricao_fornecimentos
        (userId, fazendaId, loteId, planejamentoId, data, quantidadeFornecidaKg, status)
      VALUES (1, 10, 1, ?, '2026-11-01', 4, 'confirmado')
    `, [r.id]);
    await nutricaoPlanejamentoService.editar(
      2, r.id, plano({ nome: "Ajustado", valorMeta: 120 }), HOJE, sessao(2, "nutricao.editar"),
    );
    const [forn] = await pool.query("SELECT quantidadeFornecidaKg, status FROM nutricao_fornecimentos");
    const row = (forn as Array<{ quantidadeFornecidaKg: string; status: string }>)[0];
    expect(Number(row.quantidadeFornecidaKg)).toBe(4);
    expect(row.status).toBe("confirmado");
    const [planoRow] = await pool.query("SELECT nome, valorMeta FROM nutricao_planejamentos WHERE id = ?", [r.id]);
    expect((planoRow as Array<{ nome: string }>)[0]?.nome).toBe("Ajustado");
  });

  it("substituição encerra o anterior e cria um sucessor", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(
      1, plano({ dataInicio: "2026-11-01", nome: "Velho" }), HOJE, sessao(1, "nutricao.criar"),
    );
    const sub = await nutricaoPlanejamentoService.substituir(
      2, r.id, plano({ dataInicio: "2026-11-22", nome: "Novo", valorMeta: 80 }), HOJE, sessao(2, "nutricao.editar"),
    );
    expect(sub.encerradoId).toBe(r.id);
    expect(sub.id).not.toBe(r.id);
    const [linhas] = await pool.query("SELECT id, status, userId, nome FROM nutricao_planejamentos ORDER BY id");
    const rows = linhas as Array<{ id: number; status: string; userId: number; nome: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]?.status).toBe("encerrado");
    expect(rows[1]?.status).toBe("ativo");
    expect(rows[1]?.userId).toBe(1);
    expect(rows[1]?.nome).toBe("Novo");
  });

  it("duas substituições não criam dois sucessores", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(
      1, plano({ dataInicio: "2026-11-01", nome: "Base" }), HOJE, sessao(1, "nutricao.criar"),
    );
    const resultados = await Promise.all([
      nutricaoPlanejamentoService.substituir(
        2, r.id, plano({ dataInicio: "2026-11-22", nome: "A", valorMeta: 80 }), HOJE, sessao(2, "nutricao.editar"),
      ).then(() => "ok").catch((erro: { message?: string }) => erro.message),
      nutricaoPlanejamentoService.substituir(
        1, r.id, plano({ dataInicio: "2026-11-22", nome: "B", valorMeta: 90 }), HOJE, sessao(1, "nutricao.editar"),
      ).then(() => "ok").catch((erro: { message?: string }) => erro.message),
    ]);
    expect(resultados.filter((item) => item === "ok")).toHaveLength(1);
    expect(resultados).toContain(MSG_PLAN_SUBSTITUIR_STATUS);
    const [ativos] = await pool.query("SELECT nome FROM nutricao_planejamentos WHERE status = 'ativo'");
    expect(ativos).toHaveLength(1);
    expect(["A", "B"]).toContain((ativos as Array<{ nome: string }>)[0]?.nome);
  });

  it("encerrar mantém o fornecimento já feito", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(
      2, plano({ dataInicio: "2026-11-01" }), HOJE, sessao(2, "nutricao.criar"),
    );
    await pool.query(`
      INSERT INTO nutricao_fornecimentos
        (userId, fazendaId, loteId, planejamentoId, data, quantidadeFornecidaKg, status)
      VALUES (1, 10, 1, ?, '2026-11-01', 4, 'confirmado')
    `, [r.id]);
    const out = await nutricaoPlanejamentoService.encerrar(2, r.id, HOJE, sessao(2, "nutricao.inativar"));
    expect(out.status).toBe("encerrado");
    expect(await contar("nutricao_fornecimentos")).toBe(1);
    expect(await saldo(1)).toBe(100);
  });

  it("cancelar com fornecimento confirmado é recusado", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(2, plano(), HOJE, sessao(2, "nutricao.criar"));
    await pool.query(`
      INSERT INTO nutricao_fornecimentos
        (userId, fazendaId, loteId, planejamentoId, data, quantidadeFornecidaKg, status)
      VALUES (1, 10, 1, ?, '2026-11-01', 4, 'confirmado')
    `, [r.id]);
    await expect(nutricaoPlanejamentoService.cancelar(2, r.id, HOJE, sessao(2, "nutricao.cancelar")))
      .rejects.toMatchObject({ message: MSG_PLAN_CANCELAR_COM_EXECUCAO });
    const [linhas] = await pool.query("SELECT status FROM nutricao_planejamentos WHERE id = ?", [r.id]);
    expect((linhas as Array<{ status: string }>)[0]?.status).toBe("ativo");
  });

  it("cancelar planejamento futuro sem trato muda só o status", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(2, plano(), HOJE, sessao(2, "nutricao.criar"));
    const out = await nutricaoPlanejamentoService.cancelar(5, r.id, HOJE, sessao(5, "nutricao.cancelar"));
    expect(out.status).toBe("cancelado");
    expect(await contar("nutricao_planejamentos")).toBe(1);
  });

  it("duas criações no mesmo período não duplicam a prescrição", async () => {
    await limpar();
    const resultados = await Promise.all([
      nutricaoPlanejamentoService.criar(2, plano({ nome: "Um" }), HOJE, sessao(2, "nutricao.criar"))
        .then(() => "ok").catch((erro: { message?: string }) => erro.message),
      nutricaoPlanejamentoService.criar(1, plano({ nome: "Dois" }), HOJE, sessao(1, "nutricao.criar"))
        .then(() => "ok").catch((erro: { message?: string }) => erro.message),
    ]);
    expect(resultados.filter((item) => item === "ok")).toHaveLength(1);
    expect(resultados).toContain(MSG_PLAN_CONFLITO);
    expect(await contar("nutricao_planejamentos")).toBe(1);
  });

  it("edição e substituição do plano futuro deixam um registro só", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(1, plano({ nome: "Base", valorMeta: 100 }), HOJE, sessao(1, "nutricao.criar"));
    await Promise.all([
      nutricaoPlanejamentoService.editar(2, r.id, plano({ nome: "Edicao", valorMeta: 120 }), HOJE, sessao(2, "nutricao.editar")),
      nutricaoPlanejamentoService.substituir(1, r.id, plano({ nome: "Troca", valorMeta: 150 }), HOJE, sessao(1, "nutricao.editar")),
    ]);
    const [linhas] = await pool.query("SELECT nome, valorMeta, status FROM nutricao_planejamentos");
    expect(linhas).toHaveLength(1);
    const row = (linhas as Array<{ nome: string; valorMeta: string; status: string }>)[0];
    expect(row.status).toBe("ativo");
    expect(["Edicao:120", "Troca:150"]).toContain(`${row.nome}:${Number(row.valorMeta)}`);
  });

  it("dieta inativada não vira planejamento novo", async () => {
    await limpar();
    const dietaId = await criarDieta();
    await nutricaoDietasService.inativar(2, dietaId, sessao(2, "nutricao.inativar"));
    await expect(nutricaoPlanejamentoService.criar(
      2,
      plano({ tipoOrigem: "dieta", produtoId: null, dietaId }),
      HOJE,
      sessao(2, "nutricao.criar"),
    )).rejects.toMatchObject({ message: MSG_PLAN_DIETA_INATIVA });
    expect(await contar("nutricao_planejamentos")).toBe(0);
  });

  it("permissão revogada impede a edição do planejamento", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(2, plano({ nome: "Firme" }), HOJE, sessao(2, "nutricao.criar"));
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = 'nutricao.editar'");
    await expect(nutricaoPlanejamentoService.editar(2, r.id, plano({ nome: "Mudou" }), HOJE, sessao(2, "nutricao.editar")))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_SEM_PERMISSAO });
    const [linhas] = await pool.query("SELECT nome FROM nutricao_planejamentos WHERE id = ?", [r.id]);
    expect((linhas as Array<{ nome: string }>)[0]?.nome).toBe("Firme");
  });

  it("fazenda revogada impede a lista do planejamento", async () => {
    await limpar();
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 10");
    await expect(nutricaoPlanejamentoService.listar(2, { fazendaId: 10 }, HOJE, sessao(2, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_FAZENDA });
  });

  it("sessão revogada impede o cancelamento", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(2, plano(), HOJE, sessao(2, "nutricao.criar"));
    await pool.query("UPDATE users SET sessionVersion = 2 WHERE id = 2");
    await expect(nutricaoPlanejamentoService.cancelar(2, r.id, HOJE, sessao(2, "nutricao.cancelar", 1)))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const [linhas] = await pool.query("SELECT status FROM nutricao_planejamentos WHERE id = ?", [r.id]);
    expect((linhas as Array<{ status: string }>)[0]?.status).toBe("ativo");
  });

  it("lote inexistente não deixa planejamento pela metade", async () => {
    await limpar();
    await expect(nutricaoPlanejamentoService.criar(2, plano({ loteId: 99 }), HOJE, sessao(2, "nutricao.criar")))
      .rejects.toBeTruthy();
    expect(await contar("nutricao_planejamentos")).toBe(0);
  });

  it("mysql indisponível não devolve lista vazia de planejamento", async () => {
    const fechado = drizzle(mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada", database: "fd_teste_nao_conectar",
      connectTimeout: 1000,
    }), { schema, mode: "default" });
    definirBancoNutricaoPlanejamento(fechado);
    await expect(nutricaoPlanejamentoService.listar(1, { fazendaId: 10 }, HOJE, sessao(1, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: MSG_NUTRICAO_SEM_MYSQL });
    definirBancoNutricaoPlanejamento(banco);
  });

  it("rotas de planejamento e a receita da batida não leem o arquivo local", () => {
    const planoSrc = readFileSync(new URL("./nutricaoPlanejamento.ts", import.meta.url), "utf8");
    const batida = readFileSync(new URL("./nutricaoBatidas.ts", import.meta.url), "utf8");
    const rota = readFileSync(new URL("./nutricaoPlanejamentoRouter.ts", import.meta.url), "utf8");
    const cocho = readFileSync(new URL("./nutricaoCochos.ts", import.meta.url), "utf8");
    expect(planoSrc).not.toContain("getLocalFazenda");
    expect(planoSrc).not.toContain("devLocalStore");
    expect(batida).toContain("lerReceitaTravada");
    expect(batida).toContain("for(\"update\")");
    expect(rota).toContain('sessaoDe(ctx.user, "nutricao.visualizar")');
    expect(rota).toContain('sessaoDe(ctx.user, "nutricao.criar")');
    expect(rota).toContain('sessaoDe(ctx.user, "nutricao.editar")');
    expect(rota).toContain('sessaoDe(ctx.user, "nutricao.inativar")');
    expect(rota).toContain('sessaoDe(ctx.user, "nutricao.cancelar")');
    const form = readFileSync(new URL("../client/src/pages/NutricaoPlanejamentoFormPage.tsx", import.meta.url), "utf8");
    expect(form).toContain("toast.success");
    expect(form).toContain("onError: e => toast.error(e.message)");
    expect(cocho.split("insert(nutricaoCochos)").length - 1).toBe(2);
  });
});
