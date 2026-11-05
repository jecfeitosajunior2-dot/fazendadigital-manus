import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { TRPCError } from "@trpc/server";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import { editarPastoNaTransacao, type TransacaoEdicaoPasto } from "./routers";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-pastoupdate-785c27e";
const PORTA = 3330;
const SENHA = "isolado-785c27e";
const BANCO = "fd_785c27e";

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

async function conectar(banco?: string) {
  return mysql.createConnection({
    host: "127.0.0.1",
    port: PORTA,
    user: "root",
    password: SENHA,
    database: banco,
    multipleStatements: true,
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
    role: papel === "principal" ? "admin" : "user", papel, titularUserId: 1,
    situacao: "ativo", sessionVersion: 0,
  };
}

function adaptador(conn: mysql.PoolConnection | mysql.Connection): TransacaoEdicaoPasto {
  const lerPasto = async (id: number, titularUserId: number, travar: boolean) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, userId, fazendaId FROM pastos WHERE id = ? AND userId = ?${travar ? " FOR UPDATE" : ""}`,
      [id, titularUserId],
    );
    const row = rows[0];
    if (!row) return null;
    return { id: Number(row.id), userId: Number(row.userId), fazendaId: Number(row.fazendaId) };
  };
  return {
    async travarUsuario(id) {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion
         FROM users WHERE id = ? FOR UPDATE`,
        [id],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: Number(row.id),
        openId: String(row.openId ?? ""),
        name: row.name == null ? null : String(row.name),
        email: row.email == null ? null : String(row.email),
        role: row.role == null ? null : String(row.role),
        papel: String(row.papel),
        titularUserId: Number(row.titularUserId),
        situacao: String(row.situacao),
        sessionVersion: Number(row.sessionVersion ?? 0),
      };
    },
    async travarPermissoes(userId, titularUserId) {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT permissao FROM usuario_permissoes WHERE userId = ? AND titularUserId = ? FOR UPDATE",
        [userId, titularUserId],
      );
      return rows.map((row) => String(row.permissao));
    },
    async travarVinculos(userId) {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT userId, fazendaId FROM usuario_fazendas WHERE userId = ? FOR UPDATE",
        [userId],
      );
      return rows.map((row) => ({ userId: Number(row.userId), fazendaId: Number(row.fazendaId) }));
    },
    travarPasto: (id, titularUserId) => lerPasto(id, titularUserId, true),
    async travarFazenda(id) {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId FROM fazendas WHERE id = ? FOR UPDATE",
        [id],
      );
      const row = rows[0];
      if (!row) return null;
      return { id: Number(row.id), userId: Number(row.userId) };
    },
    async atualizarPasto(id, titularUserId, valores) {
      const permitidos = ["nome", "sigla", "tipo", "tipoPastagem", "area", "incluirArea", "capacidade", "status", "observacoes"] as const;
      const partes: string[] = [];
      const params: unknown[] = [];
      for (const campo of permitidos) {
        if (valores[campo] === undefined) continue;
        partes.push(`${campo} = ?`);
        params.push(valores[campo]);
      }
      if (partes.length === 0) return;
      params.push(id, titularUserId);
      await conn.query(`UPDATE pastos SET ${partes.join(", ")} WHERE id = ? AND userId = ?`, params);
    },
    relerPasto: (id, titularUserId) => lerPasto(id, titularUserId, false),
  };
}

describe.sequential("pastos.update em MySQL isolado", () => {
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
    const [banco] = await conn.query<RowDataPacket[]>("SELECT DATABASE() AS nome");
    expect(banco[0]?.nome).toBe(BANCO);
    await conn.query(readFileSync(resolve(here, "administracao.isolado.sql"), "utf8"));
    await conn.query(`
      CREATE TABLE pastos (
        id int NOT NULL PRIMARY KEY,
        userId int NOT NULL,
        fazendaId int NOT NULL,
        nome varchar(100) NOT NULL,
        sigla varchar(20) NULL,
        tipo varchar(80) NULL DEFAULT 'Pasto',
        area decimal(10,2) NULL,
        incluirArea tinyint NULL DEFAULT 1,
        capacidade int NULL,
        status varchar(30) NULL DEFAULT 'ativo',
        observacoes text NULL
      )
    `);
    await conn.end();
    pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, database: BANCO, user: "root", password: SENHA, connectionLimit: 6,
    });
  }, 120_000);

  beforeEach(async () => {
    await pool.query("DELETE FROM pastos");
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query("DELETE FROM usuario_fazendas");
    await pool.query("DELETE FROM users");
    await pool.query("DELETE FROM fazendas");
    await pool.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Fazenda Norte'), (20, 1, 'Fazenda Sul'), (30, 9, 'Fazenda Alheia')");
    await pool.query(
      `INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion, passwordHash) VALUES
       (1, 'ficticio-openid-1', 'Ana', 'ana@teste.isolado', 'admin', 'principal', 1, 'ativo', 0, NULL),
       (2, 'ficticio-openid-2', 'Comum', 'comum@teste.isolado', 'user', 'comum', 1, 'ativo', 0, NULL),
       (3, 'ficticio-openid-3', 'Secundario', 'secundario@teste.isolado', 'user', 'secundario', 1, 'ativo', 0, NULL),
       (9, 'ficticio-openid-9', 'Beto', 'beto@teste.isolado', 'admin', 'principal', 9, 'ativo', 0, NULL)`,
    );
    await pool.query(
      `INSERT INTO pastos (id, userId, fazendaId, nome, sigla, tipo, area, incluirArea, capacidade, status, observacoes) VALUES
       (7, 1, 10, 'Pasto Norte', 'PN', 'Pasto', 12.50, 1, 40, 'ativo', 'Seco'),
       (8, 1, 20, 'Pasto Sul', 'PS', 'Pasto', 8.00, 1, 25, 'ativo', NULL),
       (9, 9, 30, 'Pasto Alheio', NULL, 'Pasto', NULL, 1, NULL, 'ativo', 'secreto'),
       (15, 1, 30, 'Cruzado', NULL, 'Pasto', NULL, 1, NULL, 'ativo', NULL)`,
    );
    await pool.query(
      `INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
       (3, 1, 'pastos.editar', 1), (2, 1, 'animais.visualizar', 1)`,
    );
    await pool.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (3, 10, 1), (2, 10, 1)");
  });

  afterAll(async () => {
    await pool?.end();
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function tentar(identidade: IdentidadeUsuario, campos: { id: number; nome?: string; status?: "ativo" | "descanso" | "vazio" | "reforma" | "interditado" | "reserva" | "sem_uso"; capacidade?: number }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await editarPastoNaTransacao(identidade, campos, adaptador(conn));
      await conn.commit();
      return { success: true as const };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async function pasto(id: number) {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT id, userId, fazendaId, nome, status, observacoes, capacidade FROM pastos WHERE id = ?", [id]);
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      userId: Number(row.userId),
      fazendaId: Number(row.fazendaId),
      nome: String(row.nome),
      status: String(row.status),
      observacoes: row.observacoes == null ? null : String(row.observacoes),
      capacidade: row.capacidade == null ? null : Number(row.capacidade),
    };
  }

  it("A. Principal edita o pasto próprio", async () => {
    const resposta = await tentar(pessoa(1, "principal"), { id: 7, nome: "Norte Novo" });
    expect(resposta).toEqual({ success: true });
    expect(await pasto(7)).toMatchObject({ userId: 1, fazendaId: 10, nome: "Norte Novo", observacoes: "Seco" });
  });

  it("B. Secundário edita o pasto da fazenda concedida", async () => {
    await tentar(pessoa(3, "secundario"), { id: 7, status: "descanso" });
    expect(await pasto(7)).toMatchObject({ userId: 1, fazendaId: 10, nome: "Pasto Norte", status: "descanso" });
  });

  it("C. Comum edita só com a permissão", async () => {
    await expect(tentar(pessoa(2, "comum"), { id: 7, nome: "Sem Permissão" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await pasto(7))?.nome).toBe("Pasto Norte");
    await pool.query("INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, 'pastos.editar', 1)");
    expect(await tentar(pessoa(2, "comum"), { id: 7, nome: "Do Comum" })).toEqual({ success: true });
    expect(await pasto(7)).toMatchObject({ userId: 1, nome: "Do Comum" });
  });

  it("D. Pasto de outra conta não muda", async () => {
    await expect(tentar(pessoa(1, "principal"), { id: 9, nome: "Invasão" })).rejects.toMatchObject({
      code: "NOT_FOUND", message: "Pasto não encontrado.",
    });
    expect(await pasto(9)).toMatchObject({ userId: 9, nome: "Pasto Alheio", observacoes: "secreto" });
    await expect(tentar(pessoa(1, "principal"), { id: 15, nome: "Cruzado Novo" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await pasto(15))?.nome).toBe("Cruzado");
  });

  it("E. Fazenda não concedida não muda o pasto", async () => {
    await expect(tentar(pessoa(3, "secundario"), { id: 8, nome: "Fora" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await pasto(8)).toMatchObject({ nome: "Pasto Sul", userId: 1, fazendaId: 20 });
  });

  it("F. Sem o vínculo, a edição seguinte não grava", async () => {
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 3");
    await expect(tentar(pessoa(3, "secundario"), { id: 7, nome: "Depois" })).rejects.toBeInstanceOf(TRPCError);
    expect((await pasto(7))?.nome).toBe("Pasto Norte");
  });

  it("G. Edição e exclusão concorrentes esperam a trava", async () => {
    const a = await pool.getConnection();
    const b = await pool.getConnection();
    const c = await pool.getConnection();
    try {
      await a.beginTransaction();
      await editarPastoNaTransacao(pessoa(3, "secundario"), { id: 7, nome: "Durante a Trava" }, adaptador(a));
      await b.query("SET innodb_lock_wait_timeout = 3");
      let editou = false;
      const esperaEdicao = (async () => {
        await b.beginTransaction();
        await editarPastoNaTransacao(pessoa(1, "principal"), { id: 7, nome: "Concorrente" }, adaptador(b));
        await b.commit();
        editou = true;
      })();
      await new Promise((resolver) => setTimeout(resolver, 400));
      expect(editou).toBe(false);
      await a.commit();
      await esperaEdicao;
      expect(editou).toBe(true);
      expect(await pasto(7)).toMatchObject({ nome: "Concorrente", userId: 1, fazendaId: 10 });

      await a.beginTransaction();
      await editarPastoNaTransacao(pessoa(1, "principal"), { id: 7, nome: "Segura" }, adaptador(a));
      await c.query("SET innodb_lock_wait_timeout = 3");
      let apagou = false;
      const esperaExclusao = c.query("DELETE FROM pastos WHERE id = 7").then(() => { apagou = true; });
      await new Promise((resolver) => setTimeout(resolver, 400));
      expect(apagou).toBe(false);
      await a.commit();
      await esperaExclusao;
      expect(apagou).toBe(true);
      await expect(tentar(pessoa(1, "principal"), { id: 7, nome: "Sumiu" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(await pasto(7)).toBeNull();
    } finally {
      await a.rollback().catch(() => undefined);
      await b.rollback().catch(() => undefined);
      a.release();
      b.release();
      c.release();
    }
  });

  it("H. Campos gravados e retorno permanecem", async () => {
    const resposta = await tentar(pessoa(1, "principal"), { id: 7, nome: "Pasto Completo", capacidade: 12, status: "reserva" });
    expect(resposta).toEqual({ success: true });
    const row = await pasto(7);
    expect(row).toMatchObject({
      id: 7, userId: 1, fazendaId: 10, nome: "Pasto Completo", capacidade: 12, status: "reserva", observacoes: "Seco",
    });
    await tentar(pessoa(1, "principal"), { id: 7, nome: "Pasto Completo" });
    expect((await pasto(7))?.nome).toBe("Pasto Completo");
  });
});
