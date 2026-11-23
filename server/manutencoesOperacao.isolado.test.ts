import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { env } from "./_core/env";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { acoesMenuManutencao } from "../shared/manutencaoAcoes";
import { MSG_MANUT_EDICAO_PATRIMONIAL, MSG_MANUT_NAO_ENCONTRADA } from "../shared/manutencaoEstoque";
import {
  definirBancoManutencoes,
  definirGanchoTravaManutencao,
  manutencoesOperacao,
  MSG_MANUT_CHAVE_DIVERGENTE,
  MSG_MANUT_FAZENDA,
  MSG_MANUT_MAQUINA_FAZENDA,
  MSG_MANUT_SEM_ESTRUTURA,
  MSG_MANUT_SEM_FAZENDA_MAQUINA,
  MSG_MANUT_SEM_MYSQL,
  MSG_MANUT_SEM_PERMISSAO,
} from "./manutencoesOperacao";
import {
  definirBancoMaquinas,
  definirGanchoTravaMaquina,
  maquinasOperacao,
  MSG_MAQUINA_COM_VINCULOS,
  MSG_MAQUINA_INATIVA,
  MSG_MAQUINA_NAO_ENCONTRADA,
  MSG_MAQUINA_TRANSFERENCIA,
  type SessaoMaquina,
} from "./maquinasOperacao";
import type { SessaoOperacao } from "./maquinasOperacao";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bq-manut";
const PORTA = 3395;
const SENHA = "isolado-h4bq";
const BANCO = "fd_h4bq";

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
  litros decimal(8,2) NOT NULL, fazendaId int NULL, valorTotal decimal(10,2) NULL,
  status varchar(20) NULL, createdAt timestamp NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE manutencoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, maquinaId int NOT NULL,
  fazendaId int NULL, tipo varchar(50) NOT NULL, descricao text NULL, data date NOT NULL,
  custo decimal(10,2) NULL, horimetro varchar(50) NULL, proximaManutencao date NULL,
  status varchar(50) NULL, prestadorNome varchar(200) NULL, prestadorContato varchar(100) NULL,
  prestadorPessoaId int NULL, tipoExecucao varchar(20) NULL, valorMaoObra decimal(10,2) NULL,
  valorPecas decimal(10,2) NULL, valorPecasOficina decimal(10,2) NULL,
  valorCobradoOficina decimal(10,2) NULL, valorTotal decimal(10,2) NULL,
  chaveOperacao varchar(80) NULL, observacoes text NULL, estornadoEm timestamp NULL,
  motivoEstorno text NULL, oficina varchar(200) NULL, createdAt timestamp NULL,
  updatedAt timestamp NULL, PRIMARY KEY (id),
  UNIQUE KEY manutencoes_chave_operacao_uq (userId, chaveOperacao),
  KEY manutencoes_user_fazenda_idx (userId, fazendaId)
) ENGINE=InnoDB;
CREATE TABLE manutencao_pecas (
  id int NOT NULL AUTO_INCREMENT, manutencaoId int NOT NULL, estoqueId int NULL,
  nome varchar(200) NOT NULL, quantidade decimal(10,2) NOT NULL, valorUnitario decimal(10,2) NOT NULL,
  valorTotal decimal(10,2) NOT NULL, estoqueMovimentacaoId int NULL, origem varchar(20) NULL,
  createdAt timestamp NULL, PRIMARY KEY (id)
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
    tipo: "Revisao",
    descricao: "Troca de óleo",
    data: "2026-11-22",
    tipoExecucao: "interna" as const,
    valorMaoObra: 0,
    pecas: [],
    pecasOficina: [],
    chaveOperacao: chave,
    registradoPor: "Ambos",
    ...extra,
  };
}

function pausa() {
  return new Promise((resolver) => setTimeout(resolver, 450));
}

describe("contrato da tela de manutenção", () => {
  it("a lista não oferece exclusão e o cadastro manda a chave da operação", () => {
    expect(acoesMenuManutencao("agendada").podeExcluir).toBe(false);
    expect(acoesMenuManutencao("concluida").podeExcluir).toBe(false);
    const tela = readFileSync(new URL("../client/src/pages/ManutencaoFormPage.tsx", import.meta.url), "utf8");
    expect(tela).toContain("chaveOperacao");
    const rotas = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const inicio = rotas.indexOf("const manutencoesRouter");
    const fim = rotas.indexOf("PESAGENS ROUTER", inicio);
    const bloco = rotas.slice(inicio, fim);
    expect(bloco).toContain("manutencoesOperacao");
    expect(bloco).not.toContain("listLocalManutencoes");
    expect(bloco).not.toContain("localFallback");
    expect(bloco).not.toContain("getLocalManutencao");
  });
});

describe.sequential("manutenções no mysql descartável", () => {
  let pool: mysql.Pool;
  let banco: ReturnType<typeof drizzle<typeof schema>>;

  async function contar(tabela = "manutencoes") {
    const [linhas] = await pool.query(`SELECT COUNT(*) AS n FROM ${tabela}`);
    return Number((linhas as Array<{ n: number }>)[0]?.n);
  }

  async function saldo(id = 70) {
    const [linhas] = await pool.query("SELECT quantidade FROM estoque WHERE id = ?", [id]);
    return Number((linhas as Array<{ quantidade: string }>)[0]?.quantidade);
  }

  async function limpar() {
    definirGanchoTravaManutencao(null);
    definirGanchoTravaMaquina(null);
    await pool.query("DELETE FROM estoque_movimentacoes");
    await pool.query("DELETE FROM manutencao_pecas");
    await pool.query("DELETE FROM abastecimentos");
    await pool.query("DELETE FROM manutencoes");
    await pool.query("DELETE FROM maquinas");
    await pool.query("DELETE FROM estoque");
    await pool.query("UPDATE users SET sessionVersion = 1, situacao = 'ativo'");
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'manutencoes.visualizar', 1),
        (2, 1, 'manutencoes.criar', 1),
        (2, 1, 'manutencoes.editar', 1),
        (2, 1, 'manutencoes.inativar', 1),
        (2, 1, 'manutencoes.estornar', 1),
        (2, 1, 'maquinas.editar', 1),
        (2, 1, 'maquinas.inativar', 1),
        (5, 1, 'manutencoes.visualizar', 1)
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
      INSERT INTO estoque (id, fazenda_id, nome, unidade, quantidade, controlar_saldo, valor_unitario, situacao)
      VALUES (70, 10, 'Filtro', 'un', 10, 1, 5, 'ativo'),
             (71, 20, 'Filtro Sul', 'un', 10, 1, 8, 'ativo')
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
        definirBancoManutencoes(banco);
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
    definirGanchoTravaManutencao(null);
    definirGanchoTravaMaquina(null);
    definirBancoManutencoes(null);
    definirBancoMaquinas(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  beforeEach(limpar);

  it("grava a manutenção no titular e na fazenda da máquina", async () => {
    const gravado = await manutencoesOperacao.criar(
      sessao(2, "manutencoes.criar"),
      pedido(40, "chave-norte-0001"),
    );
    const [linhas] = await pool.query("SELECT userId, fazendaId, custo, status FROM manutencoes WHERE id = ?", [gravado.id]);
    const linha = (linhas as Array<{ userId: number; fazendaId: number; custo: string; status: string }>)[0];
    expect(linha.userId).toBe(1);
    expect(linha.fazendaId).toBe(10);
    expect(linha.status).toBe("concluida");
    expect(Number(linha.custo)).toBe(0);
  });

  it("funcionário sem permissão, sem fazenda ou de outra conta não grava", async () => {
    await expect(manutencoesOperacao.criar(sessao(5, "manutencoes.criar"), pedido(40, "chave-sem-perm-01"))).rejects.toThrow(MSG_MANUT_SEM_PERMISSAO);
    await expect(manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(41, "chave-sul-negada1"))).resolves.toMatchObject({ fazendaId: 20 });
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 20");
    await expect(manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(41, "chave-sul-negada2"))).rejects.toThrow(MSG_MANUT_FAZENDA);
    await expect(manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(43, "chave-alheia-0001"))).rejects.toThrow(MSG_MAQUINA_NAO_ENCONTRADA);
    await expect(manutencoesOperacao.criar(sessao(3, "manutencoes.criar"), pedido(40, "chave-outro-00001"))).rejects.toThrow(MSG_MAQUINA_NAO_ENCONTRADA);
    expect(await contar()).toBe(1);
  });

  it("máquina sem fazenda não recebe manutenção nova", async () => {
    await expect(manutencoesOperacao.criar(sessao(1, "manutencoes.criar"), pedido(42, "chave-sem-faz-001"))).rejects.toThrow(MSG_MANUT_SEM_FAZENDA_MAQUINA);
    expect(await contar()).toBe(0);
  });

  it("histórico antigo sem fazenda fica só com o titular", async () => {
    await pool.query(`
      INSERT INTO manutencoes (userId, maquinaId, fazendaId, tipo, descricao, data, status, custo)
      VALUES (1, 40, NULL, 'Revisao', 'Antiga', '2020-01-01', 'concluida', 80)
    `);
    const doFuncionario = await manutencoesOperacao.listar(sessao(2, "manutencoes.visualizar"));
    expect(doFuncionario.every((linha) => linha.historicoSemFazenda === false)).toBe(true);
    expect(doFuncionario.find((linha) => linha.descricao === "Antiga")).toBeUndefined();
    const doTitular = await manutencoesOperacao.listar(sessao(1, "manutencoes.visualizar"));
    const antiga = doTitular.find((linha) => linha.descricao === "Antiga");
    expect(antiga?.historicoSemFazenda).toBe(true);
    expect(antiga?.fazendaId).toBeNull();
    const id = Number(antiga?.id);
    await expect(manutencoesOperacao.obter(sessao(2, "manutencoes.visualizar"), id)).rejects.toThrow(MSG_MANUT_NAO_ENCONTRADA);
    const [ainda] = await pool.query("SELECT fazendaId FROM manutencoes WHERE id = ?", [id]);
    expect((ainda as Array<{ fazendaId: number | null }>)[0]?.fazendaId).toBeNull();
  });

  it("lista, detalhe e peças seguem a fazenda concedida", async () => {
    const norte = await manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(40, "chave-lista-0001", {
      pecas: [{ estoqueId: 70, nome: "Filtro", quantidade: 2, valorUnitario: 5 }],
    }));
    await manutencoesOperacao.criar(sessao(1, "manutencoes.criar"), pedido(41, "chave-lista-0002"));
    const lista = await manutencoesOperacao.listar(sessao(5, "manutencoes.visualizar"));
    expect(lista.map((linha) => linha.fazendaId)).toEqual([10]);
    const detalhe = await manutencoesOperacao.obter(sessao(5, "manutencoes.visualizar"), norte.id);
    expect(detalhe.pecas).toHaveLength(1);
    expect(Number(detalhe.custo)).toBe(10);
    const pecas = await manutencoesOperacao.listarPecas(sessao(5, "manutencoes.visualizar"), norte.id);
    expect(pecas).toHaveLength(1);
    await expect(manutencoesOperacao.obter(sessao(5, "manutencoes.visualizar"), norte.id + 1)).rejects.toThrow();
    expect(await saldo()).toBe(8);
  });

  it("peça de outra fazenda não baixa saldo", async () => {
    await expect(manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(40, "chave-peca-sul-01", {
      pecas: [{ estoqueId: 71, nome: "Filtro Sul", quantidade: 1, valorUnitario: 8 }],
    }))).rejects.toThrow(/fazenda/);
    expect(await contar()).toBe(0);
    expect(await saldo(71)).toBe(10);
  });

  it("reenvio da mesma chave não duplica e outra chave lança outra", async () => {
    const primeira = await manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(40, "chave-reenvio-01"));
    const segunda = await manutencoesOperacao.criar(sessao(1, "manutencoes.criar"), pedido(40, "chave-reenvio-01"));
    expect(segunda).toMatchObject({ id: primeira.id, repetida: true });
    await manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(40, "chave-reenvio-02"));
    expect(await contar()).toBe(2);
    await expect(manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(41, "chave-reenvio-01"))).rejects.toThrow(MSG_MANUT_CHAVE_DIVERGENTE);
  });

  it("edição muda o texto e conserva o custo da peça", async () => {
    const gravado = await manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(40, "chave-editar-0001", {
      pecas: [{ estoqueId: 70, nome: "Filtro", quantidade: 2, valorUnitario: 5 }],
    }));
    await pool.query("UPDATE estoque SET valor_unitario = 99 WHERE id = 70");
    await manutencoesOperacao.editar(sessao(2, "manutencoes.editar"), gravado.id, {
      ...pedido(40, "ignorada", { descricao: "Texto novo" }),
      pecas: [{ estoqueId: 70, nome: "Filtro", quantidade: 2, valorUnitario: 99 }],
    });
    const detalhe = await manutencoesOperacao.obter(sessao(1, "manutencoes.visualizar"), gravado.id);
    expect(detalhe.descricao).toBe("Texto novo");
    expect(Number(detalhe.custo)).toBe(10);
    expect(detalhe.fazendaId).toBe(10);
  });

  it("edição não troca a quantidade já baixada nem a fazenda", async () => {
    const gravado = await manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(40, "chave-qtd-000001", {
      pecas: [{ estoqueId: 70, nome: "Filtro", quantidade: 2, valorUnitario: 5 }],
    }));
    await expect(manutencoesOperacao.editar(sessao(2, "manutencoes.editar"), gravado.id, {
      ...pedido(40, "ignorada"),
      pecas: [{ estoqueId: 70, nome: "Filtro", quantidade: 9, valorUnitario: 5 }],
    })).rejects.toThrow(MSG_MANUT_EDICAO_PATRIMONIAL);
    await expect(manutencoesOperacao.editar(sessao(2, "manutencoes.editar"), gravado.id, pedido(41, "ignorada"))).rejects.toThrow(MSG_MANUT_MAQUINA_FAZENDA);
    expect(await saldo()).toBe(8);
    const [linha] = await pool.query("SELECT fazendaId, maquinaId FROM manutencoes WHERE id = ?", [gravado.id]);
    expect((linha as Array<{ fazendaId: number; maquinaId: number }>)[0]).toMatchObject({ fazendaId: 10, maquinaId: 40 });
  });

  it("exclusão física fica bloqueada e o estorno devolve a peça uma vez", async () => {
    const gravado = await manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(40, "chave-estorno-001", {
      pecas: [{ estoqueId: 70, nome: "Filtro", quantidade: 4, valorUnitario: 5 }],
    }));
    await expect(manutencoesOperacao.excluir(sessao(2, "manutencoes.inativar"), gravado.id)).rejects.toThrow(/histórico/i);
    await manutencoesOperacao.estornar(sessao(2, "manutencoes.estornar"), gravado.id, "Peça errada", "2026-11-22", "Ambos");
    const deNovo = await manutencoesOperacao.estornar(sessao(1, "manutencoes.estornar"), gravado.id, "De novo", "2026-11-22", "Principal");
    expect(deNovo.alreadyEstornado).toBe(true);
    expect(await saldo()).toBe(10);
    expect(await contar()).toBe(1);
    const detalhe = await manutencoesOperacao.obter(sessao(1, "manutencoes.visualizar"), gravado.id);
    expect(detalhe.status).toBe("estornado");
    expect(Number(detalhe.custo)).toBe(20);
  });

  it("duas manutenções na mesma peça não deixam saldo negativo", async () => {
    let outra: Promise<unknown> = Promise.resolve();
    definirGanchoTravaManutencao(async () => {
      outra = manutencoesOperacao.criar(sessao(1, "manutencoes.criar"), pedido(44, "chave-concorr-002", {
        pecas: [{ estoqueId: 70, nome: "Filtro", quantidade: 8, valorUnitario: 5 }],
      })).catch((erro) => erro);
      await pausa();
    });
    await manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(40, "chave-concorr-001", {
      pecas: [{ estoqueId: 70, nome: "Filtro", quantidade: 8, valorUnitario: 5 }],
    })).catch(() => undefined);
    await outra;
    const os = await contar();
    expect(os).toBe(1);
    expect(await saldo()).toBe(2);
  });

  it("saldo insuficiente não grava manutenção", async () => {
    await expect(manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(40, "chave-saldo-00001", {
      pecas: [{ estoqueId: 70, nome: "Filtro", quantidade: 11, valorUnitario: 5 }],
    }))).rejects.toThrow(/insuficiente|saldo/i);
    expect(await contar()).toBe(0);
    expect(await saldo()).toBe(10);
  });

  it("criação contra exclusão, transferência e inativação não mistura o histórico", async () => {
    let exclusao: Promise<unknown> = Promise.resolve();
    definirGanchoTravaManutencao(async () => {
      exclusao = maquinasOperacao.excluir(sessaoMaquina(2, "maquinas.inativar"), 40).catch((erro) => erro);
      await pausa();
    });
    await manutencoesOperacao.criar(sessao(1, "manutencoes.criar"), pedido(40, "chave-contra-del1")).catch(() => undefined);
    await exclusao;
    const [ainda] = await pool.query("SELECT id FROM maquinas WHERE id = 40");
    const os = await contar();
    if (os === 1) {
      expect((ainda as unknown[]).length).toBe(1);
      await expect(maquinasOperacao.excluir(sessaoMaquina(1, "maquinas.inativar"), 40)).rejects.toThrow(MSG_MAQUINA_COM_VINCULOS);
    } else {
      expect((ainda as unknown[]).length).toBe(0);
    }

    await limpar();
    const gravado = await manutencoesOperacao.criar(sessao(1, "manutencoes.criar"), pedido(40, "chave-transf-0001"));
    await maquinasOperacao.editar(
      sessaoMaquina(1, "maquinas.editar"),
      40,
      { fazendaId: 20 },
      { nome: "Trator Norte", placa: null, fazendaId: 20 },
    );
    const [fazenda] = await pool.query("SELECT fazendaId FROM maquinas WHERE id = 40");
    expect((fazenda as Array<{ fazendaId: number }>)[0]?.fazendaId).toBe(20);
    const detalhe = await manutencoesOperacao.obter(sessao(1, "manutencoes.visualizar"), gravado.id);
    expect(detalhe.fazendaId).toBe(10);
    expect(await manutencoesOperacao.listar(sessao(5, "manutencoes.visualizar"), { maquinaId: 40 })).toHaveLength(1);
    await pool.query("UPDATE maquinas SET fazendaId = 10 WHERE id = 40");
    await pool.query("UPDATE manutencoes SET fazendaId = NULL WHERE id = ?", [gravado.id]);
    await expect(maquinasOperacao.editar(
      sessaoMaquina(1, "maquinas.editar"),
      40,
      { fazendaId: 20 },
      { nome: "Trator Norte", placa: null, fazendaId: 20 },
    )).rejects.toThrow(MSG_MAQUINA_TRANSFERENCIA);

    await pool.query("UPDATE maquinas SET status = 'inativo' WHERE id = 41");
    await expect(manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(41, "chave-inativa-001"))).rejects.toThrow(MSG_MAQUINA_INATIVA);
  });

  it("dois estornos e edição contra estorno deixam uma ordem só", async () => {
    const gravado = await manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(40, "chave-dois-est-01"));
    let outro: Promise<unknown> = Promise.resolve();
    definirGanchoTravaManutencao(async () => {
      outro = manutencoesOperacao.estornar(sessao(1, "manutencoes.estornar"), gravado.id, "Outro", "2026-11-22", "Principal").catch((erro) => erro);
      await pausa();
    });
    await manutencoesOperacao.estornar(sessao(2, "manutencoes.estornar"), gravado.id, "Primeiro", "2026-11-22", "Ambos");
    await outro;
    expect(await contar()).toBe(1);
    const detalhe = await manutencoesOperacao.obter(sessao(1, "manutencoes.visualizar"), gravado.id);
    expect(detalhe.status).toBe("estornado");

    const aberta = await manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(40, "chave-edit-est-01"));
    let estorno: Promise<unknown> = Promise.resolve();
    definirGanchoTravaManutencao(async () => {
      estorno = manutencoesOperacao.estornar(sessao(1, "manutencoes.estornar"), aberta.id, "Cancela", "2026-11-22", "Principal").catch((erro) => erro);
      await pausa();
    });
    await manutencoesOperacao.editar(sessao(2, "manutencoes.editar"), aberta.id, pedido(40, "ignorada", { descricao: "Ajuste" })).catch(() => undefined);
    await estorno;
    const final = await manutencoesOperacao.obter(sessao(1, "manutencoes.visualizar"), aberta.id);
    expect(final.status === "estornado" || final.descricao === "Ajuste").toBe(true);
    expect(await contar()).toBe(2);
  });

  it("permissão, fazenda e sessão revogadas não gravam", async () => {
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2");
    await expect(manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(40, "chave-revoga-perm"))).rejects.toThrow(MSG_MANUT_SEM_PERMISSAO);
    await limpar();
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2");
    await expect(manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(40, "chave-revoga-faz1"))).rejects.toThrow(MSG_MANUT_FAZENDA);
    await pool.query("UPDATE users SET sessionVersion = 4 WHERE id = 2");
    await expect(manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedido(40, "chave-revoga-sess"))).rejects.toThrow(/Sessão/);
    expect(await contar()).toBe(0);
  });

  it("falha antes do commit e coluna ausente não deixam ordem", async () => {
    definirGanchoTravaManutencao(async () => {
      throw new Error("parou");
    });
    await expect(manutencoesOperacao.criar(sessao(1, "manutencoes.criar"), pedido(40, "chave-rollback-01"))).rejects.toThrow(/parou/);
    expect(await contar()).toBe(0);
    await pool.query("ALTER TABLE manutencoes DROP COLUMN fazendaId");
    await expect(manutencoesOperacao.criar(sessao(1, "manutencoes.criar"), pedido(40, "chave-sem-col-001"))).rejects.toThrow(MSG_MANUT_SEM_ESTRUTURA);
    await pool.query("ALTER TABLE manutencoes ADD COLUMN fazendaId int NULL");
    expect(await contar()).toBe(0);
  });

  it("banco indisponível não grava no arquivo", async () => {
    const fechado = drizzle(mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada", database: "fd_teste_nao_conectar",
    }), { schema, mode: "default" });
    definirBancoManutencoes(fechado);
    await expect(manutencoesOperacao.criar(sessao(1, "manutencoes.criar"), pedido(40, "chave-sem-mysql01"))).rejects.toThrow(MSG_MANUT_SEM_MYSQL);
    definirBancoManutencoes(banco);
    expect(await contar()).toBe(0);
  });
});
