import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ConsultaAutorizacaoPersistida, LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  PERMISSAO_CONFIRMAR_COMPRAS,
  PERMISSAO_VISUALIZAR_COMPRAS,
  autorizarCompraNaFazenda,
  fazendasDaConsultaCompra,
} from "./consultaCompraAutorizada";
import {
  PERMISSAO_ESTORNAR_ESTOQUE,
  autorizarEstoqueNaFazenda,
  type IoEstoque,
} from "./consultaEstoqueAutorizada";
import { afirmarBancoDescartavel } from "./isolamentoMysql";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-h4az-compras";
const PORTA = 3370;
const SENHA = "isolado-h4az";
const BANCO = "fd_h4az";

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
CREATE TABLE compras (
  id int NOT NULL, userId int NOT NULL, fazendaId int NULL, status varchar(20) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE compra_grupos (
  id int NOT NULL, user_id int NOT NULL, compra_id int NOT NULL, quantidade int NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NULL,
  brinco varchar(50) NULL, status varchar(20) NOT NULL, compraId int NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE estoque_operacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, idempotencyKey varchar(80) NOT NULL,
  valorTotal decimal(12,2) NOT NULL, PRIMARY KEY (id),
  UNIQUE KEY estoque_operacoes_idem_uq (userId, idempotencyKey)
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

function mysqlCli(sql: string, banco = BANCO) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolver, rejeitar) => {
    const filho = spawn("docker", [
      "exec", "-i", CONTAINER, "mysql", "-uroot", `-p${SENHA}`, "--default-character-set=utf8mb4", banco,
    ], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    filho.stdout.setEncoding("utf8");
    filho.stderr.setEncoding("utf8");
    filho.stdout.on("data", (pedaço) => { stdout += pedaço; });
    filho.stderr.on("data", (pedaço) => { stderr += pedaço; });
    filho.on("error", rejeitar);
    filho.on("close", (code) => resolver({ code: code ?? 1, stdout, stderr }));
    filho.stdin.write(sql);
    filho.stdin.end();
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
  if (valor == null || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function consultas(conn: mysql.PoolConnection | mysql.Connection): ConsultaAutorizacaoPersistida {
  return {
    async usuario(userId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion FROM users WHERE id = ? FOR UPDATE",
        [userId],
      );
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id),
        openId: String(linha.openId),
        name: linha.name == null ? null : String(linha.name),
        email: linha.email == null ? null : String(linha.email),
        role: linha.role,
        papel: linha.papel,
        titularUserId: numero(linha.titularUserId),
        situacao: linha.situacao,
        sessionVersion: Number(linha.sessionVersion),
      } as LinhaUsuarioCadastro;
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
        await conn.beginTransaction();
        try {
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

async function contar(pool: mysql.Pool, sql: string, params: unknown[] = []) {
  const [linhas] = await pool.query<RowDataPacket[]>(sql, params);
  return Number(linhas[0]?.total ?? 0);
}

describe("compras no MySQL descartável", () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    await docker("rm", "-f", CONTAINER);
    await docker(
      "run", "-d", "--name", CONTAINER,
      "-e", `MYSQL_ROOT_PASSWORD=${SENHA}`,
      "-e", `MYSQL_DATABASE=${BANCO}`,
      "-p", `127.0.0.1:${PORTA}:3306`,
      "mysql:8.4",
    );
    await esperarMysql();
    afirmarBancoDescartavel(alvo());
    const conn = await conectar(BANCO);
    await conn.query(ESQUEMA);
    await conn.query(`
      INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion) VALUES
        (1, 'p', 'Titular', NULL, 'admin', 'principal', 1, 'ativo', 0),
        (2, 'f', 'Funcionario', NULL, 'user', 'comum', 1, 'ativo', 0),
        (3, 'o', 'Outro', NULL, 'admin', 'principal', 3, 'ativo', 0);
      INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (11, 1, 'Retiro'), (30, 3, 'Alheia');
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1);
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'compras.visualizar', 1),
        (2, 1, 'compras.confirmar', 1);
      INSERT INTO compras (id, userId, fazendaId, status) VALUES
        (100, 1, 10, 'concluido'),
        (101, 1, 11, 'concluido'),
        (200, 3, 30, 'concluido');
      INSERT INTO compra_grupos (id, user_id, compra_id, quantidade) VALUES (1, 1, 100, 2), (2, 1, 100, 1);
    `);
    await conn.end();
    const proposta = readFileSync(resolve(here, "../drizzle/propostas/0071_animais_brinco_ativo_fazenda_uq.sql"), "utf8");
    const aplicado = await mysqlCli(proposta);
    if (aplicado.code !== 0 || !aplicado.stdout.includes("ok")) {
      throw new Error(aplicado.stderr || aplicado.stdout || "0071 não aplicou");
    }
    const { host, port, user, password, database } = alvo();
    pool = mysql.createPool({ host, port, user, password, database, connectionLimit: 8, dateStrings: true });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await docker("rm", "-f", CONTAINER);
  });

  it("funcionário vê só as fazendas concedidas do titular", async () => {
    const acesso = await fazendasDaConsultaCompra(io(pool), {
      executorId: 2,
      sessionVersionDaSessao: 0,
    });
    expect(acesso.ok).toBe(true);
    if (!acesso.ok) return;
    expect(acesso.titularUserId).toBe(1);
    expect(acesso.fazendaIds).toEqual([10]);
    expect(acesso.papel).toBe("comum");
  });

  it("a consulta devolve só a compra do titular na fazenda concedida", async () => {
    const acesso = await fazendasDaConsultaCompra(io(pool), {
      executorId: 2,
      sessionVersionDaSessao: 0,
    });
    expect(acesso.ok).toBe(true);
    if (!acesso.ok) return;
    const marcas = acesso.fazendaIds.map(() => "?").join(", ");
    const [linhas] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM compras WHERE userId = ? AND fazendaId IN (${marcas}) ORDER BY id`,
      [acesso.titularUserId, ...acesso.fazendaIds],
    );
    expect(linhas.map((linha) => Number(linha.id))).toEqual([100]);
    expect(await contar(pool, "SELECT COUNT(*) AS total FROM compras WHERE userId = 3")).toBe(1);
  });

  it("principal administra as duas fazendas da conta", async () => {
    const acesso = await fazendasDaConsultaCompra(io(pool), {
      executorId: 1,
      sessionVersionDaSessao: 0,
    });
    expect(acesso.ok).toBe(true);
    if (!acesso.ok) return;
    expect(acesso.titularUserId).toBe(1);
    expect(acesso.fazendaIds).toEqual([10, 11]);
  });

  it("sem permissão, outra fazenda e outro titular são recusados", async () => {
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = ?", [PERMISSAO_VISUALIZAR_COMPRAS]);
    const semPermissao = await fazendasDaConsultaCompra(io(pool), {
      executorId: 2,
      sessionVersionDaSessao: 0,
    });
    expect(semPermissao.ok).toBe(false);
    await pool.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, ?, 1)",
      [PERMISSAO_VISUALIZAR_COMPRAS],
    );
    const outraFazenda = await autorizarCompraNaFazenda(io(pool), {
      executorId: 2,
      sessionVersionDaSessao: 0,
      fazendaId: 11,
      permissaoId: PERMISSAO_CONFIRMAR_COMPRAS,
    }, "sem");
    expect(outraFazenda.ok).toBe(false);
    const outroTitular = await autorizarCompraNaFazenda(io(pool), {
      executorId: 2,
      sessionVersionDaSessao: 0,
      fazendaId: 30,
      permissaoId: PERMISSAO_CONFIRMAR_COMPRAS,
    }, "sem");
    expect(outroTitular.ok).toBe(false);
  });

  it("dois recebimentos do mesmo grupo com brincos diferentes gravem dois animais", async () => {
    async function receber(brinco: string) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query("SELECT id FROM compra_grupos WHERE id = 1 FOR UPDATE");
        const [contagem] = await conn.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS total FROM animais WHERE compraId = 100 AND userId = 1",
        );
        if (Number(contagem[0]?.total) >= 2) throw new Error("grupo esgotado");
        await conn.query(
          "INSERT INTO animais (userId, fazendaId, brinco, status, compraId) VALUES (1, 10, ?, 'ativo', 100)",
          [brinco],
        );
        await conn.commit();
      } catch (erro) {
        await conn.rollback();
        throw erro;
      } finally {
        conn.release();
      }
    }
    await Promise.all([receber("A1"), receber("A2")]);
    expect(await contar(pool, "SELECT COUNT(*) AS total FROM animais WHERE compraId = 100")).toBe(2);
  });

  it("o mesmo brinco em duas transações sobrepostas deixa um animal", async () => {
    async function receber() {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          "INSERT INTO animais (userId, fazendaId, brinco, status, compraId) VALUES (1, 10, 'DUP', 'ativo', 100)",
        );
        await conn.commit();
        return "ok";
      } catch (erro) {
        await conn.rollback();
        const codigo = (erro as { errno?: number }).errno;
        if (codigo === 1062) return "duplicado";
        throw erro;
      } finally {
        conn.release();
      }
    }
    const resultados = await Promise.all([receber(), receber()]);
    expect(resultados.sort()).toEqual(["duplicado", "ok"]);
    expect(await contar(pool, "SELECT COUNT(*) AS total FROM animais WHERE brinco = 'DUP'")).toBe(1);
  });

  it("a mesma chave de operação não cria a segunda obrigação", async () => {
    async function gravar(valor: number) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          "INSERT INTO estoque_operacoes (userId, idempotencyKey, valorTotal) VALUES (1, 'chave-compra', ?)",
          [valor],
        );
        await conn.commit();
        return "ok";
      } catch (erro) {
        await conn.rollback();
        if ((erro as { errno?: number }).errno === 1062) return "duplicado";
        throw erro;
      } finally {
        conn.release();
      }
    }
    const resultados = await Promise.all([gravar(10), gravar(99)]);
    expect(resultados.filter((item) => item === "ok")).toHaveLength(1);
    expect(resultados.filter((item) => item === "duplicado")).toHaveLength(1);
    expect(await contar(pool, "SELECT COUNT(*) AS total FROM estoque_operacoes WHERE idempotencyKey = 'chave-compra'")).toBe(1);
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT valorTotal FROM estoque_operacoes WHERE userId = 1 AND idempotencyKey = 'chave-compra'",
    );
    expect([10, 99]).toContain(Number(linhas[0]?.valorTotal));
  });

  it("dois cancelamentos da mesma compra deixam um status cancelado", async () => {
    async function cancelar() {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT status FROM compras WHERE id = 100 AND userId = 1 FOR UPDATE",
        );
        if (linhas[0]?.status !== "concluido") {
          await conn.rollback();
          return "ja";
        }
        const [resultado] = await conn.query<mysql.ResultSetHeader>(
          "UPDATE compras SET status = 'cancelado' WHERE id = 100 AND userId = 1 AND status = 'concluido'",
        );
        await conn.commit();
        return resultado.affectedRows === 1 ? "ok" : "ja";
      } catch (erro) {
        await conn.rollback();
        throw erro;
      } finally {
        conn.release();
      }
    }
    const resultados = await Promise.all([cancelar(), cancelar()]);
    expect(resultados.sort()).toEqual(["ja", "ok"]);
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT status FROM compras WHERE id = 100");
    expect(linhas[0]?.status).toBe("cancelado");
    await pool.query("UPDATE compras SET status = 'concluido' WHERE id = 100");
  });

  it("falha antes do commit não deixa animal", async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        "INSERT INTO animais (userId, fazendaId, brinco, status, compraId) VALUES (1, 10, 'ROLLBACK', 'ativo', 100)",
      );
      await conn.rollback();
    } finally {
      conn.release();
    }
    expect(await contar(pool, "SELECT COUNT(*) AS total FROM animais WHERE brinco = 'ROLLBACK'")).toBe(0);
  });

  it("duas travas em ordem invertida produzem deadlock", async () => {
    const a = await pool.getConnection();
    const b = await pool.getConnection();
    try {
      await a.query("SET innodb_lock_wait_timeout = 2");
      await b.query("SET innodb_lock_wait_timeout = 2");
      await a.beginTransaction();
      await b.beginTransaction();
      await a.query("SELECT id FROM compra_grupos WHERE id = 1 FOR UPDATE");
      await b.query("SELECT id FROM compra_grupos WHERE id = 2 FOR UPDATE");
      const disputas = await Promise.allSettled([
        a.query("SELECT id FROM compra_grupos WHERE id = 2 FOR UPDATE"),
        b.query("SELECT id FROM compra_grupos WHERE id = 1 FOR UPDATE"),
      ]);
      const erros = disputas.filter((item) => item.status === "rejected").map((item) => item.reason as { errno?: number });
      expect(erros.some((erro) => erro.errno === 1213 || erro.errno === 1205)).toBe(true);
    } finally {
      await a.rollback();
      await b.rollback();
      a.release();
      b.release();
    }
  });

  it("permissão e fazenda revogadas passam a recusar", async () => {
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = 'compras.confirmar'");
    const semPermissao = await autorizarCompraNaFazenda(io(pool), {
      executorId: 2,
      sessionVersionDaSessao: 0,
      fazendaId: 10,
      permissaoId: PERMISSAO_CONFIRMAR_COMPRAS,
    }, "sem");
    expect(semPermissao.ok).toBe(false);
    await pool.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, 'compras.confirmar', 1)",
    );
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 10");
    const semFazenda = await autorizarCompraNaFazenda(io(pool), {
      executorId: 2,
      sessionVersionDaSessao: 0,
      fazendaId: 10,
      permissaoId: PERMISSAO_CONFIRMAR_COMPRAS,
    }, "sem");
    expect(semFazenda.ok).toBe(false);
    await pool.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1)");
  });

  it("principal e funcionário autorizado estornam no titular, não na própria ficha", async () => {
    await pool.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, ?, 1)",
      [PERMISSAO_ESTORNAR_ESTOQUE],
    );
    const principal = await autorizarEstoqueNaFazenda(io(pool), {
      executorId: 1,
      sessionVersionDaSessao: 0,
      fazendaId: 10,
      permissaoId: PERMISSAO_ESTORNAR_ESTOQUE,
    }, "sem");
    const funcionario = await autorizarEstoqueNaFazenda(io(pool), {
      executorId: 2,
      sessionVersionDaSessao: 0,
      fazendaId: 10,
      permissaoId: PERMISSAO_ESTORNAR_ESTOQUE,
    }, "sem");
    expect(principal.ok && funcionario.ok).toBe(true);
    if (!principal.ok || !funcionario.ok) return;
    expect(principal.titularUserId).toBe(1);
    expect(funcionario.titularUserId).toBe(1);
  });

  it("estorno sem permissão, sem fazenda ou de outra conta é recusado", async () => {
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = ?", [PERMISSAO_ESTORNAR_ESTOQUE]);
    const semPermissao = await autorizarEstoqueNaFazenda(io(pool), {
      executorId: 2,
      sessionVersionDaSessao: 0,
      fazendaId: 10,
      permissaoId: PERMISSAO_ESTORNAR_ESTOQUE,
    }, "sem");
    expect(semPermissao.ok).toBe(false);
    await pool.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, ?, 1)",
      [PERMISSAO_ESTORNAR_ESTOQUE],
    );
    const semFazenda = await autorizarEstoqueNaFazenda(io(pool), {
      executorId: 2,
      sessionVersionDaSessao: 0,
      fazendaId: 11,
      permissaoId: PERMISSAO_ESTORNAR_ESTOQUE,
    }, "sem");
    const outraConta = await autorizarEstoqueNaFazenda(io(pool), {
      executorId: 2,
      sessionVersionDaSessao: 0,
      fazendaId: 30,
      permissaoId: PERMISSAO_ESTORNAR_ESTOQUE,
    }, "sem");
    expect(semFazenda.ok).toBe(false);
    expect(outraConta.ok).toBe(false);
  });

  it("dois estornos da mesma operação deixam um só status estornado", async () => {
    await pool.query("ALTER TABLE estoque_operacoes ADD COLUMN status varchar(20) NOT NULL DEFAULT 'confirmada'");
    const [inserido] = await pool.query<mysql.ResultSetHeader>(
      "INSERT INTO estoque_operacoes (userId, idempotencyKey, valorTotal, status) VALUES (1, 'op-estorno', 40, 'confirmada')",
    );
    const operacaoId = inserido.insertId;
    async function estornar() {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT status FROM estoque_operacoes WHERE id = ? AND userId = 1 FOR UPDATE",
          [operacaoId],
        );
        if (linhas[0]?.status !== "confirmada") {
          await conn.rollback();
          return "ja";
        }
        await conn.query(
          "UPDATE estoque_operacoes SET status = 'estornada' WHERE id = ? AND userId = 1 AND status = 'confirmada'",
          [operacaoId],
        );
        await conn.commit();
        return "ok";
      } catch (erro) {
        await conn.rollback();
        throw erro;
      } finally {
        conn.release();
      }
    }
    const resultados = await Promise.all([estornar(), estornar()]);
    expect(resultados.sort()).toEqual(["ja", "ok"]);
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT status, userId FROM estoque_operacoes WHERE id = ?",
      [operacaoId],
    );
    expect(linhas[0]?.status).toBe("estornada");
    expect(Number(linhas[0]?.userId)).toBe(1);
  });

  it("MySQL fechado não confirma a operação", async () => {
    await expect(mysql.createConnection({
      host: "127.0.0.1",
      port: 9,
      user: "root",
      password: "fechado",
      database: "fd_teste_nao_conectar",
      connectTimeout: 1000,
    }).then((conn) => conn.query("SELECT 1"))).rejects.toThrow();
  });
});
