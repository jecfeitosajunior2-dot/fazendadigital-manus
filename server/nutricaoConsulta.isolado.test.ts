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
import { definirBancoNutricaoBatidas, nutricaoBatidasService } from "./nutricaoBatidas";
import { definirBancoNutricaoDietas, nutricaoDietasService } from "./nutricaoDietas";
import { definirBancoNutricaoFornecimentos, nutricaoFornecimentosService } from "./nutricaoFornecimentos";
import { definirGanchoTravaPlano, MSG_NUTRICAO_FAZENDA, MSG_NUTRICAO_SEM_MYSQL, MSG_NUTRICAO_SEM_PERMISSAO, type SessaoNutricao } from "./nutricaoOperacaoAutorizada";
import { definirBancoNutricaoPlanejamento, nutricaoPlanejamentoService } from "./nutricaoPlanejamento";
import { MSG_FORN_PLAN } from "../shared/nutricaoFornecimentos";
import { MSG_PLAN_CANCELAR_COM_EXECUCAO, MSG_PLAN_SUBSTITUIR_STATUS, type NutricaoPlanInput } from "../shared/nutricaoPlanejamento";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bj-consulta";
const PORTA = 3389;
const SENHA = "isolado-h4bj";
const BANCO = "fd_h4bj";
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
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL, nome varchar(100) NOT NULL,
  descricao text NULL, tipo varchar(40) NOT NULL, categoriaAnimal varchar(50) NULL,
  objetivo varchar(40) NULL, formaUso varchar(30) NULL, status varchar(20) NOT NULL,
  dataInicio date NULL, dataFim date NULL, baseQuantidade decimal(12,3) NOT NULL,
  baseUnidade varchar(8) NOT NULL, createdAt timestamp NULL, updatedAt timestamp NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE nutricao_dieta_ingredientes (
  id int NOT NULL AUTO_INCREMENT, dietaId int NOT NULL, produtoId int NOT NULL,
  quantidade decimal(12,3) NOT NULL, ordem int NOT NULL, createdAt timestamp NULL,
  PRIMARY KEY (id)
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
  createdAt timestamp NULL, updatedAt timestamp NULL,
  chaveOperacao varchar(80) NULL, conteudoHash varchar(64) NULL,
  PRIMARY KEY (id), UNIQUE KEY nutricao_fornecimentos_user_chave_uq (userId, chaveOperacao)
) ENGINE=InnoDB;
CREATE TABLE nutricao_fornecimento_ingredientes (
  id int NOT NULL AUTO_INCREMENT, fornecimentoId int NOT NULL, produtoId int NOT NULL,
  produtoNomeSnapshot varchar(120) NULL, quantidadeKg decimal(12,3) NOT NULL,
  quantidadeUnidade decimal(12,3) NOT NULL, unidadeSnapshot varchar(20) NULL,
  proporcaoSnapshot decimal(8,4) NULL, custoUnitarioSnapshot decimal(12,4) NULL,
  custoTotalSnapshot decimal(12,2) NULL, custoConhecido tinyint(1) NOT NULL,
  ordem int NOT NULL, createdAt timestamp NULL, PRIMARY KEY (id)
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
`;

type Banco = ReturnType<typeof drizzle<typeof schema>>;

function sessao(executorId: number, permissaoId: SessaoNutricao["permissaoId"], versao: number | null = 1): SessaoNutricao {
  return { executorId, sessionVersionDaSessao: versao, permissaoId };
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
    dataInicio: "2026-11-01",
    nome: "Trato firme",
    ...extra,
  };
}

function pedido(planoId: number, extra: Record<string, unknown> = {}) {
  return {
    fazendaId: 10,
    loteId: 1,
    planejamentoId: planoId,
    tipoOrigem: "produto" as const,
    produtoId: 101,
    data: HOJE,
    quantidadeFornecidaKg: 10,
    chaveOperacao: `forn-${randomUUID()}`,
    ...extra,
  };
}

describe.sequential("fornecimento e consultas de nutrição no mysql descartável", () => {
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

  async function statusPlano(id: number) {
    const [linhas] = await pool.query("SELECT status, nome, valorMeta, dataFim FROM nutricao_planejamentos WHERE id = ?", [id]);
    return (linhas as Array<{ status: string; nome: string; valorMeta: string; dataFim: string | null }>)[0];
  }

  async function limpar() {
    definirGanchoTravaPlano(null);
    await pool.query("DELETE FROM nutricao_batida_ingredientes");
    await pool.query("DELETE FROM nutricao_batidas");
    await pool.query("DELETE FROM nutricao_fornecimento_ingredientes");
    await pool.query("DELETE FROM nutricao_fornecimentos");
    await pool.query("DELETE FROM estoque_movimentacoes");
    await pool.query("DELETE FROM nutricao_planejamentos");
    await pool.query("DELETE FROM nutricao_cochos");
    await pool.query("DELETE FROM nutricao_dieta_ingredientes");
    await pool.query("DELETE FROM nutricao_dietas");
    await pool.query("UPDATE estoque SET quantidade = 100, valor_unitario = 5 WHERE id = 1");
    await pool.query("UPDATE estoque SET quantidade = 80, valor_unitario = 4 WHERE id = 2");
    await pool.query("UPDATE users SET sessionVersion = 1");
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'nutricao.visualizar', 1), (2, 1, 'nutricao.criar', 1), (2, 1, 'nutricao.editar', 1),
        (2, 1, 'nutricao.inativar', 1), (2, 1, 'nutricao.cancelar', 1), (2, 1, 'nutricao.confirmar', 1),
        (2, 1, 'nutricao.estornar', 1), (4, 1, 'nutricao.visualizar', 1),
        (5, 1, 'nutricao.visualizar', 1), (5, 1, 'nutricao.confirmar', 1)
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
          INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Norte'), (20, 1, 'Sul'), (30, 3, 'Alheia');
          INSERT INTO lotes (id, userId, nome, fazendaId, ativo) VALUES
            (1, 1, 'Lote Norte', 10, 1), (2, 1, 'Lote Sul', 20, 1), (3, 3, 'Lote Alheio', 30, 1);
          INSERT INTO animais (id, userId, sexo, status, loteId) VALUES (1, 1, 'femea', 'ativo', 1);
          INSERT INTO estoque (id, produto_id, fazenda_id, nome, unidade, quantidade, controlar_saldo, situacao, valor_unitario) VALUES
            (1, 101, 10, 'Milho', 'kg', 100, 1, 'ativo', 5),
            (2, 102, 10, 'Farelo', 'kg', 80, 1, 'ativo', 4);
        `);
        await conn.end();
        pool = mysql.createPool({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, connectionLimit: 8,
        });
        banco = drizzle(pool, { schema, mode: "default" });
        definirBancoNutricaoFornecimentos(banco);
        definirBancoNutricaoBatidas(banco);
        definirBancoNutricaoPlanejamento(banco);
        definirBancoNutricaoDietas(banco);
        return;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    throw new Error(ultimo || "MySQL descartável não subiu.");
  }, 120_000);

  afterAll(async () => {
    definirGanchoTravaPlano(null);
    definirBancoNutricaoFornecimentos(null);
    definirBancoNutricaoBatidas(null);
    definirBancoNutricaoPlanejamento(null);
    definirBancoNutricaoDietas(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  it("cancelamento do plano futuro vence e o trato não baixa estoque", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(
      2, plano({ dataInicio: "2026-12-01", nome: "Futuro" }), HOJE, sessao(2, "nutricao.criar"),
    );
    let confirmacao: Promise<unknown> = Promise.resolve();
    definirGanchoTravaPlano(async () => {
      definirGanchoTravaPlano(null);
      confirmacao = nutricaoFornecimentosService.confirmar(
        2, "Ambos", pedido(r.id), HOJE, sessao(2, "nutricao.confirmar"),
      ).then(() => "gravou").catch((erro: { message?: string }) => erro.message);
      await new Promise((resolver) => setTimeout(resolver, 500));
      expect((await statusPlano(r.id))?.status).toBe("ativo");
    });
    await nutricaoPlanejamentoService.cancelar(2, r.id, HOJE, sessao(2, "nutricao.cancelar"));
    expect(await confirmacao).toBe(MSG_FORN_PLAN);
    definirGanchoTravaPlano(null);
    expect((await statusPlano(r.id))?.status).toBe("cancelado");
    expect(await contar("nutricao_fornecimentos")).toBe(0);
    expect(await saldo(1)).toBe(100);
  });

  it("confirmação vence e o cancelamento vê o trato já feito", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(1, plano(), HOJE, sessao(1, "nutricao.criar"));
    let cancelamento: Promise<string> = Promise.resolve("");
    definirGanchoTravaPlano(async () => {
      definirGanchoTravaPlano(null);
      cancelamento = nutricaoPlanejamentoService.cancelar(2, r.id, HOJE, sessao(2, "nutricao.cancelar"))
        .then(() => "ok")
        .catch((erro: { message?: string }) => erro.message ?? "");
      await new Promise((resolver) => setTimeout(resolver, 500));
      expect((await statusPlano(r.id))?.status).toBe("ativo");
    });
    const forn = await nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedido(r.id), HOJE, sessao(2, "nutricao.confirmar"),
    );
    expect(await cancelamento).toBe(MSG_PLAN_CANCELAR_COM_EXECUCAO);
    definirGanchoTravaPlano(null);
    expect(forn.repetido).toBe(false);
    expect((await statusPlano(r.id))?.status).toBe("ativo");
    expect(await contar("nutricao_fornecimentos")).toBe(1);
    expect(await saldo(1)).toBe(90);
  });

  it("substituição que vence impede o trato na prescrição antiga", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(1, plano({ nome: "Velho" }), HOJE, sessao(1, "nutricao.criar"));
    let confirmacao: Promise<unknown> = Promise.resolve();
    definirGanchoTravaPlano(async () => {
      definirGanchoTravaPlano(null);
      confirmacao = nutricaoFornecimentosService.confirmar(
        2, "Ambos", pedido(r.id), HOJE, sessao(2, "nutricao.confirmar"),
      ).then(() => "gravou").catch((erro: { message?: string }) => erro.message);
      await new Promise((resolver) => setTimeout(resolver, 500));
      expect((await statusPlano(r.id))?.status).toBe("ativo");
    });
    const sub = await nutricaoPlanejamentoService.substituir(
      2, r.id, plano({ dataInicio: HOJE, nome: "Novo", valorMeta: 80 }), HOJE, sessao(2, "nutricao.editar"),
    );
    expect(await confirmacao).toBe(MSG_FORN_PLAN);
    definirGanchoTravaPlano(null);
    expect(sub.encerradoId).toBe(r.id);
    expect(await contar("nutricao_fornecimentos")).toBe(0);
    expect(await contar("nutricao_planejamentos")).toBe(2);
    expect(await saldo(1)).toBe(100);
  });

  it("trato que vence guarda a meta antiga e a substituição cria um sucessor", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(1, plano({ nome: "Velho" }), HOJE, sessao(1, "nutricao.criar"));
    let troca: Promise<string> = Promise.resolve("");
    definirGanchoTravaPlano(async () => {
      definirGanchoTravaPlano(null);
      troca = nutricaoPlanejamentoService.substituir(
        2, r.id, plano({ dataInicio: HOJE, nome: "Novo", valorMeta: 80 }), HOJE, sessao(2, "nutricao.editar"),
      ).then(() => "ok").catch((erro: { message?: string }) => erro.message ?? "");
      await new Promise((resolver) => setTimeout(resolver, 500));
      expect((await statusPlano(r.id))?.status).toBe("ativo");
    });
    const forn = await nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedido(r.id), HOJE, sessao(2, "nutricao.confirmar"),
    );
    expect(await troca).toBe("ok");
    definirGanchoTravaPlano(null);
    const detalhe = await nutricaoFornecimentosService.obter(2, forn.id, sessao(2, "nutricao.visualizar"));
    expect(detalhe.planejamentoId).toBe(r.id);
    expect(detalhe.planejamentoModalidadeSnapshot).toBe("g_cab_dia");
    expect(Number(detalhe.planejamentoNecessidadeKgSnapshot)).toBeCloseTo(0.1, 3);
    expect(detalhe.userId).toBe(1);
    expect(await contar("nutricao_planejamentos")).toBe(2);
    expect(await saldo(1)).toBe(90);
  });

  it("encerramento e trato simultâneos deixam um consumo e o plano encerrado", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(1, plano(), HOJE, sessao(1, "nutricao.criar"));
    let fim: Promise<string> = Promise.resolve("");
    definirGanchoTravaPlano(async () => {
      definirGanchoTravaPlano(null);
      fim = nutricaoPlanejamentoService.encerrar(2, r.id, HOJE, sessao(2, "nutricao.inativar"))
        .then(() => "ok").catch((erro: { message?: string }) => erro.message ?? "");
      await new Promise((resolver) => setTimeout(resolver, 400));
    });
    await nutricaoFornecimentosService.confirmar(2, "Ambos", pedido(r.id), HOJE, sessao(2, "nutricao.confirmar"));
    expect(await fim).toBe("ok");
    definirGanchoTravaPlano(null);
    expect((await statusPlano(r.id))?.status).toBe("encerrado");
    expect(await contar("nutricao_fornecimentos")).toBe(1);
    expect(await saldo(1)).toBe(90);
  });

  it("edição do nome durante o trato não troca a meta congelada", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(1, plano({ nome: "Nome velho" }), HOJE, sessao(1, "nutricao.criar"));
    let edicao: Promise<string> = Promise.resolve("");
    definirGanchoTravaPlano(async () => {
      definirGanchoTravaPlano(null);
      edicao = nutricaoPlanejamentoService.editar(
        2, r.id, plano({ nome: "Nome novo" }), HOJE, sessao(2, "nutricao.editar"),
      ).then(() => "ok").catch((erro: { message?: string }) => erro.message ?? "");
      await new Promise((resolver) => setTimeout(resolver, 400));
      expect((await statusPlano(r.id))?.nome).toBe("Nome velho");
    });
    const forn = await nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedido(r.id), HOJE, sessao(2, "nutricao.confirmar"),
    );
    expect(await edicao).toBe("ok");
    definirGanchoTravaPlano(null);
    expect((await statusPlano(r.id))?.nome).toBe("Nome novo");
    expect(Number((await statusPlano(r.id))?.valorMeta)).toBe(100);
    const detalhe = await nutricaoFornecimentosService.obter(1, forn.id, sessao(1, "nutricao.visualizar"));
    expect(Number(detalhe.planejamentoNecessidadeKgSnapshot)).toBeCloseTo(0.1, 3);
    expect(Number(detalhe.custoTotalSnapshot)).toBe(50);
    expect(await saldo(1)).toBe(90);
  });

  it("reenviar a chave depois do encerramento não baixa de novo", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(1, plano(), HOJE, sessao(1, "nutricao.criar"));
    const pedidoOriginal = pedido(r.id);
    const primeiro = await nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedidoOriginal, HOJE, sessao(2, "nutricao.confirmar"),
    );
    await nutricaoPlanejamentoService.encerrar(2, r.id, HOJE, sessao(2, "nutricao.inativar"));
    const segundo = await nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedidoOriginal, HOJE, sessao(2, "nutricao.confirmar"),
    );
    expect(primeiro.repetido).toBe(false);
    expect(segundo.repetido).toBe(true);
    expect(segundo.id).toBe(primeiro.id);
    expect(await saldo(1)).toBe(90);
    expect(await contar("nutricao_fornecimentos")).toBe(1);
  });

  it("reenviar a chave depois do estorno não recria o consumo", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(1, plano(), HOJE, sessao(1, "nutricao.criar"));
    const pedidoOriginal = pedido(r.id);
    const primeiro = await nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedidoOriginal, HOJE, sessao(2, "nutricao.confirmar"),
    );
    await nutricaoFornecimentosService.estornar(
      2, "Ambos", { id: primeiro.id, motivo: "erro de campo" }, HOJE, sessao(2, "nutricao.estornar"),
    );
    const segundo = await nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedidoOriginal, HOJE, sessao(2, "nutricao.confirmar"),
    );
    expect(segundo.repetido).toBe(true);
    expect(await saldo(1)).toBe(100);
    expect(await contar("estoque_movimentacoes")).toBe(2);
  });

  it("duas substituições continuam com um sucessor só", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(1, plano({ nome: "Base" }), HOJE, sessao(1, "nutricao.criar"));
    const resultados = await Promise.all([
      nutricaoPlanejamentoService.substituir(2, r.id, plano({ dataInicio: HOJE, nome: "A", valorMeta: 80 }), HOJE, sessao(2, "nutricao.editar"))
        .then(() => "ok").catch((erro: { message?: string }) => erro.message),
      nutricaoPlanejamentoService.substituir(1, r.id, plano({ dataInicio: HOJE, nome: "B", valorMeta: 90 }), HOJE, sessao(1, "nutricao.editar"))
        .then(() => "ok").catch((erro: { message?: string }) => erro.message),
    ]);
    expect(resultados.filter((item) => item === "ok")).toHaveLength(1);
    expect(resultados).toContain(MSG_PLAN_SUBSTITUIR_STATUS);
    expect(await contar("nutricao_planejamentos")).toBe(2);
  });

  it("funcionário consulta o trato no nome do titular", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(1, plano(), HOJE, sessao(1, "nutricao.criar"));
    const forn = await nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedido(r.id), HOJE, sessao(2, "nutricao.confirmar"),
    );
    const lista = await nutricaoFornecimentosService.listar(2, { fazendaId: 10 }, sessao(2, "nutricao.visualizar"));
    expect(lista).toHaveLength(1);
    expect(lista[0]?.id).toBe(forn.id);
    expect(lista[0]?.userId).toBe(1);
    expect(lista[0]?.loteNome).toBe("Lote Norte");
    expect(Number(lista[0]?.quantidadeFornecidaKg)).toBe(10);
    expect(lista[0]?.status).toBe("confirmado");
  });

  it("sem permissão a lista não abre", async () => {
    await limpar();
    await expect(nutricaoFornecimentosService.listar(6, { fazendaId: 10 }, sessao(6, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_SEM_PERMISSAO });
  });

  it("fazenda não concedida não lista trato nem plano", async () => {
    await limpar();
    await expect(nutricaoFornecimentosService.listar(5, { fazendaId: 20 }, sessao(5, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: MSG_NUTRICAO_FAZENDA });
    await expect(nutricaoFornecimentosService.listarPlanejamentos(5, 20, 2, HOJE, sessao(5, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("outro titular não abre o trato pelo identificador", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(1, plano(), HOJE, sessao(1, "nutricao.criar"));
    const forn = await nutricaoFornecimentosService.confirmar(1, "Principal", pedido(r.id), HOJE, sessao(1, "nutricao.confirmar"));
    await expect(nutricaoFornecimentosService.obter(3, forn.id, sessao(3, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("trato antigo no nome do funcionário fica na tabela e sai da lista nova", async () => {
    await limpar();
    await pool.query(`
      INSERT INTO nutricao_fornecimentos
        (userId, fazendaId, loteId, tipoOrigem, produtoId, origemOperacional, data, quantidadeFornecidaKg, populacaoSnapshot, custoCompleto, status, origemNomeSnapshot)
      VALUES (2, 10, 1, 'produto', 101, 'direta', '2026-11-01', 3, 1, 1, 'confirmado', 'Antigo do peão')
    `);
    const lista = await nutricaoFornecimentosService.listar(2, { fazendaId: 10 }, sessao(2, "nutricao.visualizar"));
    expect(lista).toHaveLength(0);
    expect(await contar("nutricao_fornecimentos")).toBe(1);
  });

  it("lista de planejamentos mostra só o vigente da fazenda concedida", async () => {
    await limpar();
    await nutricaoPlanejamentoService.criar(2, plano({ nome: "Norte" }), HOJE, sessao(2, "nutricao.criar"));
    const lista = await nutricaoFornecimentosService.listarPlanejamentos(2, 10, 1, HOJE, sessao(2, "nutricao.visualizar"));
    expect(lista).toHaveLength(1);
    expect(lista[0]?.fazendaId).toBe(10);
    expect(lista[0]?.status).toBe("ativo");
  });

  it("prévia do trato calcula e não grava", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(1, plano(), HOJE, sessao(1, "nutricao.criar"));
    const previa = await nutricaoFornecimentosService.preview(4, pedido(r.id), HOJE, sessao(4, "nutricao.visualizar"));
    expect(previa.ok).toBe(true);
    expect(previa.preview.animaisAtuais).toBe(1);
    expect(previa.preview.planejamento?.necessidadeKg).toBeCloseTo(0.1, 3);
    expect(await contar("nutricao_fornecimentos")).toBe(0);
    expect(await contar("estoque_movimentacoes")).toBe(0);
    expect(await saldo(1)).toBe(100);
  });

  it("preço novo do estoque não reescreve o custo do trato", async () => {
    await limpar();
    const r = await nutricaoPlanejamentoService.criar(1, plano(), HOJE, sessao(1, "nutricao.criar"));
    const forn = await nutricaoFornecimentosService.confirmar(1, "Principal", pedido(r.id), HOJE, sessao(1, "nutricao.confirmar"));
    await pool.query("UPDATE estoque SET valor_unitario = 9 WHERE id = 1");
    const detalhe = await nutricaoFornecimentosService.obter(2, forn.id, sessao(2, "nutricao.visualizar"));
    expect(Number(detalhe.custoTotalSnapshot)).toBe(50);
    expect(Number(detalhe.custoPorKgSnapshot)).toBe(5);
  });

  it("cocho renomeado não muda o nome gravado no trato", async () => {
    await limpar();
    const [ins] = await pool.query(
      "INSERT INTO nutricao_cochos (userId, fazendaId, nome, codigo, tipo, status) VALUES (1, 10, 'Cocho Velho', 'CV', 'racao_dieta', 'ativo')",
    );
    const cochoId = Number((ins as { insertId: number }).insertId);
    const r = await nutricaoPlanejamentoService.criar(1, plano(), HOJE, sessao(1, "nutricao.criar"));
    const forn = await nutricaoFornecimentosService.confirmar(
      2, "Ambos", pedido(r.id, { cochoId }), HOJE, sessao(2, "nutricao.confirmar"),
    );
    await pool.query("UPDATE nutricao_cochos SET nome = 'Cocho Novo' WHERE id = ?", [cochoId]);
    const detalhe = await nutricaoFornecimentosService.obter(2, forn.id, sessao(2, "nutricao.visualizar"));
    expect(detalhe.cochoNomeSnapshot).toContain("Cocho Velho");
    expect(detalhe.status).toBe("confirmado");
  });

  it("batida confirmada guarda a receita mesmo depois da dieta mudar", async () => {
    await limpar();
    const dieta = await nutricaoDietasService.criar(1, {
      fazendaId: 10,
      nome: "Receita velha",
      tipo: "racao_concentrada",
      formaUso: "preparo_opcional",
      baseQuantidade: 100,
      ingredientes: [{ produtoId: 101, quantidade: 70 }, { produtoId: 102, quantidade: 30 }],
    }, sessao(1, "nutricao.criar"));
    const batida = await nutricaoBatidasService.confirmar(2, "Ambos", {
      fazendaId: 10, dietaId: dieta.id, data: "2026-11-01", quantidadePreparadaKg: 10, chaveOperacao: `bat-${randomUUID()}`,
    }, HOJE, sessao(2, "nutricao.confirmar"));
    await nutricaoDietasService.editar(2, dieta.id, {
      fazendaId: 10, nome: "Receita nova", tipo: "racao_concentrada", formaUso: "preparo_opcional", baseQuantidade: 100,
      ingredientes: [{ produtoId: 101, quantidade: 50 }, { produtoId: 102, quantidade: 50 }],
    }, sessao(2, "nutricao.editar"));
    const detalhe = await nutricaoBatidasService.obter(2, batida.id, sessao(2, "nutricao.visualizar"));
    expect(detalhe.dietaNomeSnapshot).toBe("Receita velha");
    expect(detalhe.ingredientes.map(i => `${i.produtoId}:${Number(i.quantidadeKg)}`).sort().join("|")).toBe("101:7|102:3");
    expect(detalhe.userId).toBe(1);
    const lista = await nutricaoBatidasService.listar(4, { fazendaId: 10 }, sessao(4, "nutricao.visualizar"));
    expect(lista).toHaveLength(1);
    expect(lista[0]?.dietaNomeSnapshot).toBe("Receita velha");
  });

  it("batidas disponíveis mostram o saldo e não reservam estoque", async () => {
    await limpar();
    const dieta = await nutricaoDietasService.criar(1, {
      fazendaId: 10, nome: "Mistura", tipo: "racao_concentrada", formaUso: "preparo_opcional", baseQuantidade: 100,
      ingredientes: [{ produtoId: 101, quantidade: 100 }],
    }, sessao(1, "nutricao.criar"));
    await nutricaoBatidasService.confirmar(1, "Principal", {
      fazendaId: 10, dietaId: dieta.id, data: "2026-11-01", quantidadePreparadaKg: 10, chaveOperacao: `bat-${randomUUID()}`,
    }, HOJE, sessao(1, "nutricao.confirmar"));
    const antes = await saldo(1);
    const livres = await nutricaoBatidasService.listarDisponiveis(2, 10, sessao(2, "nutricao.visualizar"));
    expect(livres).toHaveLength(1);
    expect(Number(livres[0]?.quantidadePreparadaKg)).toBe(10);
    expect(Number(livres[0]?.saldoDisponivelKg)).toBe(10);
    expect(await saldo(1)).toBe(antes);
    await expect(nutricaoBatidasService.listarDisponiveis(5, 20, sessao(5, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("dietas para batida são só as ativas da fazenda", async () => {
    await limpar();
    const dieta = await nutricaoDietasService.criar(1, {
      fazendaId: 10, nome: "Ativa", tipo: "racao_concentrada", formaUso: "preparo_opcional", baseQuantidade: 100,
      ingredientes: [{ produtoId: 101, quantidade: 100 }],
    }, sessao(1, "nutricao.criar"));
    await nutricaoDietasService.inativar(1, dieta.id, sessao(1, "nutricao.inativar"));
    const lista = await nutricaoBatidasService.listarDietasParaBatida(2, 10, sessao(2, "nutricao.visualizar"));
    expect(lista.find(item => item.id === dieta.id)).toBeUndefined();
    await expect(nutricaoBatidasService.listarDietasParaBatida(3, 10, sessao(3, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("prévia da batida usa a receita inteira e não grava", async () => {
    await limpar();
    const dieta = await nutricaoDietasService.criar(1, {
      fazendaId: 10, nome: "Receita velha", tipo: "racao_concentrada", formaUso: "preparo_opcional", baseQuantidade: 100,
      ingredientes: [{ produtoId: 101, quantidade: 70 }, { produtoId: 102, quantidade: 30 }],
    }, sessao(1, "nutricao.criar"));
    const previa = await nutricaoBatidasService.preview(4, {
      fazendaId: 10, dietaId: dieta.id, data: "2026-11-01", quantidadePreparadaKg: 10,
    }, HOJE, sessao(4, "nutricao.visualizar"));
    expect(previa.ok).toBe(true);
    expect(previa.preview.baixas.map(b => `${b.produtoId}:${b.quantidadeKg}`).sort().join("|")).toBe("101:7|102:3");
    expect(await contar("nutricao_batidas")).toBe(0);
    expect(await saldo(1)).toBe(100);
    expect(await saldo(2)).toBe(80);
  });

  it("sessão revogada não lista o trato", async () => {
    await limpar();
    await pool.query("UPDATE users SET sessionVersion = 4 WHERE id = 2");
    await expect(nutricaoFornecimentosService.listar(2, { fazendaId: 10 }, sessao(2, "nutricao.visualizar", 1)))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("permissão revogada não abre a prévia", async () => {
    await limpar();
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 4");
    await expect(nutricaoBatidasService.preview(4, {
      fazendaId: 10, dietaId: 1, data: "2026-11-01", quantidadePreparadaKg: 10,
    }, HOJE, sessao(4, "nutricao.visualizar"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("mysql indisponível não devolve lista vazia", async () => {
    const fechado = drizzle(mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada", database: "fd_teste_nao_conectar",
      connectTimeout: 1000,
    }), { schema, mode: "default" });
    definirBancoNutricaoFornecimentos(fechado);
    definirBancoNutricaoBatidas(fechado);
    await expect(nutricaoFornecimentosService.listar(1, { fazendaId: 10 }, sessao(1, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: MSG_NUTRICAO_SEM_MYSQL });
    await expect(nutricaoBatidasService.listar(1, { fazendaId: 10 }, sessao(1, "nutricao.visualizar")))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: MSG_NUTRICAO_SEM_MYSQL });
    definirBancoNutricaoFornecimentos(banco);
    definirBancoNutricaoBatidas(banco);
  });

  it("lista vazia de trato permanece vazia", async () => {
    await limpar();
    const lista = await nutricaoFornecimentosService.listar(2, { fazendaId: 10 }, sessao(2, "nutricao.visualizar"));
    expect(lista).toEqual([]);
  });

  it("consultas e a trava do plano não usam o arquivo local", () => {
    const forn = readFileSync(new URL("./nutricaoFornecimentos.ts", import.meta.url), "utf8");
    const batida = readFileSync(new URL("./nutricaoBatidas.ts", import.meta.url), "utf8");
    const rotaForn = readFileSync(new URL("./nutricaoFornecimentosRouter.ts", import.meta.url), "utf8");
    const rotaBat = readFileSync(new URL("./nutricaoBatidasRouter.ts", import.meta.url), "utf8");
    const listaForn = readFileSync(new URL("../client/src/pages/NutricaoFornecimentosListPage.tsx", import.meta.url), "utf8");
    const listaBat = readFileSync(new URL("../client/src/pages/NutricaoBatidasListPage.tsx", import.meta.url), "utf8");
    expect(forn).toContain("travarPlanejamento");
    expect(forn).toContain("lerPreviaConsistente");
    expect(forn).not.toContain("getLocalFazenda");
    expect(batida).toContain("lerPreviaConsistente");
    expect(batida).not.toContain("getLocalFazenda");
    expect(rotaForn).toContain('sessaoDe(ctx.user, "nutricao.visualizar")');
    expect(rotaBat).toContain('sessaoDe(ctx.user, "nutricao.visualizar")');
    expect(listaForn).toContain("dataInicio");
    expect(listaForn).toContain("status");
    expect(listaBat).toContain("situacao");
    expect(listaBat).toContain("dietaId");
  });
});
