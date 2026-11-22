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
import { definirBancoNutricaoBatidas } from "./nutricaoBatidas";
import { definirBancoNutricaoCochoLeituras, nutricaoCochoLeiturasService } from "./nutricaoCochoLeituras";
import { definirBancoNutricaoCochos, nutricaoCochosService } from "./nutricaoCochos";
import { definirBancoNutricaoDietas } from "./nutricaoDietas";
import { definirBancoNutricaoFornecimentos, nutricaoFornecimentosService } from "./nutricaoFornecimentos";
import {
  definirGanchoTravaLeitura,
  MSG_NUTRICAO_FAZENDA,
  MSG_NUTRICAO_SEM_MYSQL,
  MSG_NUTRICAO_SEM_PERMISSAO,
  type SessaoNutricao,
} from "./nutricaoOperacaoAutorizada";
import { definirBancoNutricaoPlanejamento, nutricaoPlanejamentoService } from "./nutricaoPlanejamento";
import {
  MSG_LEITURA_CANCELADA,
  MSG_LEITURA_COCHO_INATIVO,
  MSG_LEITURA_FORN,
  MSG_LEITURA_FORN_ESTORNADO,
  MSG_LEITURA_NAO_EDITAR,
  MSG_LEITURA_NAO_ENCONTRADA,
  type NutricaoLeituraInput,
} from "../shared/nutricaoCochoLeituras";
import type { NutricaoPlanInput } from "../shared/nutricaoPlanejamento";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bk-leitura";
const PORTA = 3390;
const SENHA = "isolado-h4bk";
const BANCO = "fd_h4bk";
const HOJE = "2026-11-22";
const MSG_FAZENDA_FIXA = "A fazenda da leitura não pode ser alterada.";

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
CREATE TABLE nutricao_cocho_leituras (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  cochoId int NOT NULL, loteId int NULL, fornecimentoId int NULL,
  data date NOT NULL, hora varchar(5) NULL, sobraKg decimal(12,3) NULL,
  escore varchar(40) NULL, observacoes text NULL,
  cochoNomeSnapshot varchar(160) NULL, loteNomeSnapshot varchar(120) NULL,
  alimentoNomeSnapshot varchar(120) NULL, status varchar(20) NOT NULL DEFAULT 'ativa',
  createdAt timestamp NULL, updatedAt timestamp NULL,
  chaveOperacao varchar(80) NULL, conteudoHash varchar(64) NULL,
  PRIMARY KEY (id), UNIQUE KEY nutricao_cocho_leituras_user_chave_uq (userId, chaveOperacao)
) ENGINE=InnoDB;
`;

type Banco = ReturnType<typeof drizzle<typeof schema>>;

function sessao(executorId: number, permissaoId: SessaoNutricao["permissaoId"], versao: number | null = 1): SessaoNutricao {
  return { executorId, sessionVersionDaSessao: versao, permissaoId };
}

function leitura(extra: Partial<NutricaoLeituraInput> = {}): NutricaoLeituraInput {
  return {
    fazendaId: 10,
    cochoId: 1,
    loteId: 1,
    data: HOJE,
    hora: "17:00",
    sobraKg: 20,
    chaveOperacao: `lei-${randomUUID()}`,
    ...extra,
  };
}

function cochoInput(extra: Record<string, unknown> = {}) {
  return {
    fazendaId: 10,
    nome: "Cocho Norte",
    codigo: "CN-1",
    tipo: "racao_dieta" as const,
    pastoId: 1,
    ...extra,
  };
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

const pausa = (ms = 450) => new Promise((resolver) => setTimeout(resolver, ms));

async function texto(trabalho: Promise<unknown>) {
  try {
    await trabalho;
    return "ok";
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro);
  }
}

describe.sequential("leituras de cocho no mysql descartável", () => {
  let pool: mysql.Pool;
  let banco: Banco;

  async function saldo(id = 1) {
    const [linhas] = await pool.query("SELECT quantidade FROM estoque WHERE id = ?", [id]);
    return Number((linhas as Array<{ quantidade: string }>)[0]?.quantidade);
  }

  async function contar(tabela: string) {
    const [linhas] = await pool.query(`SELECT COUNT(*) AS n FROM ${tabela}`);
    return Number((linhas as Array<{ n: number }>)[0]?.n);
  }

  async function linhaLeitura(id: number) {
    const [linhas] = await pool.query(
      "SELECT userId, fazendaId, cochoId, loteId, fornecimentoId, data, hora, sobraKg, cochoNomeSnapshot, alimentoNomeSnapshot, status FROM nutricao_cocho_leituras WHERE id = ?",
      [id],
    );
    return (linhas as Array<{
      userId: number; fazendaId: number; cochoId: number; loteId: number | null;
      fornecimentoId: number | null; data: string; hora: string | null; sobraKg: string | null;
      cochoNomeSnapshot: string | null; alimentoNomeSnapshot: string | null; status: string;
    }>)[0];
  }

  async function custoForn(id: number) {
    const [linhas] = await pool.query(
      "SELECT status, quantidadeFornecidaKg, custoTotalSnapshot, fazendaId, cochoId FROM nutricao_fornecimentos WHERE id = ?",
      [id],
    );
    const row = (linhas as Array<{ status: string; quantidadeFornecidaKg: string; custoTotalSnapshot: string; fazendaId: number; cochoId: number | null }>)[0];
    return row;
  }

  async function inserirForn(extra: Record<string, string | number | null> = {}) {
    const valores = {
      userId: 1, fazendaId: 10, loteId: 1, cochoId: 1, tipoOrigem: "produto", produtoId: 101,
      origemOperacional: "batida", data: HOJE, hora: "08:00", quantidadeFornecidaKg: 100,
      populacaoSnapshot: 1, origemNomeSnapshot: "Milho", custoUnitarioSnapshot: 5,
      custoTotalSnapshot: 50, custoPorKgSnapshot: 5, custoCompleto: 1, status: "confirmado",
      ...extra,
    };
    const [res] = await pool.query(
      `INSERT INTO nutricao_fornecimentos
        (userId, fazendaId, loteId, cochoId, tipoOrigem, produtoId, origemOperacional, data, hora,
         quantidadeFornecidaKg, populacaoSnapshot, origemNomeSnapshot, custoUnitarioSnapshot,
         custoTotalSnapshot, custoPorKgSnapshot, custoCompleto, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        valores.userId, valores.fazendaId, valores.loteId, valores.cochoId, valores.tipoOrigem, valores.produtoId,
        valores.origemOperacional, valores.data, valores.hora, valores.quantidadeFornecidaKg, valores.populacaoSnapshot,
        valores.origemNomeSnapshot, valores.custoUnitarioSnapshot, valores.custoTotalSnapshot, valores.custoPorKgSnapshot,
        valores.custoCompleto, valores.status,
      ],
    );
    return Number((res as { insertId: number }).insertId);
  }

  async function limpar() {
    definirGanchoTravaLeitura(null);
    await pool.query("DELETE FROM nutricao_cocho_leituras");
    await pool.query("DELETE FROM nutricao_batida_ingredientes");
    await pool.query("DELETE FROM nutricao_batidas");
    await pool.query("DELETE FROM nutricao_fornecimento_ingredientes");
    await pool.query("DELETE FROM nutricao_fornecimentos");
    await pool.query("DELETE FROM estoque_movimentacoes");
    await pool.query("DELETE FROM nutricao_planejamentos");
    await pool.query("DELETE FROM nutricao_cochos");
    await pool.query("UPDATE estoque SET quantidade = 100, valor_unitario = 5 WHERE id = 1");
    await pool.query("UPDATE users SET sessionVersion = 1");
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'nutricao.visualizar', 1), (2, 1, 'nutricao.criar', 1), (2, 1, 'nutricao.editar', 1),
        (2, 1, 'nutricao.cancelar', 1), (2, 1, 'nutricao.confirmar', 1), (2, 1, 'nutricao.estornar', 1),
        (2, 1, 'nutricao.inativar', 1), (4, 1, 'nutricao.visualizar', 1),
        (5, 1, 'nutricao.visualizar', 1), (5, 1, 'nutricao.criar', 1)
    `);
    await pool.query("DELETE FROM usuario_fazendas");
    await pool.query(`
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
        (2, 10, 1), (2, 20, 1), (4, 10, 1), (5, 10, 1), (6, 10, 1)
    `);
    await pool.query(`
      INSERT INTO nutricao_cochos (id, userId, fazendaId, nome, codigo, tipo, pastoId, coberto, status) VALUES
        (1, 1, 10, 'Cocho Norte', 'CN-1', 'racao_dieta', 1, 0, 'ativo'),
        (2, 1, 20, 'Cocho Sul', 'CS-1', 'racao_dieta', NULL, 0, 'ativo'),
        (3, 3, 30, 'Cocho Alheio', 'CA-1', 'racao_dieta', 3, 0, 'ativo')
    `);
  }

  function usar(alvo: Banco | null) {
    definirBancoNutricaoCochoLeituras(alvo);
    definirBancoNutricaoCochos(alvo);
    definirBancoNutricaoFornecimentos(alvo);
    definirBancoNutricaoPlanejamento(alvo);
    definirBancoNutricaoDietas(alvo);
    definirBancoNutricaoBatidas(alvo);
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
          INSERT INTO pastos (id, userId, fazendaId, nome) VALUES
            (1, 1, 10, 'Pasto Norte'), (2, 1, 10, 'Pasto Fundo'), (3, 3, 30, 'Pasto Alheio');
          INSERT INTO lotes (id, userId, nome, fazendaId, ativo) VALUES
            (1, 1, 'Lote Norte', 10, 1), (2, 1, 'Lote Sul', 20, 1), (3, 3, 'Lote Alheio', 30, 1);
          INSERT INTO animais (id, userId, sexo, status, loteId) VALUES (1, 1, 'femea', 'ativo', 1);
          INSERT INTO estoque (id, produto_id, fazenda_id, nome, unidade, quantidade, controlar_saldo, situacao, valor_unitario) VALUES
            (1, 101, 10, 'Milho', 'kg', 100, 1, 'ativo', 5);
        `);
        await conn.end();
        pool = mysql.createPool({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, connectionLimit: 8,
        });
        banco = drizzle(pool, { schema, mode: "default" });
        usar(banco);
        return;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await pausa(1500);
      }
    }
    throw new Error(ultimo || "MySQL descartável não subiu.");
  }, 120_000);

  afterAll(async () => {
    definirGanchoTravaLeitura(null);
    usar(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  it("contrato da tela conserva fazenda, cocho, quantidades e o erro do banco", () => {
    const form = readFileSync(new URL("../client/src/pages/NutricaoCochoLeituraFormPage.tsx", import.meta.url), "utf8");
    const lista = readFileSync(new URL("../client/src/pages/NutricaoCochoLeiturasListPage.tsx", import.meta.url), "utf8");
    const router = readFileSync(new URL("./nutricaoCochoLeiturasRouter.ts", import.meta.url), "utf8");
    expect(form).toContain("Leitura registrada. Estoque não foi movimentado.");
    expect(form).toContain("Leitura atualizada. O consumo aparente é recalculado dos fatos.");
    expect(form).toContain("onError: e => toast.error(e.message)");
    expect(lista).toContain("fazendaId");
    expect(lista).toContain("cochoId");
    expect(lista).toContain("loteId");
    expect(lista).toContain("dataInicio");
    expect(lista).toContain("dataFim");
    expect(router).toContain('sessaoDe(ctx.user, "nutricao.visualizar")');
    expect(router).toContain('sessaoDe(ctx.user, "nutricao.criar")');
    expect(router).toContain('sessaoDe(ctx.user, "nutricao.editar")');
    expect(router).toContain('sessaoDe(ctx.user, "nutricao.cancelar")');
  });

  it("funcionário grava a leitura no titular e o estoque fica parado", async () => {
    await limpar();
    const forn = await inserirForn();
    const criado = await nutricaoCochoLeiturasService.criar(
      2, leitura({ fornecimentoId: forn }), HOJE, sessao(2, "nutricao.criar"),
    );
    const row = await linhaLeitura(criado.id);
    expect(criado.repetido).toBe(false);
    expect(row.userId).toBe(1);
    expect(row.fazendaId).toBe(10);
    expect(row.cochoId).toBe(1);
    expect(row.fornecimentoId).toBe(forn);
    expect(row.cochoNomeSnapshot).toBe("Cocho Norte (CN-1)");
    expect(row.alimentoNomeSnapshot).toBe("Milho");
    expect(Number(row.sobraKg)).toBe(20);
    expect(row.status).toBe("ativa");
    expect(await saldo()).toBe(100);
    expect((await custoForn(forn)).custoTotalSnapshot).toBe("50.00");
    expect((await custoForn(forn)).status).toBe("confirmado");
    expect(await contar("estoque_movimentacoes")).toBe(0);
  });

  it("funcionário sem permissão não cria, não edita e não cancela", async () => {
    await limpar();
    const criado = await nutricaoCochoLeiturasService.criar(1, leitura(), HOJE, sessao(1, "nutricao.criar"));
    expect(await texto(nutricaoCochoLeiturasService.criar(4, leitura({ hora: "18:00" }), HOJE, sessao(4, "nutricao.criar"))))
      .toBe(MSG_NUTRICAO_SEM_PERMISSAO);
    expect(await texto(nutricaoCochoLeiturasService.editar(6, criado.id, leitura({ sobraKg: 1 }), HOJE, sessao(6, "nutricao.editar"))))
      .toBe(MSG_NUTRICAO_SEM_PERMISSAO);
    expect(await texto(nutricaoCochoLeiturasService.cancelar(4, criado.id, sessao(4, "nutricao.cancelar"))))
      .toBe(MSG_NUTRICAO_SEM_PERMISSAO);
    expect((await linhaLeitura(criado.id)).status).toBe("ativa");
    expect(Number((await linhaLeitura(criado.id)).sobraKg)).toBe(20);
  });

  it("fazenda não concedida e cocho de outra conta ficam de fora", async () => {
    await limpar();
    expect(await texto(nutricaoCochoLeiturasService.criar(
      5, leitura({ fazendaId: 20, cochoId: 2, loteId: 2 }), HOJE, sessao(5, "nutricao.criar"),
    ))).toBe(MSG_NUTRICAO_FAZENDA);
    expect(await texto(nutricaoCochoLeiturasService.listar(5, { fazendaId: 20 }, sessao(5, "nutricao.visualizar"))))
      .toBe(MSG_NUTRICAO_FAZENDA);
    expect(await texto(nutricaoCochoLeiturasService.criar(
      2, leitura({ cochoId: 3 }), HOJE, sessao(2, "nutricao.criar"),
    ))).toBe("Selecione o cocho da leitura.");
    expect(await contar("nutricao_cocho_leituras")).toBe(0);
  });

  it("leitura de outro titular não aparece nem pelo identificador", async () => {
    await limpar();
    await pool.query(
      `INSERT INTO nutricao_cocho_leituras
        (userId, fazendaId, cochoId, data, hora, sobraKg, cochoNomeSnapshot, status)
       VALUES (3, 30, 3, ?, '09:00', 4, 'Cocho Alheio', 'ativa')`,
      [HOJE],
    );
    const [linhas] = await pool.query("SELECT id FROM nutricao_cocho_leituras WHERE userId = 3");
    const id = Number((linhas as Array<{ id: number }>)[0].id);
    expect(await texto(nutricaoCochoLeiturasService.obter(2, id, sessao(2, "nutricao.visualizar"))))
      .toBe("Registro não encontrado.");
    const lista = await nutricaoCochoLeiturasService.listar(2, { fazendaId: 10 }, sessao(2, "nutricao.visualizar"));
    expect(lista).toEqual([]);
  });

  it("lista respeita filtro, fazenda e devolve vazio quando o banco está vazio", async () => {
    await limpar();
    expect(await nutricaoCochoLeiturasService.listar(2, { fazendaId: 10 }, sessao(2, "nutricao.visualizar"))).toEqual([]);
    await nutricaoCochoLeiturasService.criar(2, leitura({ data: "2026-11-20", hora: "09:00", observacoes: "cedo" }), HOJE, sessao(2, "nutricao.criar"));
    await nutricaoCochoLeiturasService.criar(2, leitura({ hora: "18:00", loteId: null, observacoes: "tarde" }), HOJE, sessao(2, "nutricao.criar"));
    await nutricaoCochoLeiturasService.criar(
      2, leitura({ fazendaId: 20, cochoId: 2, loteId: 2, hora: "11:00" }), HOJE, sessao(2, "nutricao.criar"),
    );
    const doDia = await nutricaoCochoLeiturasService.listar(
      2, { fazendaId: 10, dataInicio: HOJE, dataFim: HOJE }, sessao(2, "nutricao.visualizar"),
    );
    expect(doDia).toHaveLength(1);
    expect(doDia[0].fazendaId).toBe(10);
    expect(doDia[0].userId).toBe(1);
    expect(doDia[0].observacoes).toBe("tarde");
    const doLote = await nutricaoCochoLeiturasService.listar(
      2, { fazendaId: 10, loteId: 1 }, sessao(2, "nutricao.visualizar"),
    );
    expect(doLote).toHaveLength(1);
    expect(doLote[0].data).toBe("2026-11-20");
    const sul = await nutricaoCochoLeiturasService.listar(2, { fazendaId: 20, cochoId: 2 }, sessao(2, "nutricao.visualizar"));
    expect(sul).toHaveLength(1);
    expect(sul[0].cochoId).toBe(2);
  });

  it("consulta por cocho devolve no máximo oito e esconde cocho de outra conta", async () => {
    await limpar();
    for (let i = 0; i < 9; i += 1) {
      await nutricaoCochoLeiturasService.criar(
        2, leitura({ hora: null, sobraKg: null, observacoes: `nota ${i}` }), HOJE, sessao(2, "nutricao.criar"),
      );
    }
    const lista = await nutricaoCochoLeiturasService.listarPorCocho(2, 1, sessao(2, "nutricao.visualizar"));
    expect(lista).toHaveLength(8);
    expect(lista.every(item => item.userId === 1 && item.fazendaId === 10)).toBe(true);
    expect(await contar("nutricao_cocho_leituras")).toBe(9);
    expect(await texto(nutricaoCochoLeiturasService.listarPorCocho(2, 3, sessao(2, "nutricao.visualizar"))))
      .toBe("Registro não encontrado.");
  });

  it("fornecimento de referência fica na fazenda e no cocho, sem recalcular custo", async () => {
    await limpar();
    const bom = await inserirForn();
    const estornado = await inserirForn({ status: "estornado", hora: "09:00" });
    const sul = await inserirForn({ fazendaId: 20, cochoId: 2, loteId: 2, hora: "10:00" });
    const refs = await nutricaoCochoLeiturasService.listarFornecimentosRef(2, 10, 1, sessao(2, "nutricao.visualizar"));
    expect(refs.map(item => item.id)).toEqual([bom]);
    expect(refs[0].quantidadeFornecidaKg).toBe(100);
    expect(refs[0].status).toBe("confirmado");
    expect((await custoForn(bom)).custoTotalSnapshot).toBe("50.00");
    expect((await custoForn(estornado)).status).toBe("estornado");
    expect((await custoForn(sul)).fazendaId).toBe(20);
    expect(await texto(nutricaoCochoLeiturasService.listarFornecimentosRef(2, 10, 2, sessao(2, "nutricao.visualizar"))))
      .toBe(MSG_LEITURA_NAO_ENCONTRADA);
    expect(await texto(nutricaoCochoLeiturasService.criar(
      2, leitura({ fornecimentoId: sul }), HOJE, sessao(2, "nutricao.criar"),
    ))).toBe(MSG_LEITURA_FORN);
  });

  it("detalhe traz o consumo de 80 kg e o nome antigo do cocho", async () => {
    await limpar();
    const forn = await inserirForn();
    const criado = await nutricaoCochoLeiturasService.criar(
      2, leitura({ fornecimentoId: forn }), HOJE, sessao(2, "nutricao.criar"),
    );
    await pool.query("UPDATE nutricao_cochos SET nome = 'Nome novo' WHERE id = 1");
    const got = await nutricaoCochoLeiturasService.obter(2, criado.id, sessao(2, "nutricao.visualizar"));
    expect(got.userId).toBe(1);
    expect(got.cochoNomeSnapshot).toBe("Cocho Norte (CN-1)");
    expect(got.consumo.calculavel).toBe(true);
    expect(got.consumo.consumoAparenteKg).toBe(80);
    expect(got.fornecimento?.quantidadeFornecidaKg).toBe(100);
    expect(got.fornecimento?.status).toBe("confirmado");
  });

  it("prévia calcula e não grava leitura nem mexe no trato", async () => {
    await limpar();
    const forn = await inserirForn();
    const prev = await nutricaoCochoLeiturasService.preview(
      2, leitura({ fornecimentoId: forn }), HOJE, true, sessao(2, "nutricao.visualizar"),
    );
    expect(prev.ok).toBe(true);
    expect(prev.consumo?.consumoAparenteKg).toBe(80);
    expect(await contar("nutricao_cocho_leituras")).toBe(0);
    expect(await saldo()).toBe(100);
    expect((await custoForn(forn)).quantidadeFornecidaKg).toBe("100.000");
    expect(await contar("nutricao_planejamentos")).toBe(0);
  });

  it("edição muda a sobra e conserva fazenda, cocho e nome fotografado", async () => {
    await limpar();
    const criado = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    await pool.query("UPDATE nutricao_cochos SET nome = 'Nome novo', pastoId = 2 WHERE id = 1");
    await nutricaoCochoLeiturasService.editar(
      2, criado.id, leitura({ sobraKg: 7, observacoes: "corrigida" }), HOJE, sessao(2, "nutricao.editar"),
    );
    const row = await linhaLeitura(criado.id);
    expect(Number(row.sobraKg)).toBe(7);
    expect(row.fazendaId).toBe(10);
    expect(row.cochoId).toBe(1);
    expect(row.userId).toBe(1);
    expect(row.cochoNomeSnapshot).toBe("Cocho Norte (CN-1)");
    const [cocho] = await pool.query("SELECT nome, pastoId FROM nutricao_cochos WHERE id = 1");
    expect((cocho as Array<{ nome: string; pastoId: number }>)[0]).toMatchObject({ nome: "Nome novo", pastoId: 2 });
  });

  it("edição não troca a fazenda da leitura", async () => {
    await limpar();
    const criado = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    expect(await texto(nutricaoCochoLeiturasService.editar(
      2, criado.id, leitura({ fazendaId: 20, cochoId: 2, loteId: 2 }), HOJE, sessao(2, "nutricao.editar"),
    ))).toBe(MSG_FAZENDA_FIXA);
    expect((await linhaLeitura(criado.id)).fazendaId).toBe(10);
    expect((await linhaLeitura(criado.id)).cochoId).toBe(1);
  });

  it("cocho inativo bloqueia leitura nova e ainda aceita corrigir a antiga", async () => {
    await limpar();
    const criado = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    await nutricaoCochosService.inativar(2, 1, sessao(2, "nutricao.inativar"));
    expect(await texto(nutricaoCochoLeiturasService.criar(
      2, leitura({ hora: "18:00" }), HOJE, sessao(2, "nutricao.criar"),
    ))).toBe(MSG_LEITURA_COCHO_INATIVO);
    await nutricaoCochoLeiturasService.editar(
      2, criado.id, leitura({ sobraKg: 3 }), HOJE, sessao(2, "nutricao.editar"),
    );
    expect(Number((await linhaLeitura(criado.id)).sobraKg)).toBe(3);
    expect(await contar("nutricao_cocho_leituras")).toBe(1);
  });

  it("cancelamento conserva a linha e não devolve estoque nem apaga o trato", async () => {
    await limpar();
    const forn = await inserirForn();
    const criado = await nutricaoCochoLeiturasService.criar(
      2, leitura({ fornecimentoId: forn }), HOJE, sessao(2, "nutricao.criar"),
    );
    const fim = await nutricaoCochoLeiturasService.cancelar(2, criado.id, sessao(2, "nutricao.cancelar"));
    expect(fim.status).toBe("cancelada");
    expect((await linhaLeitura(criado.id)).status).toBe("cancelada");
    expect((await linhaLeitura(criado.id)).fornecimentoId).toBe(forn);
    expect(await contar("nutricao_cocho_leituras")).toBe(1);
    expect((await custoForn(forn)).status).toBe("confirmado");
    expect(await saldo()).toBe(100);
    expect(await texto(nutricaoCochoLeiturasService.cancelar(2, criado.id, sessao(2, "nutricao.cancelar"))))
      .toBe(MSG_LEITURA_CANCELADA);
  });

  it("reenvio da mesma chave devolve a leitura e outra chave igual abre outra", async () => {
    await limpar();
    const chave = `lei-${randomUUID()}`;
    const primeira = await nutricaoCochoLeiturasService.criar(2, leitura({ chaveOperacao: chave }), HOJE, sessao(2, "nutricao.criar"));
    const repetida = await nutricaoCochoLeiturasService.criar(2, leitura({ chaveOperacao: chave }), HOJE, sessao(2, "nutricao.criar"));
    const outra = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    expect(repetida.id).toBe(primeira.id);
    expect(repetida.repetido).toBe(true);
    expect(outra.id).not.toBe(primeira.id);
    expect(await contar("nutricao_cocho_leituras")).toBe(2);
  });

  it("duas criações iguais ao mesmo tempo deixam uma linha", async () => {
    await limpar();
    const chave = `lei-${randomUUID()}`;
    let segunda: Promise<string> = Promise.resolve("");
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      segunda = nutricaoCochoLeiturasService.criar(2, leitura({ chaveOperacao: chave }), HOJE, sessao(2, "nutricao.criar"))
        .then((resultado) => resultado.repetido ? `repetiu:${resultado.id}` : `nova:${resultado.id}`)
        .catch((erro: { message?: string }) => erro.message ?? "");
      await pausa();
      expect(await contar("nutricao_cocho_leituras")).toBe(0);
    });
    const primeira = await nutricaoCochoLeiturasService.criar(2, leitura({ chaveOperacao: chave }), HOJE, sessao(2, "nutricao.criar"));
    expect(await segunda).toBe(`repetiu:${primeira.id}`);
    definirGanchoTravaLeitura(null);
    expect(await contar("nutricao_cocho_leituras")).toBe(1);
    expect((await linhaLeitura(primeira.id)).userId).toBe(1);
  });

  it("duas leituras em horários diferentes passam juntas", async () => {
    await limpar();
    let segunda: Promise<string> = Promise.resolve("");
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      segunda = nutricaoCochoLeiturasService.criar(2, leitura({ hora: "18:00", sobraKg: 4 }), HOJE, sessao(2, "nutricao.criar"))
        .then((resultado) => `${resultado.repetido}:${resultado.id}`)
        .catch((erro: { message?: string }) => erro.message ?? "");
      await pausa();
      expect(await contar("nutricao_cocho_leituras")).toBe(0);
    });
    const primeira = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    const resposta = await segunda;
    definirGanchoTravaLeitura(null);
    expect(resposta.startsWith("false:")).toBe(true);
    expect(await contar("nutricao_cocho_leituras")).toBe(2);
    expect((await linhaLeitura(primeira.id)).hora).toBe("17:00");
  });

  it("criação e edição sobrepostas conservam as duas leituras", async () => {
    await limpar();
    const antiga = await nutricaoCochoLeiturasService.criar(2, leitura({ hora: "09:00", sobraKg: 11 }), HOJE, sessao(2, "nutricao.criar"));
    let edicao: Promise<string> = Promise.resolve("");
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      edicao = nutricaoCochoLeiturasService.editar(
        2, antiga.id, leitura({ hora: "09:00", sobraKg: 5 }), HOJE, sessao(2, "nutricao.editar"),
      ).then(() => "ok").catch((erro: { message?: string }) => erro.message ?? "");
      await pausa();
      expect(Number((await linhaLeitura(antiga.id)).sobraKg)).toBe(11);
    });
    await nutricaoCochoLeiturasService.criar(2, leitura({ hora: "18:00" }), HOJE, sessao(2, "nutricao.criar"));
    expect(await edicao).toBe("ok");
    definirGanchoTravaLeitura(null);
    expect(Number((await linhaLeitura(antiga.id)).sobraKg)).toBe(5);
    expect(await contar("nutricao_cocho_leituras")).toBe(2);
  });

  it("duas edições sobrepostas terminam no valor da que esperou", async () => {
    await limpar();
    const criada = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    let segunda: Promise<string> = Promise.resolve("");
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      segunda = nutricaoCochoLeiturasService.editar(
        2, criada.id, leitura({ sobraKg: 9, observacoes: "segunda" }), HOJE, sessao(2, "nutricao.editar"),
      ).then(() => "ok").catch((erro: { message?: string }) => erro.message ?? "");
      await pausa();
      expect(Number((await linhaLeitura(criada.id)).sobraKg)).toBe(20);
    });
    await nutricaoCochoLeiturasService.editar(
      2, criada.id, leitura({ sobraKg: 1, observacoes: "primeira" }), HOJE, sessao(2, "nutricao.editar"),
    );
    expect(await segunda).toBe("ok");
    definirGanchoTravaLeitura(null);
    const row = await linhaLeitura(criada.id);
    expect(Number(row.sobraKg)).toBe(9);
    expect(row.fazendaId).toBe(10);
    expect(await contar("nutricao_cocho_leituras")).toBe(1);
  });

  it("cancelamento e criação nova convivem sem apagar a linha", async () => {
    await limpar();
    const antiga = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    let nova: Promise<string> = Promise.resolve("");
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      nova = nutricaoCochoLeiturasService.criar(2, leitura({ hora: "18:00", sobraKg: 2 }), HOJE, sessao(2, "nutricao.criar"))
        .then((resultado) => `ok:${resultado.id}`)
        .catch((erro: { message?: string }) => erro.message ?? "");
      await pausa();
      expect((await linhaLeitura(antiga.id)).status).toBe("ativa");
    });
    await nutricaoCochoLeiturasService.cancelar(2, antiga.id, sessao(2, "nutricao.cancelar"));
    expect((await nova).startsWith("ok:")).toBe(true);
    definirGanchoTravaLeitura(null);
    expect((await linhaLeitura(antiga.id)).status).toBe("cancelada");
    expect(await contar("nutricao_cocho_leituras")).toBe(2);
  });

  it("cancelamento que vence impede a edição e conserva a sobra", async () => {
    await limpar();
    const criada = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    let edicao: Promise<string> = Promise.resolve("");
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      edicao = nutricaoCochoLeiturasService.editar(
        2, criada.id, leitura({ sobraKg: 1 }), HOJE, sessao(2, "nutricao.editar"),
      ).then(() => "ok").catch((erro: { message?: string }) => erro.message ?? "");
      await pausa();
      expect((await linhaLeitura(criada.id)).status).toBe("ativa");
      expect(Number((await linhaLeitura(criada.id)).sobraKg)).toBe(20);
    });
    await nutricaoCochoLeiturasService.cancelar(2, criada.id, sessao(2, "nutricao.cancelar"));
    expect(await edicao).toBe(MSG_LEITURA_NAO_EDITAR);
    definirGanchoTravaLeitura(null);
    expect((await linhaLeitura(criada.id)).status).toBe("cancelada");
    expect(Number((await linhaLeitura(criada.id)).sobraKg)).toBe(20);
  });

  it("dois cancelamentos deixam uma leitura cancelada", async () => {
    await limpar();
    const criada = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    let segundo: Promise<string> = Promise.resolve("");
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      segundo = texto(nutricaoCochoLeiturasService.cancelar(2, criada.id, sessao(2, "nutricao.cancelar")));
      await pausa();
      expect((await linhaLeitura(criada.id)).status).toBe("ativa");
    });
    await nutricaoCochoLeiturasService.cancelar(2, criada.id, sessao(2, "nutricao.cancelar"));
    expect(await segundo).toBe(MSG_LEITURA_CANCELADA);
    definirGanchoTravaLeitura(null);
    expect(await contar("nutricao_cocho_leituras")).toBe(1);
    expect((await linhaLeitura(criada.id)).status).toBe("cancelada");
  });

  it("renomear o cocho não reescreve a leitura que já estava gravada", async () => {
    await limpar();
    const antiga = await nutricaoCochoLeiturasService.criar(2, leitura({ hora: "09:00" }), HOJE, sessao(2, "nutricao.criar"));
    let nova: Promise<string> = Promise.resolve("");
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      nova = nutricaoCochoLeiturasService.criar(2, leitura({ hora: "18:00", sobraKg: 1 }), HOJE, sessao(2, "nutricao.criar"))
        .then(async (resultado) => (await linhaLeitura(resultado.id)).cochoNomeSnapshot ?? "");
      await pausa();
      const [cocho] = await pool.query("SELECT nome FROM nutricao_cochos WHERE id = 1");
      expect((cocho as Array<{ nome: string }>)[0].nome).toBe("Cocho Norte");
      expect((await linhaLeitura(antiga.id)).cochoNomeSnapshot).toBe("Cocho Norte (CN-1)");
    });
    await nutricaoCochosService.editar(2, 1, cochoInput({ nome: "Cocho Novo" }), sessao(2, "nutricao.editar"));
    expect(await nova).toBe("Cocho Novo (CN-1)");
    definirGanchoTravaLeitura(null);
    expect((await linhaLeitura(antiga.id)).cochoNomeSnapshot).toBe("Cocho Norte (CN-1)");
  });

  it("inativação que vence recusa a leitura nova", async () => {
    await limpar();
    let nova: Promise<string> = Promise.resolve("");
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      nova = texto(nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar")));
      await pausa();
      const [cocho] = await pool.query("SELECT status FROM nutricao_cochos WHERE id = 1");
      expect((cocho as Array<{ status: string }>)[0].status).toBe("ativo");
    });
    await nutricaoCochosService.inativar(2, 1, sessao(2, "nutricao.inativar"));
    expect(await nova).toBe(MSG_LEITURA_COCHO_INATIVO);
    definirGanchoTravaLeitura(null);
    expect(await contar("nutricao_cocho_leituras")).toBe(0);
  });

  it("leitura que vence permanece quando o cocho é inativado em seguida", async () => {
    await limpar();
    let baixa: Promise<string> = Promise.resolve("");
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      baixa = nutricaoCochosService.inativar(2, 1, sessao(2, "nutricao.inativar"))
        .then(() => "ok").catch((erro: { message?: string }) => erro.message ?? "");
      await pausa();
      const [cocho] = await pool.query("SELECT status FROM nutricao_cochos WHERE id = 1");
      expect((cocho as Array<{ status: string }>)[0].status).toBe("ativo");
    });
    const criada = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    expect(await baixa).toBe("ok");
    definirGanchoTravaLeitura(null);
    expect((await linhaLeitura(criada.id)).status).toBe("ativa");
    const [cocho] = await pool.query("SELECT status FROM nutricao_cochos WHERE id = 1");
    expect((cocho as Array<{ status: string }>)[0].status).toBe("inativo");
  });

  it("troca de pasto não altera a leitura histórica", async () => {
    await limpar();
    const antiga = await nutricaoCochoLeiturasService.criar(2, leitura({ hora: "09:00" }), HOJE, sessao(2, "nutricao.criar"));
    let nova: Promise<number> = Promise.resolve(0);
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      nova = nutricaoCochoLeiturasService.criar(2, leitura({ hora: "18:00", sobraKg: 1 }), HOJE, sessao(2, "nutricao.criar"))
        .then((resultado) => resultado.id);
      await pausa();
      const [cocho] = await pool.query("SELECT pastoId FROM nutricao_cochos WHERE id = 1");
      expect((cocho as Array<{ pastoId: number }>)[0].pastoId).toBe(1);
    });
    await nutricaoCochosService.editar(2, 1, cochoInput({ pastoId: 2 }), sessao(2, "nutricao.editar"));
    const idNova = await nova;
    definirGanchoTravaLeitura(null);
    const antes = await linhaLeitura(antiga.id);
    const depois = await linhaLeitura(idNova);
    expect(antes.cochoNomeSnapshot).toBe("Cocho Norte (CN-1)");
    expect(antes.fazendaId).toBe(10);
    expect(depois.cochoNomeSnapshot).toBe("Cocho Norte (CN-1)");
    expect(depois.fazendaId).toBe(10);
    const [cocho] = await pool.query("SELECT pastoId, fazendaId FROM nutricao_cochos WHERE id = 1");
    expect((cocho as Array<{ pastoId: number; fazendaId: number }>)[0]).toMatchObject({ pastoId: 2, fazendaId: 10 });
  });

  it("confirmação do trato baixa o estoque e a leitura não mexe na quantidade", async () => {
    await limpar();
    const prescricao = await nutricaoPlanejamentoService.criar(1, plano(), HOJE, sessao(1, "nutricao.criar"));
    let confirmacao: Promise<string> = Promise.resolve("");
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      confirmacao = nutricaoFornecimentosService.confirmar(2, "Ambos", {
        fazendaId: 10,
        loteId: 1,
        planejamentoId: prescricao.id,
        tipoOrigem: "produto",
        produtoId: 101,
        data: HOJE,
        quantidadeFornecidaKg: 10,
        chaveOperacao: `forn-${randomUUID()}`,
      }, HOJE, sessao(2, "nutricao.confirmar")).then(() => "ok").catch((erro: { message?: string }) => erro.message ?? "");
      await pausa(500);
      expect(await saldo()).toBe(100);
      expect(await contar("nutricao_fornecimentos")).toBe(0);
    });
    const criada = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    expect(await confirmacao).toBe("ok");
    definirGanchoTravaLeitura(null);
    expect(await saldo()).toBe(90);
    expect((await linhaLeitura(criada.id)).status).toBe("ativa");
    const [forns] = await pool.query(
      "SELECT userId, quantidadeFornecidaKg, custoTotalSnapshot, status FROM nutricao_fornecimentos",
    );
    expect((forns as Array<{ userId: number; quantidadeFornecidaKg: string; custoTotalSnapshot: string; status: string }>)[0])
      .toMatchObject({ userId: 1, quantidadeFornecidaKg: "10.000", custoTotalSnapshot: "50.00", status: "confirmado" });
  });

  it("estorno que vence impede vincular a leitura", async () => {
    await limpar();
    const forn = await inserirForn();
    let nova: Promise<string> = Promise.resolve("");
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      nova = texto(nutricaoCochoLeiturasService.criar(
        2, leitura({ fornecimentoId: forn }), HOJE, sessao(2, "nutricao.criar"),
      ));
      await pausa();
      expect((await custoForn(forn)).status).toBe("confirmado");
      expect(await contar("nutricao_cocho_leituras")).toBe(0);
    });
    await nutricaoFornecimentosService.estornar(
      2, "Ambos", { id: forn, motivo: "erro de campo" }, HOJE, sessao(2, "nutricao.estornar"),
    );
    expect(await nova).toBe(MSG_LEITURA_FORN_ESTORNADO);
    definirGanchoTravaLeitura(null);
    expect((await custoForn(forn)).status).toBe("estornado");
    expect((await custoForn(forn)).quantidadeFornecidaKg).toBe("100.000");
    expect(await contar("nutricao_cocho_leituras")).toBe(0);
    expect(await saldo()).toBe(100);
  });

  it("leitura que vence conserva o vínculo depois do estorno", async () => {
    await limpar();
    const forn = await inserirForn();
    let estorno: Promise<string> = Promise.resolve("");
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      estorno = nutricaoFornecimentosService.estornar(
        2, "Ambos", { id: forn, motivo: "erro de campo" }, HOJE, sessao(2, "nutricao.estornar"),
      ).then(() => "ok").catch((erro: { message?: string }) => erro.message ?? "");
      await pausa();
      expect((await custoForn(forn)).status).toBe("confirmado");
    });
    const criada = await nutricaoCochoLeiturasService.criar(
      2, leitura({ fornecimentoId: forn }), HOJE, sessao(2, "nutricao.criar"),
    );
    expect(await estorno).toBe("ok");
    definirGanchoTravaLeitura(null);
    const row = await linhaLeitura(criada.id);
    expect(row.fornecimentoId).toBe(forn);
    expect(row.alimentoNomeSnapshot).toBe("Milho");
    expect(Number(row.sobraKg)).toBe(20);
    expect((await custoForn(forn)).status).toBe("estornado");
    expect((await custoForn(forn)).quantidadeFornecidaKg).toBe("100.000");
    expect(await saldo()).toBe(100);
    expect(await texto(nutricaoCochoLeiturasService.criar(
      2, leitura({ fornecimentoId: forn, hora: "18:00" }), HOJE, sessao(2, "nutricao.criar"),
    ))).toBe(MSG_LEITURA_FORN_ESTORNADO);
  });

  it("permissão revogada barra a próxima leitura e conserva a já gravada", async () => {
    await limpar();
    let segunda: Promise<string> = Promise.resolve("");
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      segunda = nutricaoCochoLeiturasService.criar(2, leitura({ hora: "18:00", sobraKg: 4 }), HOJE, sessao(2, "nutricao.criar"))
        .then(() => "ok").catch((erro: { message?: string }) => erro.message ?? "");
      await pausa();
      expect(await contar("nutricao_cocho_leituras")).toBe(0);
    });
    const primeira = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    expect(await segunda).toBe("ok");
    definirGanchoTravaLeitura(null);
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = 'nutricao.criar'");
    expect(await texto(nutricaoCochoLeiturasService.criar(
      2, leitura({ hora: "19:00", sobraKg: 1 }), HOJE, sessao(2, "nutricao.criar"),
    ))).toBe(MSG_NUTRICAO_SEM_PERMISSAO);
    expect((await linhaLeitura(primeira.id)).userId).toBe(1);
    expect(await contar("nutricao_cocho_leituras")).toBe(2);
  });

  it("fazenda revogada barra a próxima leitura e conserva a já gravada", async () => {
    await limpar();
    const primeira = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 10");
    expect(await texto(nutricaoCochoLeiturasService.criar(
      2, leitura({ hora: "18:00" }), HOJE, sessao(2, "nutricao.criar"),
    ))).toBe(MSG_NUTRICAO_FAZENDA);
    expect(await texto(nutricaoCochoLeiturasService.listar(2, { fazendaId: 10 }, sessao(2, "nutricao.visualizar"))))
      .toBe(MSG_NUTRICAO_FAZENDA);
    expect((await linhaLeitura(primeira.id)).fazendaId).toBe(10);
    expect(await contar("nutricao_cocho_leituras")).toBe(1);
  });

  it("sessão revogada barra a próxima leitura e conserva a já gravada", async () => {
    await limpar();
    const primeira = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    await pool.query("UPDATE users SET sessionVersion = 2 WHERE id = 2");
    expect(await texto(nutricaoCochoLeiturasService.criar(
      2, leitura({ hora: "18:00" }), HOJE, sessao(2, "nutricao.criar"),
    ))).toBe("Sessão inválida.");
    expect(await texto(nutricaoCochoLeiturasService.obter(2, primeira.id, sessao(2, "nutricao.visualizar"))))
      .toBe("Sessão inválida.");
    expect((await linhaLeitura(primeira.id)).status).toBe("ativa");
  });

  it("falha antes do commit não deixa leitura pela metade", async () => {
    await limpar();
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      throw new Error("falha proposital");
    });
    expect(await texto(nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"))))
      .toContain("falha proposital");
    definirGanchoTravaLeitura(null);
    expect(await contar("nutricao_cocho_leituras")).toBe(0);
    expect(await saldo()).toBe(100);
  });

  it("disputa entre cocho e fornecimento desfaz o lado que perde", async () => {
    await limpar();
    const forn = await inserirForn();
    let esperaCocho: Promise<string> = Promise.resolve("pendente");
    let conn: mysql.Connection | null = null;
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      conn = await mysql.createConnection({
        host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
      });
      await conn.beginTransaction();
      await conn.query("SELECT id FROM nutricao_fornecimentos WHERE id = ? FOR UPDATE", [forn]);
      esperaCocho = conn.query("SELECT id FROM nutricao_cochos WHERE id = 1 FOR UPDATE")
        .then(() => "ok")
        .catch((erro: { errno?: number }) => erro.errno === 1213 ? "deadlock" : "outro");
      await pausa(400);
    });
    const resultado = await texto(nutricaoCochoLeiturasService.criar(
      2, leitura({ fornecimentoId: forn }), HOJE, sessao(2, "nutricao.criar"),
    ));
    const cocho = await esperaCocho;
    expect(resultado === MSG_ESTOQUE_DISPUTADO || cocho === "deadlock").toBe(true);
    const n = await contar("nutricao_cocho_leituras");
    if (resultado === MSG_ESTOQUE_DISPUTADO) expect(n).toBe(0);
    else expect(n).toBe(1);
    expect(await saldo()).toBe(100);
    expect((await custoForn(forn)).quantidadeFornecidaKg).toBe("100.000");
    try { await conn?.rollback(); } catch { /* a vítima já desfez */ }
    await conn?.end();
    definirGanchoTravaLeitura(null);
  }, 20_000);

  it("banco indisponível devolve erro e não completa a lista", async () => {
    const fechado = drizzle(mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada", database: "fd_teste_nao_conectar",
      connectTimeout: 1000,
    }), { schema, mode: "default" });
    definirBancoNutricaoCochoLeituras(fechado);
    try {
      await expect(nutricaoCochoLeiturasService.listar(1, { fazendaId: 10 }, sessao(1, "nutricao.visualizar")))
        .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: MSG_NUTRICAO_SEM_MYSQL });
      await expect(nutricaoCochoLeiturasService.criar(1, leitura(), HOJE, sessao(1, "nutricao.criar")))
        .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: MSG_NUTRICAO_SEM_MYSQL });
    } finally {
      usar(banco);
    }
  });

  it("leitura antiga do funcionário continua no clique e some da lista do titular", async () => {
    await limpar();
    await pool.query(
      `INSERT INTO nutricao_cocho_leituras
        (userId, fazendaId, cochoId, data, sobraKg, cochoNomeSnapshot, status)
       VALUES (2, 10, 1, ?, 6, 'Cocho Norte (CN-1)', 'ativa')`,
      [HOJE],
    );
    const lista = await nutricaoCochoLeiturasService.listar(2, { fazendaId: 10 }, sessao(2, "nutricao.visualizar"));
    expect(lista).toEqual([]);
    const [linhas] = await pool.query("SELECT id, userId FROM nutricao_cocho_leituras");
    const row = (linhas as Array<{ id: number; userId: number }>)[0];
    expect(row.userId).toBe(2);
    expect(await texto(nutricaoCochoLeiturasService.obter(2, row.id, sessao(2, "nutricao.visualizar"))))
      .toBe(MSG_LEITURA_NAO_ENCONTRADA);
    expect(await texto(nutricaoCochoLeiturasService.cancelar(2, row.id, sessao(2, "nutricao.cancelar"))))
      .toBe(MSG_LEITURA_NAO_ENCONTRADA);
    const [depois] = await pool.query("SELECT userId, status FROM nutricao_cocho_leituras WHERE id = ?", [row.id]);
    expect((depois as Array<{ userId: number; status: string }>)[0]).toMatchObject({ userId: 2, status: "ativa" });
  });
});
