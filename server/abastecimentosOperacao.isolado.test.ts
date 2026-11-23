import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { env } from "./_core/env";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { acoesAbastecimentoLista } from "../client/src/lib/listaExpansao";
import {
  abastecimentosOperacao,
  definirBancoAbastecimentos,
  definirGanchoTravaAbastecimento,
  MSG_ABAST_CHAVE_DIVERGENTE,
  MSG_ABAST_EDICAO_ECON,
  MSG_ABAST_FAZENDA,
  MSG_ABAST_FAZENDA_COMBUSTIVEL,
  MSG_ABAST_SEM_ESTRUTURA,
  MSG_ABAST_SEM_FAZENDA_MAQUINA,
  MSG_ABAST_SEM_MYSQL,
  MSG_ABAST_SEM_PERMISSAO,
  type CombustivelAbastecimento,
} from "./abastecimentosOperacao";
import {
  definirBancoMaquinas,
  definirGanchoTravaMaquina,
  maquinasOperacao,
  MSG_MAQUINA_COM_VINCULOS,
  MSG_MAQUINA_INATIVA,
  type SessaoMaquina,
  type SessaoOperacao,
} from "./maquinasOperacao";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4br-abast";
const PORTA = 3397;
const SENHA = "isolado-h4br";
const BANCO = "fd_h4br";

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
CREATE TABLE maquinas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NULL,
  nome varchar(100) NOT NULL, tipo varchar(50) NULL, marca varchar(100) NULL,
  modelo varchar(100) NULL, ano int NULL, anoAquisicao int NULL, dataAquisicao date NULL,
  placa varchar(50) NULL, horimetro varchar(50) NULL, tipoMedidor varchar(30) NULL,
  valor decimal(12,2) NULL, vidaUtil varchar(50) NULL, dataDesativacao date NULL,
  estado varchar(20) NULL, status enum('ativo','manutencao','inativo') DEFAULT 'ativo',
  imagem1 text NULL, imagem2 text NULL, imagem3 text NULL, observacoes text NULL,
  createdAt timestamp NULL, updatedAt timestamp NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE abastecimentos (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, maquinaId int NOT NULL,
  data date NOT NULL, combustivel enum('diesel','gasolina','etanol','arla') NOT NULL,
  litros decimal(8,2) NOT NULL, valorLitro decimal(8,3) NULL, valorTotal decimal(10,2) NULL,
  horimetro varchar(50) NULL, responsavel varchar(200) NULL,
  abastecidoNaFazenda tinyint(1) NULL, fazendaId int NULL, movimentacaoEstoqueId int NULL,
  status varchar(20) NULL, fornecedor varchar(200) NULL, observacoes text NULL,
  chaveOperacao varchar(80) NULL, createdAt timestamp NULL, PRIMARY KEY (id),
  UNIQUE KEY abastecimentos_chave_operacao_uq (userId, chaveOperacao)
) ENGINE=InnoDB;
CREATE TABLE manutencoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, maquinaId int NOT NULL,
  data date NOT NULL, tipo varchar(50) NOT NULL, status varchar(50) NULL,
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
`;

function sessao(executorId: number, permissaoId: SessaoOperacao["permissaoId"], versao: number | null = 1): SessaoOperacao {
  return { executorId, sessionVersionDaSessao: versao, permissaoId };
}

function sessaoMaquina(executorId: number, permissaoId: SessaoMaquina["permissaoId"]): SessaoMaquina {
  return { executorId, sessionVersionDaSessao: 1, permissaoId };
}

function pedido(maquinaId: number, chave: string, extra: Record<string, unknown> = {}) {
  return {
    maquinaId,
    data: "2026-11-22",
    combustivel: "diesel" as CombustivelAbastecimento,
    litros: 2,
    valorLitro: "5.000",
    valorTotal: "10.00",
    abastecidoNaFazenda: true,
    fazendaId: maquinaId === 41 ? 20 : 10,
    chaveOperacao: chave,
    registradoPor: "Ambos",
    ...extra,
  };
}

function pausa() {
  return new Promise((resolver) => setTimeout(resolver, 450));
}

describe("contrato da tela de abastecimento", () => {
  it("a lista não oferece exclusão e o cadastro manda a chave da operação", () => {
    expect(acoesAbastecimentoLista({ abastecidoNaFazenda: false, status: "registrado" }).podeExcluir).toBe(false);
    expect(acoesAbastecimentoLista({ abastecidoNaFazenda: true, fazendaId: 10, status: "registrado" }).podeExcluir).toBe(false);
    const tela = readFileSync(new URL("../client/src/pages/AbastecimentoFormPage.tsx", import.meta.url), "utf8");
    expect(tela).toContain("chaveOperacao");
    const rotas = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const inicio = rotas.indexOf("const abastecimentosRouter");
    const fim = rotas.indexOf("MANUTENCOES ROUTER", inicio);
    const bloco = rotas.slice(inicio, fim);
    expect(bloco).toContain("abastecimentosOperacao");
    expect(bloco).not.toContain("listLocalAbastecimentos");
    expect(bloco).not.toContain("localFallback");
    expect(bloco).not.toContain("getLocalAbastecimento");
  });
});

describe.sequential("abastecimentos no mysql descartável", () => {
  let pool: mysql.Pool;
  let banco: ReturnType<typeof drizzle<typeof schema>>;

  async function contar(tabela = "abastecimentos") {
    const [linhas] = await pool.query(`SELECT COUNT(*) AS n FROM ${tabela}`);
    return Number((linhas as Array<{ n: number }>)[0]?.n);
  }

  async function saldo(id = 70) {
    const [linhas] = await pool.query("SELECT quantidade FROM estoque WHERE id = ?", [id]);
    return Number((linhas as Array<{ quantidade: string }>)[0]?.quantidade);
  }

  async function limpar() {
    definirGanchoTravaAbastecimento(null);
    definirGanchoTravaMaquina(null);
    await pool.query("DELETE FROM estoque_movimentacoes");
    await pool.query("DELETE FROM abastecimentos");
    await pool.query("DELETE FROM manutencoes");
    await pool.query("DELETE FROM maquinas");
    await pool.query("DELETE FROM estoque");
    await pool.query("UPDATE users SET sessionVersion = 1, situacao = 'ativo'");
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'abastecimentos.visualizar', 1),
        (2, 1, 'abastecimentos.criar', 1),
        (2, 1, 'abastecimentos.editar', 1),
        (2, 1, 'abastecimentos.inativar', 1),
        (2, 1, 'abastecimentos.estornar', 1),
        (2, 1, 'maquinas.editar', 1),
        (2, 1, 'maquinas.inativar', 1),
        (5, 1, 'abastecimentos.visualizar', 1)
    `);
    await pool.query("DELETE FROM usuario_fazendas");
    await pool.query(`
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
        (2, 10, 1), (2, 20, 1), (5, 10, 1)
    `);
    await pool.query(`
      INSERT INTO maquinas (id, userId, fazendaId, nome, status) VALUES
        (40, 1, 10, 'Trator Norte', 'ativo'),
        (41, 1, 20, 'Trator Sul', 'ativo'),
        (42, 1, NULL, 'Sem fazenda', 'ativo'),
        (43, 3, 30, 'Alheia', 'ativo'),
        (44, 1, 10, 'Plantadeira', 'ativo')
    `);
    await pool.query(`
      INSERT INTO estoque (id, fazenda_id, nome, categoria, unidade, quantidade, controlar_saldo, valor_unitario, situacao)
      VALUES (70, 10, 'Diesel S10', 'Combustíveis', 'L', 10, 1, 5, 'ativo'),
             (71, 20, 'Diesel S10', 'Combustíveis', 'L', 10, 1, 8, 'ativo')
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
            (5, 'f5', 'Uma', 'user', 'comum', 1, 'ativo', 1);
          INSERT INTO fazendas (id, userId, nome) VALUES
            (10, 1, 'Norte'), (20, 1, 'Sul'), (30, 3, 'Alheia');
        `);
        await conn.end();
        pool = mysql.createPool({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, connectionLimit: 8,
        });
        banco = drizzle(pool, { schema, mode: "default" });
        definirBancoAbastecimentos(banco);
        definirBancoMaquinas(banco);
        return;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    throw new Error(ultimo || "MySQL descartável não subiu.");
  }, 120_000);

  afterAll(async () => {
    definirGanchoTravaAbastecimento(null);
    definirGanchoTravaMaquina(null);
    definirBancoAbastecimentos(null);
    definirBancoMaquinas(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  beforeEach(limpar);

  it("grava o abastecimento no titular e na fazenda da máquina", async () => {
    const gravado = await abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(40, "abast-norte-0001"));
    const [linhas] = await pool.query(
      "SELECT userId, fazendaId, litros, valorTotal, status FROM abastecimentos WHERE id = ?",
      [gravado.id],
    );
    expect((linhas as Array<{ userId: number; fazendaId: number; status: string }>)[0]).toMatchObject({
      userId: 1, fazendaId: 10, status: "registrado",
    });
    expect(await saldo()).toBe(8);
    expect(await contar("estoque_movimentacoes")).toBe(1);
  });

  it("funcionário sem permissão, sem fazenda ou de outra conta não grava", async () => {
    await expect(abastecimentosOperacao.criar(sessao(5, "abastecimentos.criar"), pedido(40, "abast-sem-perm01"))).rejects.toThrow(MSG_ABAST_SEM_PERMISSAO);
    await expect(abastecimentosOperacao.criar(sessao(5, "abastecimentos.visualizar"), pedido(41, "abast-sem-faz001"))).rejects.toThrow();
    await expect(abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(43, "abast-alheia-001"))).rejects.toThrow();
    expect(await contar()).toBe(0);
    expect(await saldo()).toBe(10);
  });

  it("máquina sem fazenda e combustível de outra fazenda não gravam", async () => {
    await expect(abastecimentosOperacao.criar(sessao(1, "abastecimentos.criar"), pedido(42, "abast-sem-faz-m1", { fazendaId: null }))).rejects.toThrow(MSG_ABAST_SEM_FAZENDA_MAQUINA);
    await expect(abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(40, "abast-outra-faz1", { fazendaId: 20 }))).rejects.toThrow(MSG_ABAST_FAZENDA_COMBUSTIVEL);
    expect(await contar()).toBe(0);
    expect(await saldo()).toBe(10);
    expect(await saldo(71)).toBe(10);
  });

  it("histórico sem fazenda e lançamento no identificador do funcionário ficam de fora da lista do funcionário", async () => {
    await pool.query(`
      INSERT INTO abastecimentos (userId, maquinaId, data, combustivel, litros, fazendaId, status, abastecidoNaFazenda)
      VALUES (1, 40, '2020-01-01', 'diesel', 3, NULL, 'registrado', 0),
             (2, 40, '2020-02-01', 'diesel', 4, 10, 'registrado', 0)
    `);
    const principal = await abastecimentosOperacao.listar(sessao(1, "abastecimentos.visualizar"));
    expect(principal.some((linha) => linha.historicoSemFazenda)).toBe(true);
    const funcionario = await abastecimentosOperacao.listar(sessao(5, "abastecimentos.visualizar"));
    expect(funcionario).toHaveLength(0);
    const [antigo] = await pool.query("SELECT userId FROM abastecimentos WHERE userId = 2");
    expect((antigo as unknown[]).length).toBe(1);
    const pendencias = await abastecimentosOperacao.pendenciasSemFazenda(sessao(1, "abastecimentos.visualizar"));
    expect(pendencias).toHaveLength(1);
  });

  it("lista e detalhe seguem a fazenda do lançamento", async () => {
    const norte = await abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(40, "abast-lista-0001"));
    await abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(41, "abast-lista-0002", { litros: 1, valorTotal: "5.00" }));
    const daUma = await abastecimentosOperacao.listar(sessao(5, "abastecimentos.visualizar"));
    expect(daUma.map((linha) => linha.id)).toEqual([norte.id]);
    await expect(abastecimentosOperacao.obter(sessao(5, "abastecimentos.visualizar"), norte.id + 1)).rejects.toThrow();
    expect(await saldo()).toBe(8);
  });

  it("reenvio da mesma chave não duplica e conteúdo diferente é recusado", async () => {
    const primeira = await abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(40, "abast-reenvio-01"));
    const segunda = await abastecimentosOperacao.criar(sessao(1, "abastecimentos.criar"), pedido(40, "abast-reenvio-01"));
    expect(segunda).toMatchObject({ id: primeira.id, repetida: true });
    await expect(abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(40, "abast-reenvio-01", { litros: 4, valorTotal: "20.00" }))).rejects.toThrow(MSG_ABAST_CHAVE_DIVERGENTE);
    expect(await contar()).toBe(1);
    expect(await saldo()).toBe(8);
  });

  it("compra externa não baixa o estoque e guarda a fazenda da máquina", async () => {
    const gravado = await abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(40, "abast-externo-01", {
      abastecidoNaFazenda: false,
      fornecedor: "Posto da Vila",
    }));
    expect(gravado.fazendaId).toBe(10);
    expect(await saldo()).toBe(10);
    expect(await contar("estoque_movimentacoes")).toBe(0);
    await expect(abastecimentosOperacao.estornar(sessao(2, "abastecimentos.estornar"), gravado.id, "Posto", "Ambos")).rejects.toThrow(/Estoque da Fazenda|histórico/i);
  });

  it("edição muda o texto e conserva litros, custo e fazenda", async () => {
    const gravado = await abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(40, "abast-editar-001"));
    await pool.query("UPDATE estoque SET valor_unitario = 99 WHERE id = 70");
    await abastecimentosOperacao.editar(sessao(2, "abastecimentos.editar"), gravado.id, {
      ...pedido(40, "ignorada"),
      horimetro: "1200",
      observacoes: "Leitura corrigida",
    });
    const detalhe = await abastecimentosOperacao.obter(sessao(1, "abastecimentos.visualizar"), gravado.id);
    expect(detalhe.observacoes).toBe("Leitura corrigida");
    expect(detalhe.horimetro).toBe("1200");
    expect(Number(detalhe.valorTotal)).toBe(10);
    expect(detalhe.fazendaId).toBe(10);
    await expect(abastecimentosOperacao.editar(sessao(2, "abastecimentos.editar"), gravado.id, {
      ...pedido(40, "ignorada", { litros: 6, valorTotal: "30.00" }),
    })).rejects.toThrow(MSG_ABAST_EDICAO_ECON);
    expect(await saldo()).toBe(8);
  });

  it("exclusão física fica bloqueada e o estorno devolve o combustível uma vez", async () => {
    const gravado = await abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(40, "abast-estorno-01", { litros: 4, valorTotal: "20.00" }));
    await expect(abastecimentosOperacao.excluir(sessao(2, "abastecimentos.inativar"), gravado.id)).rejects.toThrow(/histórico/i);
    await abastecimentosOperacao.estornar(sessao(2, "abastecimentos.estornar"), gravado.id, "Litros errados", "Ambos");
    const deNovo = await abastecimentosOperacao.estornar(sessao(1, "abastecimentos.estornar"), gravado.id, "De novo", "Principal");
    expect(deNovo.alreadyEstornado).toBe(true);
    expect(await saldo()).toBe(10);
    expect(await contar()).toBe(1);
    const detalhe = await abastecimentosOperacao.obter(sessao(1, "abastecimentos.visualizar"), gravado.id);
    expect(detalhe.status).toBe("estornado");
    expect(Number(detalhe.valorTotal)).toBe(20);
  });

  it("dois abastecimentos no mesmo combustível não deixam saldo negativo", async () => {
    let outra: Promise<unknown> = Promise.resolve();
    definirGanchoTravaAbastecimento(async () => {
      outra = abastecimentosOperacao.criar(sessao(1, "abastecimentos.criar"), pedido(44, "abast-concorr-02", { litros: 8, valorTotal: "40.00" })).catch((erro) => erro);
      await pausa();
    });
    await abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(40, "abast-concorr-01", { litros: 8, valorTotal: "40.00" })).catch(() => undefined);
    await outra;
    expect(await contar()).toBe(1);
    expect(await saldo()).toBe(2);
  });

  it("saldo insuficiente não grava abastecimento", async () => {
    await expect(abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(40, "abast-saldo-0001", { litros: 11, valorTotal: "55.00" }))).rejects.toThrow(/insuficiente/i);
    expect(await contar()).toBe(0);
    expect(await saldo()).toBe(10);
  });

  it("criação contra exclusão, transferência e inativação preserva a fazenda do lançamento", async () => {
    let exclusao: Promise<unknown> = Promise.resolve();
    definirGanchoTravaAbastecimento(async () => {
      exclusao = maquinasOperacao.excluir(sessaoMaquina(2, "maquinas.inativar"), 40).catch((erro) => erro);
      await pausa();
    });
    await abastecimentosOperacao.criar(sessao(1, "abastecimentos.criar"), pedido(40, "abast-contra-del")).catch(() => undefined);
    await exclusao;
    const [ainda] = await pool.query("SELECT id FROM maquinas WHERE id = 40");
    if ((await contar()) === 1) {
      expect((ainda as unknown[]).length).toBe(1);
      await expect(maquinasOperacao.excluir(sessaoMaquina(1, "maquinas.inativar"), 40)).rejects.toThrow(MSG_MAQUINA_COM_VINCULOS);
    } else {
      expect((ainda as unknown[]).length).toBe(0);
    }

    await limpar();
    const gravado = await abastecimentosOperacao.criar(sessao(1, "abastecimentos.criar"), pedido(40, "abast-transf-001"));
    await maquinasOperacao.editar(
      sessaoMaquina(1, "maquinas.editar"),
      40,
      { fazendaId: 20 },
      { nome: "Trator Norte", placa: null, fazendaId: 20 },
    );
    const detalhe = await abastecimentosOperacao.obter(sessao(1, "abastecimentos.visualizar"), gravado.id);
    expect(detalhe.fazendaId).toBe(10);
    expect(Number(detalhe.valorTotal)).toBe(10);
    expect(await abastecimentosOperacao.listar(sessao(5, "abastecimentos.visualizar"))).toHaveLength(1);
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 10");
    await expect(abastecimentosOperacao.obter(sessao(2, "abastecimentos.visualizar"), gravado.id)).rejects.toThrow();
    await pool.query("UPDATE abastecimentos SET fazendaId = NULL WHERE id = ?", [gravado.id]);
    await expect(maquinasOperacao.editar(
      sessaoMaquina(1, "maquinas.editar"),
      40,
      { fazendaId: 10 },
      { nome: "Trator Norte", placa: null, fazendaId: 10 },
    )).resolves.toBeTruthy();

    await pool.query("UPDATE maquinas SET status = 'inativo' WHERE id = 41");
    await expect(abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(41, "abast-inativa-01"))).rejects.toThrow(MSG_MAQUINA_INATIVA);
  });

  it("dois estornos e edição contra estorno deixam um lançamento só", async () => {
    const gravado = await abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(40, "abast-dois-est1"));
    let outro: Promise<unknown> = Promise.resolve();
    definirGanchoTravaAbastecimento(async () => {
      outro = abastecimentosOperacao.estornar(sessao(1, "abastecimentos.estornar"), gravado.id, "Outro", "Principal").catch((erro) => erro);
      await pausa();
    });
    await abastecimentosOperacao.estornar(sessao(2, "abastecimentos.estornar"), gravado.id, "Primeiro", "Ambos");
    await outro;
    expect((await abastecimentosOperacao.obter(sessao(1, "abastecimentos.visualizar"), gravado.id)).status).toBe("estornado");
    expect(await saldo()).toBe(10);

    const aberto = await abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(40, "abast-edit-est1"));
    let estorno: Promise<unknown> = Promise.resolve();
    definirGanchoTravaAbastecimento(async () => {
      estorno = abastecimentosOperacao.estornar(sessao(1, "abastecimentos.estornar"), aberto.id, "Cancela", "Principal").catch((erro) => erro);
      await pausa();
    });
    await abastecimentosOperacao.editar(sessao(2, "abastecimentos.editar"), aberto.id, {
      ...pedido(40, "ignorada"),
      observacoes: "Ajuste",
    }).catch(() => undefined);
    await estorno;
    const final = await abastecimentosOperacao.obter(sessao(1, "abastecimentos.visualizar"), aberto.id);
    expect(final.status === "estornado" || final.observacoes === "Ajuste").toBe(true);
    expect(Number(final.litros)).toBe(2);
  });

  it("permissão, fazenda e sessão revogadas não gravam", async () => {
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2");
    await expect(abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(40, "abast-revoga-per"))).rejects.toThrow(MSG_ABAST_SEM_PERMISSAO);
    await limpar();
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2");
    await expect(abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(40, "abast-revoga-faz"))).rejects.toThrow(MSG_ABAST_FAZENDA);
    await pool.query("UPDATE users SET sessionVersion = 4 WHERE id = 2");
    await expect(abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedido(40, "abast-revoga-ses"))).rejects.toThrow(/Sessão/);
    expect(await contar()).toBe(0);
  });

  it("falha antes do commit e coluna ausente não deixam lançamento", async () => {
    definirGanchoTravaAbastecimento(async () => {
      throw new Error("parou");
    });
    await expect(abastecimentosOperacao.criar(sessao(1, "abastecimentos.criar"), pedido(40, "abast-rollback01"))).rejects.toThrow(/parou/);
    expect(await contar()).toBe(0);
    expect(await saldo()).toBe(10);
    await pool.query("ALTER TABLE abastecimentos DROP INDEX abastecimentos_chave_operacao_uq");
    await expect(abastecimentosOperacao.criar(sessao(1, "abastecimentos.criar"), pedido(40, "abast-sem-idx001"))).rejects.toThrow(MSG_ABAST_SEM_ESTRUTURA);
    expect(await contar()).toBe(0);
  });

  it("banco indisponível não grava no arquivo", async () => {
    const fechado = drizzle(mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada", database: "fd_teste_nao_conectar",
    }), { schema, mode: "default" });
    definirBancoAbastecimentos(fechado);
    await expect(abastecimentosOperacao.criar(sessao(1, "abastecimentos.criar"), pedido(40, "abast-sem-mysql1"))).rejects.toThrow(MSG_ABAST_SEM_MYSQL);
    definirBancoAbastecimentos(banco);
    expect(await contar()).toBe(0);
  });
});
