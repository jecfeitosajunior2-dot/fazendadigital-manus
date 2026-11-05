import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { TRPCError } from "@trpc/server";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import { criarPastoNaTransacao, type TransacaoCriacaoPasto } from "./routers";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-pastocreate-785c27d";
const PORTA = 3329;
const SENHA = "isolado-785c27d";
const BANCO = "fd_785c27d";

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

function pessoa(id: number, papel: IdentidadeUsuario["papel"], sessionVersion = 0): IdentidadeUsuario {
  return {
    id, openId: `ficticio-openid-${id}`, name: "Teste", email: null,
    role: papel === "principal" ? "admin" : "user", papel, titularUserId: papel === "principal" && id === 9 ? 9 : 1,
    situacao: "ativo", sessionVersion,
  };
}

function adaptador(conn: mysql.PoolConnection | mysql.Connection): TransacaoCriacaoPasto {
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
    async travarFazenda(id) {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId FROM fazendas WHERE id = ? FOR UPDATE",
        [id],
      );
      const row = rows[0];
      if (!row) return null;
      return { id: Number(row.id), userId: Number(row.userId) };
    },
    async inserirPasto(valores) {
      const colunas = ["userId", "fazendaId", "nome"] as const;
      const extras = ["sigla", "tipo", "tipoPastagem", "area", "incluirArea", "capacidade", "status", "observacoes"] as const;
      const nomes = [...colunas];
      const marcas = ["?", "?", "?"];
      const params: unknown[] = [valores.userId, valores.fazendaId, valores.nome];
      for (const campo of extras) {
        if (valores[campo] === undefined) continue;
        nomes.push(campo);
        marcas.push("?");
        params.push(valores[campo]);
      }
      const [result] = await conn.query<ResultSetHeader>(
        `INSERT INTO pastos (${nomes.join(", ")}) VALUES (${marcas.join(", ")})`,
        params,
      );
      return Number(result.insertId);
    },
  };
}

describe.sequential("pastos.create em MySQL isolado", () => {
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
        id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId int NOT NULL,
        fazendaId int NOT NULL,
        nome varchar(100) NOT NULL,
        sigla varchar(20) NULL,
        tipo varchar(80) NULL DEFAULT 'Pasto',
        tipoPastagem varchar(80) NULL,
        area decimal(10,2) NULL,
        incluirArea tinyint NULL DEFAULT 1,
        capacidade int NULL,
        status varchar(30) NULL DEFAULT 'ativo',
        observacoes text NULL
      )
    `);
    await conn.end();
    pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, database: BANCO, user: "root", password: SENHA, connectionLimit: 4,
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
      `INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
       (3, 1, 'pastos.criar', 1), (2, 1, 'animais.visualizar', 1)`,
    );
    await pool.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (3, 10, 1), (2, 10, 1)");
  });

  afterAll(async () => {
    await pool?.end();
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function tentar(identidade: IdentidadeUsuario, campos: { fazendaId: number; nome: string; userId?: number; sigla?: string; area?: string; capacidade?: number; observacoes?: string }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const id = await criarPastoNaTransacao(identidade, campos, adaptador(conn));
      await conn.commit();
      return { success: true as const, id };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async function linhas() {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT id, userId, fazendaId, nome FROM pastos ORDER BY id");
    return rows.map((row) => ({
      id: Number(row.id), userId: Number(row.userId), fazendaId: Number(row.fazendaId), nome: String(row.nome),
    }));
  }

  it("A. Principal cria pasto na fazenda própria", async () => {
    const resposta = await tentar(pessoa(1, "principal"), { fazendaId: 10, nome: "Pasto Norte" });
    expect(resposta).toMatchObject({ success: true });
    expect(await linhas()).toEqual([{ id: resposta.id, userId: 1, fazendaId: 10, nome: "Pasto Norte" }]);
  });

  it("B. Secundário cria com o userId do titular", async () => {
    const resposta = await tentar(pessoa(3, "secundario"), { fazendaId: 10, nome: "Pasto do Secundário", userId: 3 });
    expect(await linhas()).toEqual([{ id: resposta.id, userId: 1, fazendaId: 10, nome: "Pasto do Secundário" }]);
  });

  it("C. Comum cria só com a permissão", async () => {
    await expect(tentar(pessoa(2, "comum"), { fazendaId: 10, nome: "Sem Permissão" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await linhas()).toEqual([]);
    await pool.query("INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, 'pastos.criar', 1)");
    const resposta = await tentar(pessoa(2, "comum"), { fazendaId: 10, nome: "Pasto do Comum" });
    expect(await linhas()).toEqual([{ id: resposta.id, userId: 1, fazendaId: 10, nome: "Pasto do Comum" }]);
  });

  it("D. Fazenda de outra conta é recusada e não grava", async () => {
    await expect(tentar(pessoa(1, "principal"), { fazendaId: 30, nome: "Invasão" })).rejects.toMatchObject({
      code: "NOT_FOUND", message: "Fazenda não encontrada.",
    });
    expect(await linhas()).toEqual([]);
  });

  it("E. Fazenda não concedida é recusada e não grava", async () => {
    await expect(tentar(pessoa(3, "secundario"), { fazendaId: 20, nome: "Fora do Vínculo" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await linhas()).toEqual([]);
  });

  it("F. Sem o vínculo, a gravação seguinte não acontece", async () => {
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 3");
    await expect(tentar(pessoa(3, "secundario"), { fazendaId: 10, nome: "Depois da Revogação" })).rejects.toBeInstanceOf(TRPCError);
    expect(await linhas()).toEqual([]);
  });

  it("G. A revogação espera a trava e a gravação seguinte falha", async () => {
    const a = await pool.getConnection();
    const b = await pool.getConnection();
    try {
      await a.beginTransaction();
      const id = await criarPastoNaTransacao(
        pessoa(3, "secundario"),
        { fazendaId: 10, nome: "Durante a Trava" },
        adaptador(a),
      );
      await b.query("SET innodb_lock_wait_timeout = 3");
      let terminou = false;
      const espera = b.query("DELETE FROM usuario_permissoes WHERE userId = 3").then(() => { terminou = true; });
      await new Promise((resolver) => setTimeout(resolver, 400));
      expect(terminou).toBe(false);
      await a.commit();
      await espera;
      expect(terminou).toBe(true);
      expect(await linhas()).toEqual([{ id, userId: 1, fazendaId: 10, nome: "Durante a Trava" }]);
      await expect(tentar(pessoa(3, "secundario"), { fazendaId: 10, nome: "Depois" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await linhas()).toHaveLength(1);
    } finally {
      await a.rollback().catch(() => undefined);
      a.release();
      b.release();
    }
  });

  it("H. Campos, identificador e resposta permanecem", async () => {
    const resposta = await tentar(pessoa(1, "principal"), {
      fazendaId: 10, nome: "Pasto Completo", sigla: "PC", area: "12.50", capacidade: 40, observacoes: "Seco",
    });
    expect(resposta).toEqual({ success: true, id: expect.any(Number) });
    const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM pastos WHERE id = ?", [resposta.id]);
    const row = rows[0]!;
    expect(Number(row.userId)).toBe(1);
    expect(Number(row.fazendaId)).toBe(10);
    expect(String(row.nome)).toBe("Pasto Completo");
    expect(String(row.sigla)).toBe("PC");
    expect(String(row.area)).toBe("12.50");
    expect(Number(row.capacidade)).toBe(40);
    expect(String(row.observacoes)).toBe("Seco");
    expect(String(row.tipo)).toBe("Pasto");
    expect(Number(row.incluirArea)).toBe(1);
    expect(String(row.status)).toBe("ativo");
  });
});
