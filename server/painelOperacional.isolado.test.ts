import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { env } from "./_core/env";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { MSG_PAINEL_SEM_MYSQL, carregarPainelControle, carregarStatsPainel } from "./painelControle";
import type { PainelOverview } from "../shared/painelControle";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4be-painel";
const PORTA = 3380;
const SENHA = "isolado-h4be";
const BANCO = "fd_h4be";

const ESQUEMA = `
CREATE TABLE users (
  id int NOT NULL, openId varchar(255) NOT NULL, name varchar(255) NOT NULL,
  email varchar(255) NULL, role enum('admin','user') NOT NULL DEFAULT 'user',
  papel enum('principal','secundario','comum') NOT NULL,
  titularUserId int NULL, situacao enum('convidado','ativo','inativo') NOT NULL,
  sessionVersion int NOT NULL DEFAULT 0, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE fazendas (
  id int NOT NULL, userId int NOT NULL, nome varchar(200) NOT NULL, area decimal(10,2) NULL,
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
CREATE TABLE pastos (
  id int NOT NULL, userId int NOT NULL, fazendaId int NOT NULL, nome varchar(100) NOT NULL,
  capacidade int NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE lotes (
  id int NOT NULL, userId int NOT NULL, nome varchar(100) NOT NULL,
  fazendaId int NULL, pastoAtualId int NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, brinco varchar(50) NULL, nome varchar(100) NULL,
  sexo enum('macho','femea') NOT NULL, categoria varchar(50) NULL, dataNascimento date NULL,
  pesoAtual decimal(8,2) NULL, status enum('ativo','vendido','morto','transferido') NOT NULL DEFAULT 'ativo',
  loteId int NULL, fazendaId int NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  loteDestinoId int NOT NULL, fazendaId int NULL, fazendaOrigemId int NULL,
  dataMovimentacao date NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE estoque (
  id int NOT NULL, fazenda_id int NULL, nome varchar(100) NOT NULL,
  quantidade decimal(10,2) NULL, quantidade_minima decimal(10,2) NULL, unidade varchar(20) NULL,
  monitorar_estoque tinyint(1) NULL, controlar_saldo tinyint(1) NULL,
  valor_unitario decimal(18,6) NULL, valor_total_estoque decimal(14,2) NULL,
  capital_inicializado_em timestamp NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE estoque_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, estoque_id int NOT NULL, fazenda_id int NULL,
  data_movimentacao date NOT NULL, data_validade date NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE saude_registros (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  tipo varchar(50) NOT NULL, medicamento varchar(200) NULL, dataRegistro date NOT NULL,
  proximaData date NULL, createdAt timestamp NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE reproducao_registros (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, femeaId int NOT NULL,
  tipo varchar(50) NOT NULL, dataCobertura date NOT NULL, dataPrevistoParto date NULL,
  dataPartoReal date NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE maquinas (
  id int NOT NULL, userId int NOT NULL, fazendaId int NULL, nome varchar(100) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE manutencoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, maquinaId int NOT NULL,
  tipo varchar(50) NOT NULL, data date NOT NULL, status varchar(50) NULL,
  proximaManutencao date NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE benfeitorias (
  id int NOT NULL, userId int NOT NULL, fazendaId int NULL, nome varchar(100) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE compras (
  id int NOT NULL, user_id int NOT NULL, fornecedor varchar(255) NULL, data varchar(20) NOT NULL,
  valor_total varchar(50) NULL, custo_total decimal(12,2) NULL,
  status enum('pendente','concluido','cancelado') NULL, fazenda_id int NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE vendas (
  id int NOT NULL, user_id int NOT NULL, comprador varchar(255) NULL, data varchar(20) NOT NULL,
  valor_total varchar(50) NULL, status enum('pendente','concluido','cancelado') NULL,
  fazenda_id int NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

const PERMISSOES = [
  "animais.visualizar",
  "lotes.visualizar",
  "pastos.visualizar",
  "fazendas.visualizar",
  "estoque.visualizar",
  "saude.visualizar",
  "reproducao.visualizar",
  "manutencoes.visualizar",
  "maquinas.visualizar",
  "benfeitorias.visualizar",
  "compras.visualizar",
  "vendas.visualizar",
];

type Banco = ReturnType<typeof drizzle<typeof schema>>;

function texto(painel: PainelOverview) {
  return JSON.stringify(painel);
}

describe.sequential("painel operacional no mysql descartável", () => {
  let pool: mysql.Pool;
  let banco: Banco;
  let proxima = "2026-11-25";
  const chamadas: number[] = [];

  const financeiro = {
    async autorizar() {
      return { titularUserId: 1, papel: "principal" as const, fazendaIds: [10, 20] };
    },
    async relatorio(titularUserId: number) {
      chamadas.push(titularUserId);
      throw new Error("relatorio sem tabela neste teste");
    },
  };

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
        const daqui = new Date();
        daqui.setDate(daqui.getDate() + 5);
        proxima = daqui.toISOString().slice(0, 10);
        await conn.query(`
          INSERT INTO users (id, openId, name, role, papel, titularUserId, situacao, sessionVersion) VALUES
            (1, 'p1', 'Principal', 'user', 'principal', 1, 'ativo', 1),
            (2, 'f2', 'Ambos', 'user', 'comum', 1, 'ativo', 1),
            (3, 'p3', 'Outro', 'user', 'principal', 3, 'ativo', 1),
            (4, 'f4', 'Uma', 'user', 'comum', 1, 'ativo', 1),
            (6, 'f6', 'Nada', 'user', 'comum', 1, 'ativo', 1);
          INSERT INTO fazendas (id, userId, nome, area) VALUES
            (10, 1, 'Norte', 100), (20, 1, 'Sul', 40), (30, 3, 'Alheia', 7);
          INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
            (2, 10, 1), (2, 20, 1), (4, 10, 1), (6, 10, 1);
          INSERT INTO pastos (id, userId, fazendaId, nome, capacidade) VALUES
            (1, 1, 10, 'P10', 10), (2, 1, 20, 'P20', 8), (3, 3, 30, 'P30', 4);
          INSERT INTO lotes (id, userId, nome, fazendaId) VALUES
            (1, 1, 'L10', 10), (2, 1, 'L20', 20), (3, 3, 'L30', 30);
          INSERT INTO animais (id, userId, brinco, sexo, pesoAtual, status, fazendaId) VALUES
            (1, 1, 'A10', 'macho', 400, 'ativo', 10),
            (2, 1, 'B10', 'femea', 300, 'ativo', 10),
            (3, 1, 'C20', 'femea', 200, 'ativo', 20),
            (4, 1, 'V10', 'macho', 999, 'vendido', 10),
            (5, 1, 'SEM', 'macho', 50, 'ativo', NULL),
            (6, 3, 'Z30', 'macho', 80, 'ativo', 30);
          INSERT INTO animal_lote_movimentacoes (userId, animalId, loteDestinoId, fazendaId, fazendaOrigemId, dataMovimentacao)
            VALUES (1, 2, 1, 10, 20, '2026-01-01');
          INSERT INTO estoque (id, fazenda_id, nome, quantidade, quantidade_minima, unidade, monitorar_estoque, controlar_saldo, valor_unitario) VALUES
            (1, 10, 'Sal10', 2, 5, 'kg', 1, 1, 5),
            (2, 20, 'Sal20', 4, 1, 'kg', 0, 1, 10),
            (3, 30, 'Sal30', 9, 1, 'kg', 0, 1, 100);
          INSERT INTO saude_registros (userId, animalId, tipo, medicamento, dataRegistro, proximaData) VALUES
            (1, 1, 'vacina', 'Vacina10', '2026-11-01', '${proxima}'),
            (1, 2, 'vacina', 'Segredo20', '2026-01-02', '${proxima}');
          INSERT INTO maquinas (id, userId, fazendaId, nome) VALUES
            (1, 1, 10, 'Trator'), (2, 1, 20, 'Caminhao'), (3, 3, 30, 'Alheio');
          INSERT INTO benfeitorias (id, userId, fazendaId, nome) VALUES
            (1, 1, 10, 'Curral'), (2, 1, 20, 'Galpao'), (3, 3, 30, 'Silo');
          INSERT INTO manutencoes (userId, maquinaId, tipo, data, status, proximaManutencao) VALUES
            (1, 1, 'Revisao', '2026-11-01', 'agendada', '${proxima}');
          INSERT INTO compras (id, user_id, fornecedor, data, valor_total, custo_total, status, fazenda_id) VALUES
            (1, 1, 'Fornecedor Norte', '2026-11-01', '150', 150, 'concluido', 10),
            (2, 1, 'Fornecedor Sul', '2026-11-02', '80', 80, 'concluido', 20),
            (3, 3, 'Fornecedor Alheio', '2026-11-03', '999', 999, 'concluido', 30);
          INSERT INTO vendas (id, user_id, comprador, data, valor_total, status, fazenda_id) VALUES
            (1, 1, 'Cliente Norte', '2026-11-04', '70', 'concluido', 10),
            (2, 1, 'Cliente Sul', '2026-11-05', '90', 'concluido', 20),
            (3, 3, 'Cliente Alheio', '2026-11-06', '500', 'concluido', 30);
        `);
        for (const userId of [2, 4]) {
          for (const permissao of PERMISSOES) {
            await conn.query(
              "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (?, 1, ?, 1)",
              [userId, permissao],
            );
          }
        }
        await conn.end();
        break;
      } catch (error) {
        ultimo = error instanceof Error ? error.message : String(error);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    if (Date.now() >= prazo) throw new Error(ultimo || "MySQL descartável não subiu.");
    pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, connectionLimit: 4,
    });
    banco = drizzle(pool, { schema, mode: "default" });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  async function painel(executorId: number, fazendaId?: number) {
    return carregarPainelControle(executorId, fazendaId, 1, { banco, financeiro });
  }

  it("o responsável vê o rebanho ativo, o estoque e as duas fazendas", async () => {
    const visao = await painel(1);
    expect(visao.rebanho.total).toBe(3);
    expect(visao.rebanho.machos).toBe(1);
    expect(visao.rebanho.femeas).toBe(2);
    expect(visao.rebanho.pesoMedio).toBe(300);
    expect(visao.estoque.valorTotal).toBe(50);
    expect(visao.estoque.baixo.map((item) => item.texto)).toContain("Sal10");
    expect(visao.areaTotal).toBe(140);
    expect(visao.totalLotes).toBe(2);
    expect(visao.totalPastos).toBe(2);
    expect(visao.comercial.compras.map((item) => item.valor)).toEqual(expect.arrayContaining([150, 80]));
    expect(visao.comercial.vendas.map((item) => item.valor)).toEqual(expect.arrayContaining([70, 90]));
    expect(texto(visao)).toContain("Vacina10");
    expect(texto(visao)).toContain("Segredo20");
    expect(texto(visao)).not.toContain("Sal30");
    expect(texto(visao)).not.toContain("Z30");
    expect(visao.autorizacao.rebanho).toBe("autorizado");
    expect(chamadas.every((id) => id === 1)).toBe(true);
  });

  it("funcionário das duas fazendas não vê a outra conta", async () => {
    const visao = await painel(2);
    expect(visao.rebanho.total).toBe(3);
    expect(visao.estoque.valorTotal).toBe(50);
    expect(visao.areaTotal).toBe(140);
    expect(texto(visao)).not.toContain("Sal30");
    expect(texto(visao)).not.toContain("Fornecedor Alheio");
    expect(texto(visao)).not.toContain("Cliente Alheio");
  });

  it("funcionário de uma fazenda não recebe quantidade, custo nem histórico da outra", async () => {
    const visao = await painel(4);
    expect(visao.rebanho.total).toBe(2);
    expect(visao.rebanho.pesoMedio).toBe(350);
    expect(visao.estoque.valorTotal).toBe(10);
    expect(visao.areaTotal).toBe(100);
    expect(visao.totalLotes).toBe(1);
    expect(visao.totalPastos).toBe(1);
    expect(visao.comercial.compras.map((item) => item.parceiro)).toEqual(["Fornecedor Norte"]);
    expect(visao.comercial.vendas.map((item) => item.parceiro)).toEqual(["Cliente Norte"]);
    expect(texto(visao)).toContain("Vacina10");
    expect(texto(visao)).not.toContain("Segredo20");
    expect(texto(visao)).not.toContain("Sal20");
    expect(texto(visao)).not.toContain("C20");
    expect(texto(visao)).not.toContain("Fornecedor Sul");
    expect(visao.ocupacao.map((item) => item.nome)).toEqual(["P10"]);
  });

  it("sem permissão o indicador não vira zero confirmado", async () => {
    const visao = await carregarPainelControle(6, undefined, 1, {
      banco,
      financeiro: {
        async autorizar() {
          throw new TRPCError({ code: "FORBIDDEN", message: "sem" });
        },
        async relatorio() {
          throw new Error("não deveria consultar");
        },
      },
    });
    expect(visao.autorizacao.rebanho).toBe("sem_permissao");
    expect(visao.autorizacao.estoque).toBe("sem_permissao");
    expect(visao.autorizacao.compras).toBe("sem_permissao");
    expect(visao.autorizacao.vendas).toBe("sem_permissao");
    expect(visao.financeiro.motivoFinanceiro).toBe("sem_permissao");
    expect(visao.rebanho.total).toBe(0);
    expect(texto(visao)).not.toContain("Sal10");
    expect(texto(visao)).not.toContain("A10");
    expect(texto(visao)).not.toContain("Vacina10");
  });

  it("outra conta só vê os próprios números", async () => {
    const visao = await carregarPainelControle(3, undefined, 1, {
      banco,
      financeiro: {
        async autorizar() {
          return { titularUserId: 3, papel: "principal" as const, fazendaIds: [30] };
        },
        async relatorio(titularUserId: number) {
          expect(titularUserId).toBe(3);
          throw new Error("sem financeiro");
        },
      },
    });
    expect(visao.rebanho.total).toBe(1);
    expect(visao.rebanho.pesoTotal).toBe(80);
    expect(visao.estoque.valorTotal).toBe(900);
    expect(texto(visao)).not.toContain("A10");
    expect(texto(visao)).not.toContain("Sal10");
    expect(texto(visao)).not.toContain("Fornecedor Norte");
  });

  it("stats distingue contagem autorizada de indicador sem permissão", async () => {
    const chefe = await carregarStatsPainel(1, 1, { banco });
    const uma = await carregarStatsPainel(4, 1, { banco });
    const nada = await carregarStatsPainel(6, 1, { banco });
    expect(chefe.totalAnimais).toBe(5);
    expect(chefe.totalLotes).toBe(2);
    expect(chefe.totalMaquinas).toBe(2);
    expect(chefe.totalBenfeitorias).toBe(2);
    expect(chefe.totalReceitas).toBeNull();
    expect(uma.totalAnimais).toBe(3);
    expect(uma.totalMaquinas).toBe(1);
    expect(nada.totalAnimais).toBeNull();
    expect(nada.totalLotes).toBeNull();
    expect(nada.totalMaquinas).toBeNull();
    expect(nada.totalBenfeitorias).toBeNull();
  });

  it("fazenda revogada sai da próxima consulta", async () => {
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 20");
    const visao = await painel(2);
    expect(visao.rebanho.total).toBe(2);
    expect(visao.estoque.valorTotal).toBe(10);
    expect(texto(visao)).not.toContain("Sal20");
    expect(texto(visao)).not.toContain("C20");
  });

  it("permissão revogada não devolve o saldo do estoque", async () => {
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = 'estoque.visualizar'");
    const visao = await painel(2);
    expect(visao.autorizacao.estoque).toBe("sem_permissao");
    expect(visao.estoque.valorTotal).toBe(0);
    expect(texto(visao)).not.toContain("Sal10");
    expect(visao.rebanho.total).toBe(2);
  });

  it("sessão revogada não monta o painel", async () => {
    await pool.query("UPDATE users SET sessionVersion = 2 WHERE id = 2");
    await expect(painel(2)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("banco fechado não completa o painel com arquivo local", async () => {
    const fechado = mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada", database: "fd_teste_nao_conectar",
      connectionLimit: 1, connectTimeout: 1000,
    });
    const bancoFechado = drizzle(fechado, { schema, mode: "default" });
    await expect(carregarPainelControle(1, undefined, 1, { banco: bancoFechado, financeiro }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: MSG_PAINEL_SEM_MYSQL });
    await expect(carregarStatsPainel(1, 1, { banco: bancoFechado }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: MSG_PAINEL_SEM_MYSQL });
    await fechado.end();
  });
});
