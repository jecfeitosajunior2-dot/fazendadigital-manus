import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { env } from "./_core/env";
import {
  abastecimentosOperacao,
  definirBancoAbastecimentos,
  definirGanchoTravaAbastecimento,
  MSG_ABAST_CHAVE_DIVERGENTE,
  MSG_ABAST_NAO_ENCONTRADO,
  type CombustivelAbastecimento,
} from "./abastecimentosOperacao";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { aplicarSaidaEstoqueNoTx, criarExecutorSaldoDrizzle } from "./estoqueSaldoTx";
import {
  definirBancoManutencoes,
  definirGanchoTravaManutencao,
  manutencoesOperacao,
  MSG_MANUT_CHAVE_DIVERGENTE,
  type SessaoOperacao,
} from "./manutencoesOperacao";
import {
  definirBancoMaquinas,
  maquinasOperacao,
  MSG_MAQUINA_COM_VINCULOS,
  MSG_MAQUINA_FAZENDA,
  MSG_MAQUINA_NAO_ENCONTRADA,
  MSG_MAQUINA_TRANSFERENCIA,
  type SessaoMaquina,
} from "./maquinasOperacao";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bs-aud";
const PORTA = 3398;
const SENHA = "isolado-h4bs";
const BANCO = "fd_h4bs";
const DIESEL = 80;
const FILTRO = 70;

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

type Banco = ReturnType<typeof drizzle<typeof schema>>;
let pool: mysql.Pool;
let banco: Banco;

function sessao(executorId: number, permissaoId: SessaoOperacao["permissaoId"]): SessaoOperacao {
  return { executorId, sessionVersionDaSessao: 1, permissaoId };
}

function sessaoMaquina(executorId: number, permissaoId: SessaoMaquina["permissaoId"]): SessaoMaquina {
  return { executorId, sessionVersionDaSessao: 1, permissaoId };
}

function pedidoOs(maquinaId: number, chave: string, extra: Record<string, unknown> = {}) {
  return {
    maquinaId,
    tipo: "Revisao",
    descricao: "Troca de óleo",
    data: "2026-11-22",
    tipoExecucao: "interna" as const,
    valorMaoObra: 0,
    pecas: [] as Array<{ estoqueId: number; nome: string; quantidade: number; valorUnitario: number }>,
    pecasOficina: [],
    chaveOperacao: chave,
    registradoPor: "Ambos",
    ...extra,
  };
}

function pedidoAbast(maquinaId: number, chave: string, extra: Record<string, unknown> = {}) {
  return {
    maquinaId,
    data: "2026-11-22",
    combustivel: "diesel" as CombustivelAbastecimento,
    litros: 2,
    valorLitro: "5.000",
    valorTotal: "10.00",
    abastecidoNaFazenda: true,
    fazendaId: 10,
    chaveOperacao: chave,
    registradoPor: "Ambos",
    ...extra,
  };
}

function pausa() {
  return new Promise((resolver) => setTimeout(resolver, 450));
}

async function saldo(id = DIESEL) {
  const [linhas] = await pool.query("SELECT quantidade FROM estoque WHERE id = ?", [id]);
  return Number((linhas as Array<{ quantidade: string }>)[0]?.quantidade);
}

async function contar(tabela: string) {
  const [linhas] = await pool.query(`SELECT COUNT(*) AS n FROM ${tabela}`);
  return Number((linhas as Array<{ n: number }>)[0]?.n);
}

async function saidaManual(estoqueId: number, quantidade: number) {
  return banco.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM estoque WHERE id = ${estoqueId} FOR UPDATE`);
    return aplicarSaidaEstoqueNoTx(criarExecutorSaldoDrizzle(tx), {
      estoqueId,
      fazendaId: 10,
      quantidade: String(quantidade),
      dataMovimentacao: "2026-11-22",
      tipo: "saida",
      userId: 1,
      registradoPor: "Principal",
    });
  });
}

async function limpar() {
  definirGanchoTravaAbastecimento(null);
  definirGanchoTravaManutencao(null);
  await pool.query("DELETE FROM estoque_movimentacoes");
  await pool.query("DELETE FROM manutencao_pecas");
  await pool.query("DELETE FROM abastecimentos");
  await pool.query("DELETE FROM manutencoes");
  await pool.query("DELETE FROM maquinas");
  await pool.query("DELETE FROM estoque");
  await pool.query("DELETE FROM usuario_permissoes");
  await pool.query("DELETE FROM usuario_fazendas");
  await pool.query(`
    INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
      (2, 1, 'manutencoes.visualizar', 1), (2, 1, 'manutencoes.criar', 1),
      (2, 1, 'manutencoes.editar', 1), (2, 1, 'manutencoes.estornar', 1),
      (2, 1, 'abastecimentos.visualizar', 1), (2, 1, 'abastecimentos.criar', 1),
      (2, 1, 'abastecimentos.editar', 1), (2, 1, 'abastecimentos.estornar', 1),
      (2, 1, 'maquinas.visualizar', 1), (2, 1, 'maquinas.editar', 1), (2, 1, 'maquinas.inativar', 1),
      (5, 1, 'maquinas.editar', 1), (5, 1, 'abastecimentos.visualizar', 1),
      (6, 1, 'maquinas.editar', 1), (6, 1, 'abastecimentos.visualizar', 1)
  `);
  await pool.query(`
    INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
      (2, 10, 1), (2, 20, 1), (5, 10, 1), (6, 20, 1)
  `);
  await pool.query(`
    INSERT INTO maquinas (id, userId, fazendaId, nome, status) VALUES
      (40, 1, 10, 'Trator Norte', 'ativo'),
      (41, 1, 20, 'Trator Sul', 'ativo'),
      (43, 3, 30, 'Alheia', 'ativo'),
      (44, 1, 10, 'Plantadeira', 'ativo')
  `);
  await pool.query(`
    INSERT INTO estoque (id, fazenda_id, nome, categoria, unidade, quantidade, controlar_saldo, valor_unitario, situacao)
    VALUES
      (70, 10, 'Filtro', 'Peças', 'un', 10, 1, 5, 'ativo'),
      (80, 10, 'Diesel S10', 'Combustíveis', 'L', 10, 1, 5, 'ativo')
  `);
}

describe("serviço compartilhado de máquina", () => {
  it("as rotas de produção não voltam para o arquivo e os auxiliares de teste ficam fora delas", () => {
    const rotas = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const usos = [...rotas.matchAll(/assertMaquinaAtivaParaOperacao\(/g)].length;
    expect(usos).toBe(3);
    const abastece = rotas.slice(rotas.indexOf("const abastecimentosRouter"), rotas.indexOf("MANUTENCOES ROUTER"));
    expect(abastece).toContain("assertMaquinaAtivaParaOperacao");
    expect(abastece).toContain("abastecimentosOperacao");
    expect(abastece).not.toContain("localFallback");
    expect(rotas).not.toContain("lancarManutencao(");
    expect(rotas).not.toContain("lancarAbastecimento(");
  });
});

describe("patrimônio integrado no MySQL descartável", () => {
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
            (5, 'f5', 'Origem', 'user', 'comum', 1, 'ativo', 1),
            (6, 'f6', 'Destino', 'user', 'comum', 1, 'ativo', 1);
          INSERT INTO fazendas (id, userId, nome) VALUES
            (10, 1, 'Norte'), (20, 1, 'Sul'), (30, 3, 'Alheia');
        `);
        await conn.end();
        pool = mysql.createPool({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, connectionLimit: 8,
        });
        banco = drizzle(pool, { schema, mode: "default" });
        definirBancoManutencoes(banco);
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
    definirGanchoTravaManutencao(null);
    definirBancoManutencoes(null);
    definirBancoAbastecimentos(null);
    definirBancoMaquinas(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  beforeEach(limpar);

  it("reenviar a manutenção original depois da edição não abre outra ordem", async () => {
    const original = pedidoOs(40, "chave-edicao-os-1");
    const gravado = await manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), original);
    await manutencoesOperacao.editar(sessao(2, "manutencoes.editar"), gravado.id, {
      ...pedidoOs(40, "ignorada", { descricao: "Texto revisado" }),
    });
    await expect(manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), original)).rejects.toThrow(MSG_MANUT_CHAVE_DIVERGENTE);
    expect(await contar("manutencoes")).toBe(1);
    const detalhe = await manutencoesOperacao.obter(sessao(1, "manutencoes.visualizar"), gravado.id);
    expect(detalhe.descricao).toBe("Texto revisado");
    expect(detalhe.userId).toBe(1);
    expect(detalhe.fazendaId).toBe(10);
  });

  it("reenviar a manutenção original depois do estorno não baixa a peça de novo", async () => {
    const original = pedidoOs(40, "chave-estorno-os-1", {
      pecas: [{ estoqueId: FILTRO, nome: "Filtro", quantidade: 2, valorUnitario: 5 }],
    });
    const gravado = await manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), original);
    expect(await saldo(FILTRO)).toBe(8);
    await manutencoesOperacao.estornar(sessao(2, "manutencoes.estornar"), gravado.id, "erro de lançamento", "2026-11-22", "Ambos");
    expect(await saldo(FILTRO)).toBe(10);
    const repetida = await manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), original);
    expect(repetida).toMatchObject({ id: gravado.id, repetida: true });
    expect(await saldo(FILTRO)).toBe(10);
    expect(await contar("manutencoes")).toBe(1);
    const [movs] = await pool.query(
      "SELECT status FROM estoque_movimentacoes WHERE estoque_id = ? ORDER BY id",
      [FILTRO],
    );
    const antes = (movs as Array<{ status: string }>).map((item) => item.status);
    const deNovo = await manutencoesOperacao.estornar(sessao(2, "manutencoes.estornar"), gravado.id, "de novo", "2026-11-22", "Ambos");
    expect(deNovo).toMatchObject({ alreadyEstornado: true });
    const [depois] = await pool.query("SELECT status FROM estoque_movimentacoes WHERE estoque_id = ? ORDER BY id", [FILTRO]);
    expect((depois as Array<{ status: string }>).map((item) => item.status)).toEqual(antes);
    expect(await saldo(FILTRO)).toBe(10);
  });

  it("reenviar o abastecimento original depois da edição da data não abre outro consumo", async () => {
    const original = pedidoAbast(40, "chave-edicao-ab-1");
    const gravado = await abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), original);
    expect(await saldo()).toBe(8);
    await abastecimentosOperacao.editar(sessao(2, "abastecimentos.editar"), gravado.id, {
      ...pedidoAbast(40, "ignorada", { data: "2026-11-21" }),
    });
    await expect(abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), original)).rejects.toThrow(MSG_ABAST_CHAVE_DIVERGENTE);
    expect(await contar("abastecimentos")).toBe(1);
    expect(await saldo()).toBe(8);
    const detalhe = await abastecimentosOperacao.obter(sessao(1, "abastecimentos.visualizar"), gravado.id);
    expect(String(detalhe.data).slice(0, 10)).toBe("2026-11-21");
    expect(Number(detalhe.litros)).toBe(2);
    expect(detalhe.fazendaId).toBe(10);
  });

  it("reenviar o abastecimento original depois do estorno não duplica a compensação", async () => {
    const original = pedidoAbast(40, "chave-estorno-ab-1");
    const gravado = await abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), original);
    await abastecimentosOperacao.estornar(sessao(2, "abastecimentos.estornar"), gravado.id, "erro", "Ambos");
    expect(await saldo()).toBe(10);
    const movimentos = await contar("estoque_movimentacoes");
    const repetida = await abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), original);
    expect(repetida).toMatchObject({ id: gravado.id, repetida: true });
    expect(await contar("abastecimentos")).toBe(1);
    expect(await contar("estoque_movimentacoes")).toBe(movimentos);
    expect(await saldo()).toBe(10);
    const [status] = await pool.query("SELECT status FROM abastecimentos WHERE id = ?", [gravado.id]);
    expect((status as Array<{ status: string }>)[0]?.status).toBe("estornado");
  });

  it("duas conexões com a mesma chave deixam um lançamento em cada módulo", async () => {
    const ordens = await Promise.allSettled([
      manutencoesOperacao.criar(sessao(1, "manutencoes.criar"), pedidoOs(40, "chave-corrida-os-1")),
      manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedidoOs(40, "chave-corrida-os-1")),
    ]);
    expect(ordens.some((item) => item.status === "fulfilled")).toBe(true);
    for (const item of ordens) {
      if (item.status === "rejected") {
        expect(item.reason instanceof Error ? item.reason.message : String(item.reason)).toMatch(/chave|deadlock|Duplicate|1213/i);
      }
    }
    expect(await contar("manutencoes")).toBe(1);
    const abastece = await Promise.allSettled([
      abastecimentosOperacao.criar(sessao(1, "abastecimentos.criar"), pedidoAbast(40, "chave-corrida-ab-1")),
      abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedidoAbast(40, "chave-corrida-ab-1")),
    ]);
    expect(abastece.some((item) => item.status === "fulfilled")).toBe(true);
    for (const item of abastece) {
      if (item.status === "rejected") {
        expect(item.reason instanceof Error ? item.reason.message : String(item.reason)).toMatch(/chave|deadlock|Duplicate|1213/i);
      }
    }
    expect(await contar("abastecimentos")).toBe(1);
    expect(await saldo()).toBe(8);
  });

  it("a transferência conserva a fazenda da época e não preenche histórico sem fazenda", async () => {
    await pool.query(
      "INSERT INTO abastecimentos (userId, maquinaId, data, combustivel, litros, valorTotal, fazendaId, abastecidoNaFazenda) VALUES (1, 40, '2026-11-01', 'diesel', 12, 60, 10, 1)",
    );
    const soCombustivel = await maquinasOperacao.editar(
      sessaoMaquina(2, "maquinas.editar"),
      40,
      { fazendaId: 20 },
      { nome: "Trator Norte", placa: null, fazendaId: 20 },
    );
    expect(soCombustivel.maquina.fazendaId).toBe(20);
    const [ab] = await pool.query("SELECT fazendaId, litros FROM abastecimentos WHERE maquinaId = 40");
    expect(Number((ab as Array<{ fazendaId: number; litros: string }>)[0]?.fazendaId)).toBe(10);
    expect(Number((ab as Array<{ litros: string }>)[0]?.litros)).toBe(12);

    await pool.query("UPDATE maquinas SET fazendaId = 10 WHERE id = 44");
    await pool.query(
      "INSERT INTO manutencoes (userId, maquinaId, fazendaId, tipo, data, custo, status) VALUES (1, 44, 10, 'preventiva', '2026-11-01', 80, 'concluida')",
    );
    const comFazenda = await maquinasOperacao.editar(
      sessaoMaquina(2, "maquinas.editar"),
      44,
      { fazendaId: 20 },
      { nome: "Plantadeira", placa: null, fazendaId: 20 },
    );
    expect(comFazenda.maquina.fazendaId).toBe(20);
    const [os] = await pool.query("SELECT fazendaId, custo FROM manutencoes WHERE maquinaId = 44");
    expect(Number((os as Array<{ fazendaId: number; custo: string }>)[0]?.fazendaId)).toBe(10);
    expect(Number((os as Array<{ custo: string }>)[0]?.custo)).toBe(80);

    await pool.query("UPDATE maquinas SET fazendaId = 10 WHERE id = 41");
    await pool.query(
      "INSERT INTO manutencoes (userId, maquinaId, fazendaId, tipo, data, custo, status) VALUES (1, 41, NULL, 'corretiva', '2020-01-01', 15, 'concluida')",
    );
    await expect(maquinasOperacao.editar(
      sessaoMaquina(2, "maquinas.editar"),
      41,
      { fazendaId: 20 },
      { nome: "Trator Sul", placa: null, fazendaId: 20 },
    )).rejects.toThrow(MSG_MAQUINA_TRANSFERENCIA);
    const [parada] = await pool.query("SELECT fazendaId FROM maquinas WHERE id = 41");
    expect(Number((parada as Array<{ fazendaId: number }>)[0]?.fazendaId)).toBe(10);
    const [antiga] = await pool.query("SELECT fazendaId FROM manutencoes WHERE maquinaId = 41");
    expect((antiga as Array<{ fazendaId: number | null }>)[0]?.fazendaId).toBeNull();
  });

  it("só quem tem as duas fazendas transfere a máquina", async () => {
    await expect(maquinasOperacao.editar(
      sessaoMaquina(5, "maquinas.editar"),
      40,
      { fazendaId: 20 },
      { nome: "Trator Norte", placa: null, fazendaId: 20 },
    )).rejects.toThrow(MSG_MAQUINA_FAZENDA);
    await expect(maquinasOperacao.editar(
      sessaoMaquina(6, "maquinas.editar"),
      40,
      { fazendaId: 20 },
      { nome: "Trator Norte", placa: null, fazendaId: 20 },
    )).rejects.toThrow(MSG_MAQUINA_FAZENDA);
    const mudou = await maquinasOperacao.editar(
      sessaoMaquina(2, "maquinas.editar"),
      40,
      { fazendaId: 20 },
      { nome: "Trator Norte", placa: null, fazendaId: 20 },
    );
    expect(mudou.maquina.fazendaId).toBe(20);
    expect(mudou.maquina.userId).toBe(1);
  });

  it("histórico gravado no identificador do funcionário impede a exclusão e não vaza outra conta", async () => {
    await pool.query(
      "INSERT INTO manutencoes (userId, maquinaId, fazendaId, tipo, data, custo, status) VALUES (2, 40, 10, 'corretiva', '2024-01-01', 30, 'concluida')",
    );
    await pool.query(
      "INSERT INTO abastecimentos (userId, maquinaId, data, combustivel, litros, fazendaId) VALUES (2, 44, '2024-01-01', 'diesel', 4, 10)",
    );
    await expect(maquinasOperacao.excluir(sessaoMaquina(1, "maquinas.inativar"), 40)).rejects.toThrow(MSG_MAQUINA_COM_VINCULOS);
    await expect(maquinasOperacao.excluir(sessaoMaquina(1, "maquinas.inativar"), 44)).rejects.toThrow(MSG_MAQUINA_COM_VINCULOS);
    expect(await contar("manutencoes")).toBe(1);
    expect(await contar("abastecimentos")).toBe(1);
    await expect(maquinasOperacao.excluir(sessaoMaquina(1, "maquinas.inativar"), 43)).rejects.toThrow(MSG_MAQUINA_NAO_ENCONTRADA);
    const [alheia] = await pool.query("SELECT userId, nome FROM maquinas WHERE id = 43");
    expect((alheia as Array<{ userId: number; nome: string }>)[0]).toMatchObject({ userId: 3, nome: "Alheia" });
    const lista = await maquinasOperacao.listar(sessaoMaquina(2, "maquinas.visualizar"));
    expect(lista.map((item) => item.id)).not.toContain(43);
  });

  it("abastecimento e saída manual do mesmo diesel fecham o saldo nos movimentos", async () => {
    let saida: Promise<unknown> = Promise.resolve();
    definirGanchoTravaAbastecimento(async () => {
      definirGanchoTravaAbastecimento(null);
      saida = saidaManual(DIESEL, 4);
      await pausa();
    });
    const gravado = await abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedidoAbast(40, "chave-saida-diesel1"));
    await saida;
    expect(gravado.repetida).toBe(false);
    expect(await saldo()).toBe(4);
    expect(await contar("abastecimentos")).toBe(1);
    const [movs] = await pool.query(
      "SELECT abastecimento_id, status, quantidade FROM estoque_movimentacoes WHERE estoque_id = ? ORDER BY id",
      [DIESEL],
    );
    const linhas = movs as Array<{ abastecimento_id: number | null; status: string; quantidade: string }>;
    expect(linhas).toHaveLength(2);
    expect(linhas.every((item) => item.status === "ativa" || item.abastecimento_id != null || Number(item.quantidade) === 4 || Number(item.quantidade) === 2)).toBe(true);
    const baixado = linhas.reduce((soma, item) => soma + Math.abs(Number(item.quantidade)), 0);
    expect(baixado).toBe(6);
  });

  it("ajuste que deixa o diesel curto desfaz o abastecimento inteiro", async () => {
    const trava = await mysql.createConnection({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
    });
    await trava.beginTransaction();
    await trava.query("SELECT id FROM estoque WHERE id = ? FOR UPDATE", [DIESEL]);
    const andamento = abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedidoAbast(40, "chave-ajuste-dies1", { litros: 5, valorTotal: "25.00" }));
    await pausa();
    await trava.query("UPDATE estoque SET quantidade = 1 WHERE id = ?", [DIESEL]);
    await trava.commit();
    await trava.end();
    await expect(andamento).rejects.toThrow(/insuficiente/i);
    expect(await contar("abastecimentos")).toBe(0);
    expect(await contar("estoque_movimentacoes")).toBe(0);
    expect(await saldo()).toBe(1);
  });

  it("manutenção e saída manual da mesma peça não furam o saldo", async () => {
    let saida: Promise<unknown> = Promise.resolve();
    definirGanchoTravaManutencao(async () => {
      definirGanchoTravaManutencao(null);
      saida = saidaManual(FILTRO, 3);
      await pausa();
    });
    await manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedidoOs(40, "chave-saida-peca-1", {
      pecas: [{ estoqueId: FILTRO, nome: "Filtro", quantidade: 2, valorUnitario: 5 }],
    }));
    await saida;
    expect(await saldo(FILTRO)).toBe(5);
    expect(await contar("manutencoes")).toBe(1);
    const [movs] = await pool.query("SELECT COUNT(*) AS n FROM estoque_movimentacoes WHERE estoque_id = ?", [FILTRO]);
    expect(Number((movs as Array<{ n: number }>)[0]?.n)).toBe(2);
  });

  it("abastecimento e manutenção disputam o mesmo diesel e o saldo fecha", async () => {
    await pool.query("UPDATE estoque SET quantidade = 20 WHERE id = ?", [DIESEL]);
    const corrida = await Promise.allSettled([
      abastecimentosOperacao.criar(sessao(1, "abastecimentos.criar"), pedidoAbast(40, "chave-comum-abas-1", { litros: 5, valorTotal: "25.00" })),
      manutencoesOperacao.criar(sessao(2, "manutencoes.criar"), pedidoOs(44, "chave-comum-manu-1", {
        pecas: [{ estoqueId: DIESEL, nome: "Diesel S10", quantidade: 3, valorUnitario: 5 }],
      })),
    ]);
    expect(corrida.filter((item) => item.status === "fulfilled")).toHaveLength(2);
    expect(await saldo()).toBe(12);
    expect(await contar("abastecimentos")).toBe(1);
    expect(await contar("manutencoes")).toBe(1);
    const [movs] = await pool.query("SELECT COUNT(*) AS n FROM estoque_movimentacoes WHERE estoque_id = ? AND status = 'ativa'", [DIESEL]);
    expect(Number((movs as Array<{ n: number }>)[0]?.n)).toBe(2);
  });

  it("estorno de combustível e nova saída do mesmo diesel fecham o saldo", async () => {
    const gravado = await abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedidoAbast(40, "chave-estorno-saida"));
    expect(await saldo()).toBe(8);
    let saida: Promise<unknown> = Promise.resolve();
    definirGanchoTravaAbastecimento(async () => {
      definirGanchoTravaAbastecimento(null);
      saida = saidaManual(DIESEL, 3);
      await pausa();
    });
    await abastecimentosOperacao.estornar(sessao(2, "abastecimentos.estornar"), gravado.id, "corrigir", "Ambos");
    await saida;
    expect(await saldo()).toBe(7);
    expect(await contar("abastecimentos")).toBe(1);
    const [status] = await pool.query("SELECT status FROM estoque_movimentacoes WHERE estoque_id = ? ORDER BY id", [DIESEL]);
    const nomes = (status as Array<{ status: string }>).map((item) => item.status);
    expect(nomes.filter((item) => item === "estornada")).toHaveLength(1);
    expect(nomes.filter((item) => item === "estorno")).toHaveLength(1);
    expect(nomes.filter((item) => item === "ativa")).toHaveLength(1);
  });

  it("funcionário só do destino não lê o abastecimento da origem", async () => {
    const gravado = await abastecimentosOperacao.criar(sessao(2, "abastecimentos.criar"), pedidoAbast(40, "chave-destino-neg1"));
    await maquinasOperacao.editar(
      sessaoMaquina(2, "maquinas.editar"),
      40,
      { fazendaId: 20 },
      { nome: "Trator Norte", placa: null, fazendaId: 20 },
    );
    await expect(abastecimentosOperacao.obter(sessao(6, "abastecimentos.visualizar"), gravado.id)).rejects.toThrow(MSG_ABAST_NAO_ENCONTRADO);
    const origem = await abastecimentosOperacao.obter(sessao(5, "abastecimentos.visualizar"), gravado.id);
    expect(origem.fazendaId).toBe(10);
    expect(origem.userId).toBe(1);
  });
});
