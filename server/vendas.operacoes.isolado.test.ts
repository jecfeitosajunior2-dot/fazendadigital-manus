import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { fazendasDaConsultaVenda } from "./consultaVendaAutorizada";
import { excluirRascunhoVenda, type TxExcluirVenda } from "./excluirVendaAutorizada";
import { afirmarBancoDescartavel } from "./isolamentoMysql";

const exec = promisify(execFile);
const CONTAINER = "fd-h4ba-vendas";
const PORTA = 3372;
const SENHA = "isolado-h4ba";
const BANCO = "fd_h4ba";

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
CREATE TABLE vendas (
  id int NOT NULL, user_id int NOT NULL, fazenda_id int NULL, status varchar(20) NOT NULL,
  data varchar(20) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE venda_itens (
  id int NOT NULL, user_id int NOT NULL, venda_id int NOT NULL, animal_id int NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE financeiro_titulos (
  id int NOT NULL, user_id int NOT NULL, origem_tipo varchar(40) NOT NULL, origem_id int NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, fazendaId int NULL, status varchar(20) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

type Conn = mysql.PoolConnection;

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

describe.sequential("vendas no mysql descartável", () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    afirmarBancoDescartavel({ host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER });
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
    await docker(
      "run", "-d", "--name", CONTAINER,
      "-e", `MYSQL_ROOT_PASSWORD=${SENHA}`,
      "-e", `MYSQL_DATABASE=${BANCO}`,
      "-p", `127.0.0.1:${PORTA}:3306`,
      "mysql:8.4",
    );
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
          INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion) VALUES
            (1, 'principal', 'Administrador da conta', NULL, 'admin', 'principal', 1, 'ativo', 3),
            (2, 'curral', 'Funcionario Curral', NULL, 'user', 'comum', 1, 'ativo', 1),
            (5, 'retiro', 'So o Retiro', NULL, 'user', 'comum', 1, 'ativo', 1),
            (4, 'outra', 'Outra Conta', NULL, 'admin', 'principal', 4, 'ativo', 1)
        `);
        await conn.query(`
          INSERT INTO fazendas (id, userId, nome) VALUES
            (10, 1, 'Sede'), (20, 1, 'Retiro'), (40, 4, 'Alheia')
        `);
        await conn.query(`
          INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
            (2, 10, 1), (5, 20, 1)
        `);
        await conn.query(`
          INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
            (2, 1, 'vendas.visualizar', 1), (2, 1, 'vendas.inativar', 1), (2, 1, 'vendas.criar', 1),
            (5, 1, 'vendas.visualizar', 1)
        `);
        await conn.query(`
          INSERT INTO vendas (id, user_id, fazenda_id, status, data) VALUES
            (1, 1, 10, 'pendente', '2026-11-21'),
            (2, 1, 10, 'concluido', '2026-11-21'),
            (3, 1, 20, 'pendente', '2026-11-21'),
            (4, 1, NULL, 'pendente', '2026-11-21'),
            (5, 4, 40, 'pendente', '2026-11-21'),
            (6, 1, 10, 'pendente', '2026-11-21'),
            (7, 1, 10, 'pendente', '2026-11-21'),
            (8, 1, 10, 'pendente', '2026-11-21'),
            (9, 1, 10, 'pendente', '2026-11-21'),
            (12, 1, 10, 'pendente', '2026-11-21')
        `);
        await conn.query("INSERT INTO venda_itens (id, user_id, venda_id, animal_id) VALUES (1, 1, 6, 90)");
        await conn.query(`
          INSERT INTO financeiro_titulos (id, user_id, origem_tipo, origem_id)
          VALUES (1, 1, 'venda_animais', 7)
        `);
        await conn.query("INSERT INTO animais (id, userId, fazendaId, status) VALUES (90, 1, 20, 'vendido')");
        await conn.end();
        break;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    try {
      pool = mysql.createPool({
        host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
        connectionLimit: 8,
      });
      await pool.query("SELECT 1 AS ok");
    } catch (erro) {
      throw new Error(`MySQL isolado não respondeu. ${ultimo} ${erro instanceof Error ? erro.message : ""}`);
    }
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  function consultas(conn: Conn, pausa?: () => Promise<void>): TxExcluirVenda {
    return {
      async usuario(id): Promise<LinhaUsuarioCadastro | null> {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion FROM users WHERE id = ? FOR UPDATE",
          [id],
        );
        if (pausa) await pausa();
        const linha = linhas[0];
        if (!linha) return null;
        return {
          id: Number(linha.id), openId: String(linha.openId), name: linha.name, email: linha.email,
          role: linha.role === "admin" ? "admin" : "user", papel: linha.papel,
          titularUserId: Number(linha.titularUserId), situacao: linha.situacao,
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
      async vinculos(userId) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT userId, fazendaId FROM usuario_fazendas WHERE userId = ? FOR UPDATE",
          [userId],
        );
        return linhas.map((linha) => ({ userId: Number(linha.userId), fazendaId: Number(linha.fazendaId) }));
      },
      async fazendasDoTitular(titularUserId) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id, userId FROM fazendas WHERE userId = ?",
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
      async espiarVenda(id) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT user_id AS userId, fazenda_id AS fazendaId FROM vendas WHERE id = ?",
          [id],
        );
        const linha = linhas[0];
        if (!linha) return null;
        return {
          userId: Number(linha.userId),
          fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
        };
      },
      async travarVenda(id, titularUserId) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id, user_id AS userId, fazenda_id AS fazendaId, status FROM vendas WHERE id = ? AND user_id = ? FOR UPDATE",
          [id, titularUserId],
        );
        const linha = linhas[0];
        if (!linha) return null;
        return {
          id: Number(linha.id),
          userId: Number(linha.userId),
          fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
          status: linha.status == null ? null : String(linha.status),
        };
      },
      async temItem(titularUserId, vendaId) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM venda_itens WHERE user_id = ? AND venda_id = ? LIMIT 1",
          [titularUserId, vendaId],
        );
        return linhas.length > 0;
      },
      async temTitulo(titularUserId, vendaId) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM financeiro_titulos WHERE user_id = ? AND origem_tipo = 'venda_animais' AND origem_id = ? LIMIT 1",
          [titularUserId, vendaId],
        );
        return linhas.length > 0;
      },
      async apagarRascunho(id, titularUserId) {
        const [resultado] = await conn.query<ResultSetHeader>(
          "DELETE FROM vendas WHERE id = ? AND user_id = ? AND status = 'pendente'",
          [id, titularUserId],
        );
        return Number(resultado.affectedRows ?? 0);
      },
    };
  }

  function io(pausa?: () => Promise<void>) {
    return {
      async emTransacao<T>(fn: (tx: TxExcluirVenda) => Promise<T>) {
        const conn = await pool.getConnection();
        try {
          await conn.query("SET SESSION innodb_lock_wait_timeout = 5");
          await conn.beginTransaction();
          const resultado = await fn(consultas(conn, pausa));
          await conn.commit();
          return resultado;
        } catch (error) {
          await conn.rollback();
          throw error;
        } finally {
          conn.release();
        }
      },
    };
  }

  async function ids(sql: string, params: unknown[] = []) {
    const [linhas] = await pool.query<RowDataPacket[]>(sql, params);
    return linhas.map((linha) => Number(linha.id));
  }

  async function consultar(executorId: number, sessionVersion: number) {
    return fazendasDaConsultaVenda(io(), { executorId, sessionVersionDaSessao: sessionVersion });
  }

  it("funcionário vê a venda da fazenda concedida e não a histórica de outra", async () => {
    const curral = await consultar(2, 1);
    expect(curral).toMatchObject({ ok: true, titularUserId: 1, fazendaIds: [10] });
    const retiro = await consultar(5, 1);
    expect(retiro).toMatchObject({ ok: true, titularUserId: 1, fazendaIds: [20] });
    if (!curral.ok || !retiro.ok) return;
    const doCurral = await ids(
      `SELECT id FROM vendas WHERE user_id = ? AND fazenda_id IN (${curral.fazendaIds.join(",")}) ORDER BY id`,
      [curral.titularUserId],
    );
    const doRetiro = await ids(
      `SELECT id FROM vendas WHERE user_id = ? AND fazenda_id IN (${retiro.fazendaIds.join(",")}) ORDER BY id`,
      [retiro.titularUserId],
    );
    expect(doCurral).toEqual([1, 2, 6, 7, 8, 9, 12]);
    expect(doRetiro).toEqual([3]);
    expect(doRetiro).not.toContain(2);
    const [animal] = await pool.query<RowDataPacket[]>("SELECT fazendaId FROM animais WHERE id = 90");
    expect(Number(animal[0]?.fazendaId)).toBe(20);
  });

  it("duas exclusões do mesmo rascunho deixam uma só retirada", async () => {
    const corrida = await Promise.allSettled([
      excluirRascunhoVenda(io(), 2, 1, 8),
      excluirRascunhoVenda(io(), 2, 1, 8),
    ]);
    expect(corrida.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(corrida.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect(await ids("SELECT id FROM vendas WHERE id = 8")).toEqual([]);
  });

  it("venda confirmada, com animal ou com título não é apagada", async () => {
    await expect(excluirRascunhoVenda(io(), 2, 1, 2)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(excluirRascunhoVenda(io(), 2, 1, 6)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(excluirRascunhoVenda(io(), 2, 1, 7)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(excluirRascunhoVenda(io(), 2, 1, 5)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await ids("SELECT id FROM vendas WHERE id IN (2, 5, 6, 7) ORDER BY id")).toEqual([2, 5, 6, 7]);
  });

  it("revogar a fazenda no meio da transação impede a exclusão", async () => {
    let soltar: () => void = () => undefined;
    const espera = new Promise<void>((resolver) => { soltar = resolver; });
    let segurou: () => void = () => undefined;
    const pronta = new Promise<void>((resolver) => { segurou = resolver; });
    const exclusao = excluirRascunhoVenda(io(async () => {
      segurou();
      await espera;
    }), 2, 1, 9);
    await pronta;
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 10");
    soltar();
    await expect(exclusao).rejects.toThrow();
    expect(await ids("SELECT id FROM vendas WHERE id = 9")).toEqual([9]);
    await pool.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1)");
  });

  it("revogar a permissão no meio da transação impede a exclusão", async () => {
    let soltar: () => void = () => undefined;
    const espera = new Promise<void>((resolver) => { soltar = resolver; });
    let segurou: () => void = () => undefined;
    const pronta = new Promise<void>((resolver) => { segurou = resolver; });
    const exclusao = excluirRascunhoVenda(io(async () => {
      segurou();
      await espera;
    }), 2, 1, 1);
    await pronta;
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = 'vendas.inativar'");
    soltar();
    await expect(exclusao).rejects.toThrow();
    expect(await ids("SELECT id FROM vendas WHERE id = 1")).toEqual([1]);
    await pool.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId)
      VALUES (2, 1, 'vendas.inativar', 1)
    `);
  });

  it("travas em ordem cruzada não deixam a venda pela metade", async () => {
    let soltar: () => void = () => undefined;
    const espera = new Promise<void>((resolver) => { soltar = resolver; });
    let segurou: () => void = () => undefined;
    const pronta = new Promise<void>((resolver) => { segurou = resolver; });
    const concorrente = (async () => {
      const conn = await pool.getConnection();
      try {
        await conn.query("SET SESSION innodb_lock_wait_timeout = 5");
        await conn.beginTransaction();
        await conn.query("SELECT id FROM vendas WHERE id = 12 FOR UPDATE");
        segurou();
        await espera;
        await conn.query("SELECT id FROM users WHERE id = 2 FOR UPDATE");
        await conn.rollback();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    })();
    await pronta;
    const exclusao = excluirRascunhoVenda(io(), 2, 1, 12);
    await new Promise((resolver) => setTimeout(resolver, 200));
    soltar();
    const resultados = await Promise.allSettled([concorrente, exclusao]);
    const sobrou = await ids("SELECT id FROM vendas WHERE id = 12");
    const exclusaoOk = resultados[1].status === "fulfilled";
    expect(exclusaoOk ? sobrou : sobrou).toEqual(exclusaoOk ? [] : [12]);
  });

  it("porta fechada não responde como sucesso", async () => {
    await expect(mysql.createConnection({
      host: "127.0.0.1",
      port: 3379,
      user: "root",
      password: "fechada",
      connectTimeout: 800,
    })).rejects.toThrow();
  });
});
