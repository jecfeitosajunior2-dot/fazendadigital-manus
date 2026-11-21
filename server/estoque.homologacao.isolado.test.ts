import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  PERMISSAO_CONSULTAR_ESTOQUE,
  PERMISSAO_MOVIMENTAR_ESTOQUE,
  autorizarMovimentoEstoque,
  fazendasDaConsultaEstoque,
  type ConsultaAutorizacaoPersistida,
  type IoEstoque,
} from "./consultaEstoqueAutorizada";
import { afirmarBancoDescartavel } from "./isolamentoMysql";

const exec = promisify(execFile);
const CONTAINER = "fd-h4aw-estoque";
const PORTA = 3366;
const SENHA = "isolado-h4aw";
const BANCO = "fd_h4aw";

const ESQUEMA = `
CREATE TABLE users (
  id int NOT NULL, openId varchar(255) NOT NULL, name varchar(255) NOT NULL,
  email varchar(255) NULL, role enum('admin','user') NOT NULL,
  papel enum('principal','secundario','comum') NOT NULL,
  titularUserId int NULL, situacao enum('convidado','ativo','inativo') NOT NULL,
  sessionVersion int NOT NULL DEFAULT 0, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE fazendas (
  id int NOT NULL, userId int NOT NULL, nome varchar(200) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_fazendas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  concedidoPorUserId int NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_permissoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, titularUserId int NOT NULL,
  permissao varchar(80) NOT NULL, concedidoPorUserId int NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE estoque (
  id int NOT NULL, fazenda_id int NOT NULL, nome varchar(100) NOT NULL,
  quantidade decimal(10,2) NOT NULL, valor_unitario decimal(18,6) NULL,
  valor_total_estoque decimal(14,2) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

function alvo() {
  return { host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, container: CONTAINER };
}

function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

async function conectar(banco?: string) {
  return mysql.createConnection({
    host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: banco,
    multipleStatements: true, dateStrings: true,
  });
}

async function esperarMysql() {
  const prazo = Date.now() + 90_000;
  let ultimo = "";
  while (Date.now() < prazo) {
    try {
      const conn = await conectar();
      await conn.query("SELECT 1 AS ok");
      await conn.end();
      return;
    } catch (erro) {
      ultimo = erro instanceof Error ? erro.message : String(erro);
      await new Promise((resolver) => setTimeout(resolver, 1500));
    }
  }
  throw new Error(`MySQL isolado não respondeu. ${ultimo}`);
}

function numero(valor: unknown): number | null {
  return valor == null ? null : Number(valor);
}

function consultas(conn: mysql.PoolConnection): ConsultaAutorizacaoPersistida {
  return {
    async usuario(id): Promise<LinhaUsuarioCadastro | null> {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion
         FROM users WHERE id = ? FOR UPDATE`,
        [id],
      );
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id),
        openId: String(linha.openId),
        name: linha.name == null ? null : String(linha.name),
        email: linha.email == null ? null : String(linha.email),
        role: linha.role === "admin" ? "admin" : "user",
        papel: linha.papel,
        titularUserId: numero(linha.titularUserId),
        situacao: linha.situacao,
        sessionVersion: Number(linha.sessionVersion),
      };
    },
    async permissoes(userId, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT permissao FROM usuario_permissoes WHERE userId = ? AND titularUserId = ? FOR UPDATE",
        [userId, titularUserId],
      );
      return linhas.map((linha) => String(linha.permissao));
    },
    async vinculos(userId, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT uf.userId, uf.fazendaId FROM usuario_fazendas uf
         JOIN users u ON u.id = uf.userId
         WHERE uf.userId = ? AND u.titularUserId = ? FOR UPDATE`,
        [userId, titularUserId],
      );
      return linhas.map((linha) => ({ userId: Number(linha.userId), fazendaId: Number(linha.fazendaId) }));
    },
    async fazendasDoTitular(titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId FROM fazendas WHERE userId = ? ORDER BY id",
        [titularUserId],
      );
      return linhas.map((linha) => ({ id: Number(linha.id), userId: Number(linha.userId) }));
    },
    async fazenda(id) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId FROM fazendas WHERE id = ? FOR UPDATE",
        [id],
      );
      const linha = linhas[0];
      return linha ? { id: Number(linha.id), userId: Number(linha.userId) } : null;
    },
  };
}

function io(pool: mysql.Pool): IoEstoque {
  return {
    emTransacao(fn) {
      return pool.getConnection().then(async (conn) => {
        try {
          await conn.beginTransaction();
          const resultado = await fn(consultas(conn));
          await conn.commit();
          return resultado;
        } catch (erro) {
          await conn.rollback();
          throw erro;
        } finally {
          conn.release();
        }
      });
    },
  };
}

describe.sequential("estoque geral em MySQL descartável", () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    afirmarBancoDescartavel(alvo());
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
    await docker(
      "run", "-d", "--name", CONTAINER,
      "-e", `MYSQL_ROOT_PASSWORD=${SENHA}`,
      "-e", `MYSQL_DATABASE=${BANCO}`,
      "-p", `127.0.0.1:${PORTA}:3306`,
      "mysql:8.4",
    );
    await esperarMysql();
    const conn = await conectar(BANCO);
    await conn.query(ESQUEMA);
    await conn.query(`
      INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion) VALUES
        (1, 'principal-isolado', 'Administrador da conta', 'principal@isolado.local', 'admin', 'principal', 1, 'ativo', 3),
        (2, 'funcionario-isolado', 'Funcionario Curral', 'curral@isolado.local', 'user', 'comum', 1, 'ativo', 1),
        (3, 'sem-permissao-isolado', 'Sem Permissao', 'sem@isolado.local', 'user', 'comum', 1, 'ativo', 1),
        (4, 'outro-titular-isolado', 'Outro Titular', 'outro@isolado.local', 'admin', 'principal', 4, 'ativo', 1)
    `);
    await conn.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (20, 1, 'Retiro'), (40, 4, 'Alheia')");
    await conn.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1), (3, 10, 1)");
    await conn.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'estoque.visualizar', 1),
        (2, 1, 'estoque.criar', 1)
    `);
    await conn.query(`
      INSERT INTO estoque (id, fazenda_id, nome, quantidade, valor_unitario, valor_total_estoque) VALUES
        (1, 10, 'Sal mineral', 10.00, 4.000000, 40.00),
        (2, 20, 'Racao', 5.00, 3.000000, 15.00),
        (3, 40, 'Alheio', 99.00, 8.000000, 792.00)
    `);
    await conn.end();
    pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
      connectionLimit: 4, dateStrings: true,
    });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  it("o principal vê as fazendas da conta e o funcionário só a concedida", async () => {
    const principal = await fazendasDaConsultaEstoque(io(pool), {
      executorId: 1,
      sessionVersionDaSessao: 3,
      permissaoId: PERMISSAO_CONSULTAR_ESTOQUE,
      titularInformadoPeloCliente: 4,
      papelInformadoPeloCliente: "comum",
      permissoesInformadasPeloCliente: [],
      fazendasInformadasPeloCliente: [40],
    });
    expect(principal.ok).toBe(true);
    if (principal.ok) {
      expect(principal.titularUserId).toBe(1);
      expect(principal.fazendaIds).toEqual([10, 20]);
    }
    const funcionario = await fazendasDaConsultaEstoque(io(pool), {
      executorId: 2,
      sessionVersionDaSessao: 1,
      permissaoId: PERMISSAO_CONSULTAR_ESTOQUE,
    });
    expect(funcionario.ok && funcionario.fazendaIds).toEqual([10]);
  });

  it("não lista estoque de quem não tem a permissão nem de outra conta", async () => {
    const sem = await fazendasDaConsultaEstoque(io(pool), {
      executorId: 3,
      sessionVersionDaSessao: 1,
      permissaoId: PERMISSAO_CONSULTAR_ESTOQUE,
    });
    expect(sem.ok).toBe(false);
    if (!sem.ok) expect(sem.motivo).toBe("sem_permissao");
    const outro = await fazendasDaConsultaEstoque(io(pool), {
      executorId: 4,
      sessionVersionDaSessao: 1,
      permissaoId: PERMISSAO_CONSULTAR_ESTOQUE,
    });
    expect(outro.ok && outro.fazendaIds).toEqual([40]);
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM estoque WHERE fazenda_id IN (10, 20)",
    );
    expect(linhas.map((linha) => Number(linha.id))).toEqual([1, 2]);
  });

  it("recusa movimento sem permissão, em fazenda não concedida e com sessão revogada", async () => {
    const sem = await autorizarMovimentoEstoque(io(pool), {
      executorId: 3,
      sessionVersionDaSessao: 1,
      fazendaId: 10,
    });
    expect(sem.ok).toBe(false);
    if (!sem.ok) expect(sem.motivo).toBe("sem_permissao");
    const retiro = await autorizarMovimentoEstoque(io(pool), {
      executorId: 2,
      sessionVersionDaSessao: 1,
      fazendaId: 20,
    });
    expect(retiro.ok).toBe(false);
    if (!retiro.ok) expect(retiro.motivo).toBe("sem_fazenda");
    const velha = await autorizarMovimentoEstoque(io(pool), {
      executorId: 2,
      sessionVersionDaSessao: 0,
      fazendaId: 10,
    });
    expect(velha.ok).toBe(false);
    if (!velha.ok) expect(velha.motivo).toBe("sem_identidade");
  });

  it("duas saídas simultâneas não leem o mesmo saldo", async () => {
    const a = await pool.getConnection();
    const b = await pool.getConnection();
    try {
      await a.beginTransaction();
      const [antes] = await a.query<RowDataPacket[]>(
        "SELECT quantidade FROM estoque WHERE id = 1 FOR UPDATE",
      );
      expect(Number(antes[0].quantidade)).toBe(10);
      const espera = b.query<RowDataPacket[]>(
        "SELECT quantidade FROM estoque WHERE id = 1 FOR UPDATE",
      );
      await new Promise((resolver) => setTimeout(resolver, 400));
      await a.query("UPDATE estoque SET quantidade = 2, valor_total_estoque = 8.00 WHERE id = 1");
      await a.commit();
      const [depois] = await espera;
      expect(Number(depois[0].quantidade)).toBe(2);
      await b.query("UPDATE estoque SET quantidade = 0, valor_total_estoque = 0 WHERE id = 1");
      await b.commit();
    } finally {
      a.release();
      b.release();
    }
  });

  it("desfaz a saída se a transação cair antes do commit", async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("SELECT quantidade FROM estoque WHERE id = 2 FOR UPDATE");
      await conn.query("UPDATE estoque SET quantidade = 0 WHERE id = 2");
      await conn.rollback();
    } finally {
      conn.release();
    }
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT quantidade FROM estoque WHERE id = 2");
    expect(Number(linhas[0].quantidade)).toBe(5);
  });

  it("permissão e fazenda revogadas passam a bloquear na hora", async () => {
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = ?", [PERMISSAO_MOVIMENTAR_ESTOQUE]);
    const semCriar = await autorizarMovimentoEstoque(io(pool), {
      executorId: 2,
      sessionVersionDaSessao: 1,
      fazendaId: 10,
    });
    expect(semCriar.ok).toBe(false);
    await pool.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, ?, 1)",
      [PERMISSAO_MOVIMENTAR_ESTOQUE],
    );
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 10");
    const semFazenda = await autorizarMovimentoEstoque(io(pool), {
      executorId: 2,
      sessionVersionDaSessao: 1,
      fazendaId: 10,
    });
    expect(semFazenda.ok).toBe(false);
    if (!semFazenda.ok) expect(semFazenda.motivo).toBe("sem_fazenda");
  });
});
