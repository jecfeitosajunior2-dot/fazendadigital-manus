import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import { criarPastoNaTransacao, editarPastoNaTransacao, type TransacaoCriacaoPasto, type TransacaoEdicaoPasto } from "./routers";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-h4ap-pastos";
const PORTA = 3360;
const SENHA = "isolado-h4ap";
const BANCO = "fd_h4ap";

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

async function conectar(banco?: string) {
  return mysql.createConnection({
    host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: banco, multipleStatements: true,
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

function pessoa(id: number, papel: IdentidadeUsuario["papel"]): IdentidadeUsuario {
  return {
    id, openId: `ficticio-openid-${id}`, name: "Teste", email: null,
    role: papel === "principal" ? "admin" : "user", papel,
    titularUserId: id === 9 ? 9 : 1, situacao: "ativo", sessionVersion: 0,
  };
}

function adaptadorCriacao(conn: mysql.PoolConnection): TransacaoCriacaoPasto {
  return {
    async travarUsuario(id) {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion
         FROM users WHERE id = ? FOR UPDATE`, [id]);
      const row = rows[0];
      if (!row) return null;
      return {
        id: Number(row.id), openId: String(row.openId ?? ""),
        name: row.name == null ? null : String(row.name),
        email: row.email == null ? null : String(row.email),
        role: row.role == null ? null : String(row.role),
        papel: String(row.papel), titularUserId: Number(row.titularUserId),
        situacao: String(row.situacao), sessionVersion: Number(row.sessionVersion ?? 0),
      };
    },
    async travarPermissoes(userId, titularUserId) {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT permissao FROM usuario_permissoes WHERE userId = ? AND titularUserId = ? FOR UPDATE",
        [userId, titularUserId]);
      return rows.map((row) => String(row.permissao));
    },
    async travarVinculos(userId) {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT userId, fazendaId FROM usuario_fazendas WHERE userId = ? FOR UPDATE", [userId]);
      return rows.map((row) => ({ userId: Number(row.userId), fazendaId: Number(row.fazendaId) }));
    },
    async travarFazenda(id) {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId FROM fazendas WHERE id = ? FOR UPDATE", [id]);
      const row = rows[0];
      return row ? { id: Number(row.id), userId: Number(row.userId) } : null;
    },
    async inserirPasto(valores) {
      const [result] = await conn.query<ResultSetHeader>(
        "INSERT INTO pastos (userId, fazendaId, nome, capacidade) VALUES (?, ?, ?, ?)",
        [valores.userId, valores.fazendaId, valores.nome, valores.capacidade ?? null],
      );
      return Number(result.insertId);
    },
  };
}

function adaptadorEdicao(conn: mysql.PoolConnection): TransacaoEdicaoPasto {
  const ler = async (id: number, titularUserId: number, travar: boolean) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, userId, fazendaId FROM pastos WHERE id = ? AND userId = ?${travar ? " FOR UPDATE" : ""}`,
      [id, titularUserId],
    );
    const row = rows[0];
    return row ? { id: Number(row.id), userId: Number(row.userId), fazendaId: Number(row.fazendaId) } : null;
  };
  return {
    travarUsuario: (id) => adaptadorCriacao(conn).travarUsuario(id),
    travarPermissoes: (userId, titularUserId) => adaptadorCriacao(conn).travarPermissoes(userId, titularUserId),
    travarVinculos: (userId) => adaptadorCriacao(conn).travarVinculos(userId),
    travarPasto: (id, titularUserId) => ler(id, titularUserId, true),
    async travarFazenda(id) {
      return adaptadorCriacao(conn).travarFazenda(id);
    },
    async atualizarPasto(id, titularUserId, valores) {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (valores.capacidade !== undefined) {
        sets.push("capacidade = ?");
        params.push(valores.capacidade);
      }
      if (valores.observacoes !== undefined) {
        sets.push("observacoes = ?");
        params.push(valores.observacoes);
      }
      if (sets.length === 0) return;
      params.push(id, titularUserId);
      await conn.query(`UPDATE pastos SET ${sets.join(", ")} WHERE id = ? AND userId = ?`, params);
    },
    relerPasto: (id, titularUserId) => ler(id, titularUserId, false),
  };
}

describe.sequential("pastos homologados em MySQL isolado", () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    expect(PORTA).not.toBe(3306);
    expect(BANCO).not.toBe("fazenda_digital");
    expect(CONTAINER).not.toBe("fazenda-digital-mysql");
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
    await docker(
      "run", "-d", "--name", CONTAINER,
      "-e", `MYSQL_ROOT_PASSWORD=${SENHA}`,
      "-e", `MYSQL_DATABASE=${BANCO}`,
      "-p", `127.0.0.1:${PORTA}:3306`,
      "mysql:8.4",
      "--character-set-server=utf8mb4",
      "--collation-server=utf8mb4_0900_ai_ci",
    );
    await esperarMysql();
    const conn = await conectar(BANCO);
    await conn.query(readFileSync(resolve(here, "administracao.isolado.sql"), "utf8"));
    await conn.query(`
      CREATE TABLE pastos (
        id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId int NOT NULL,
        fazendaId int NOT NULL,
        nome varchar(100) NOT NULL,
        capacidade int NULL,
        observacoes text NULL
      );
      CREATE TABLE lotes (
        id int NOT NULL PRIMARY KEY,
        userId int NOT NULL,
        fazendaId int NOT NULL,
        nome varchar(100) NOT NULL,
        pastoAtualId int NULL
      );
      CREATE TABLE animais (
        id int NOT NULL PRIMARY KEY,
        userId int NOT NULL,
        fazendaId int NOT NULL,
        loteId int NULL,
        pastoId int NULL,
        status varchar(20) NOT NULL
      );
      ALTER TABLE lotes ADD CONSTRAINT lotes_pasto_atual_fk
        FOREIGN KEY (pastoAtualId) REFERENCES pastos (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
      ALTER TABLE animais ADD CONSTRAINT animais_pasto_fk
        FOREIGN KEY (pastoId) REFERENCES pastos (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
    `);
    await conn.end();
    pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, connectionLimit: 4,
    });
  }, 120_000);

  beforeEach(async () => {
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM lotes");
    await pool.query("DELETE FROM pastos");
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query("DELETE FROM usuario_fazendas");
    await pool.query("DELETE FROM users");
    await pool.query("DELETE FROM fazendas");
    await pool.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Norte'), (20, 1, 'Sul'), (30, 9, 'Alheia')");
    await pool.query(
      `INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion, passwordHash) VALUES
       (1, 'ficticio-openid-1', 'Ana', 'ana@teste.isolado', 'admin', 'principal', 1, 'ativo', 0, NULL),
       (2, 'ficticio-openid-2', 'Comum', 'comum@teste.isolado', 'user', 'comum', 1, 'ativo', 0, NULL),
       (9, 'ficticio-openid-9', 'Beto', 'beto@teste.isolado', 'admin', 'principal', 9, 'ativo', 0, NULL)`,
    );
  });

  afterAll(async () => {
    await pool?.end();
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function pasto(id: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, userId, fazendaId, nome, capacidade, observacoes FROM pastos WHERE id = ?", [id]);
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id), userId: Number(row.userId), fazendaId: Number(row.fazendaId),
      nome: String(row.nome), capacidade: row.capacidade == null ? null : Number(row.capacidade),
      observacoes: row.observacoes == null ? null : String(row.observacoes),
    };
  }

  it("falha antes do commit não deixa pasto e não libera o espelho", async () => {
    const conn = await pool.getConnection();
    let espelho = false;
    try {
      await conn.beginTransaction();
      await criarPastoNaTransacao(pessoa(1, "principal"), { fazendaId: 10, nome: "Novo" }, adaptadorCriacao(conn));
      throw new Error("falha de gravação");
    } catch (erro) {
      await conn.rollback();
      expect(erro).toBeInstanceOf(Error);
    } finally {
      conn.release();
    }
    const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM pastos");
    expect(rows).toEqual([]);
    expect(espelho).toBe(false);
  });

  it("duas criações simultâneas ficam na conta do principal", async () => {
    async function criar(nome: string) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const id = await criarPastoNaTransacao(pessoa(1, "principal"), { fazendaId: 10, nome }, adaptadorCriacao(conn));
        await conn.commit();
        return id;
      } catch (erro) {
        await conn.rollback();
        throw erro;
      } finally {
        conn.release();
      }
    }
    const ids = await Promise.all([criar("Um"), criar("Dois")]);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT userId, fazendaId, nome FROM pastos ORDER BY nome");
    expect(ids).toHaveLength(2);
    expect(rows.map((row) => ({ userId: Number(row.userId), fazendaId: Number(row.fazendaId), nome: String(row.nome) }))).toEqual([
      { userId: 1, fazendaId: 10, nome: "Dois" },
      { userId: 1, fazendaId: 10, nome: "Um" },
    ]);
  });

  it("edição e movimentação de lote convivem sem trocar a fazenda do pasto", async () => {
    await pool.query("INSERT INTO pastos (id, userId, fazendaId, nome, capacidade) VALUES (7, 1, 10, 'Norte', 10)");
    await pool.query("INSERT INTO lotes (id, userId, fazendaId, nome, pastoAtualId) VALUES (4, 1, 10, 'Lote', NULL)");
    const edicao = (async () => {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await editarPastoNaTransacao(pessoa(1, "principal"), { id: 7, capacidade: 40 }, adaptadorEdicao(conn));
        await conn.commit();
      } catch (erro) {
        await conn.rollback();
        throw erro;
      } finally {
        conn.release();
      }
    })();
    const movimento = pool.query("UPDATE lotes SET pastoAtualId = 7 WHERE id = 4 AND userId = 1");
    await Promise.all([edicao, movimento]);
    expect(await pasto(7)).toMatchObject({ userId: 1, fazendaId: 10, capacidade: 40 });
    const [lotes] = await pool.query<RowDataPacket[]>("SELECT pastoAtualId, fazendaId, userId FROM lotes WHERE id = 4");
    expect(lotes[0]).toMatchObject({ pastoAtualId: 7, fazendaId: 10, userId: 1 });
  });

  it("edição do pasto não reescreve a transferência do animal", async () => {
    await pool.query("INSERT INTO pastos (id, userId, fazendaId, nome, capacidade) VALUES (7, 1, 10, 'Norte', 10)");
    await pool.query("INSERT INTO animais (id, userId, fazendaId, loteId, pastoId, status) VALUES (5, 1, 10, NULL, 7, 'ativo')");
    const edicao = (async () => {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await editarPastoNaTransacao(pessoa(1, "principal"), { id: 7, observacoes: "Seco" }, adaptadorEdicao(conn));
        await conn.commit();
      } catch (erro) {
        await conn.rollback();
        throw erro;
      } finally {
        conn.release();
      }
    })();
    const transferencia = pool.query("UPDATE animais SET fazendaId = 20 WHERE id = 5 AND userId = 1");
    await Promise.all([edicao, transferencia]);
    expect(await pasto(7)).toMatchObject({ fazendaId: 10, userId: 1, observacoes: "Seco" });
    const [animais] = await pool.query<RowDataPacket[]>("SELECT fazendaId, pastoId, userId FROM animais WHERE id = 5");
    expect(animais[0]).toMatchObject({ fazendaId: 20, pastoId: 7, userId: 1 });
  });

  it("pasto referenciado não é apagado e a fazenda do vínculo permanece", async () => {
    await pool.query("INSERT INTO pastos (id, userId, fazendaId, nome, capacidade) VALUES (7, 1, 10, 'Norte', 10)");
    await pool.query("INSERT INTO lotes (id, userId, fazendaId, nome, pastoAtualId) VALUES (4, 1, 10, 'Lote', 7)");
    await expect(pool.query("DELETE FROM pastos WHERE id = 7")).rejects.toMatchObject({ errno: 1451 });
    expect(await pasto(7)).toMatchObject({ id: 7, fazendaId: 10 });
    const [lotes] = await pool.query<RowDataPacket[]>("SELECT pastoAtualId FROM lotes WHERE id = 4");
    expect(Number(lotes[0]?.pastoAtualId)).toBe(7);
  });

  it("revogação da permissão vista na mesma transação não cria pasto", async () => {
    await pool.query("INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, 'pastos.criar', 1)");
    await pool.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1)");
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("DELETE FROM usuario_permissoes WHERE userId = 2");
      await expect(criarPastoNaTransacao(
        pessoa(2, "comum"),
        { fazendaId: 10, nome: "Sem permissão" },
        adaptadorCriacao(conn),
      )).rejects.toMatchObject({ code: "FORBIDDEN" });
      await conn.rollback();
    } finally {
      conn.release();
    }
    const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM pastos");
    expect(rows).toEqual([]);
  });
});
