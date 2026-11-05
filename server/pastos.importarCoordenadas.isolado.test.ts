import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { TRPCError } from "@trpc/server";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import { importarCoordenadasNaTransacao, type TransacaoImportacaoCoordenadas } from "./routers";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-pastoimport-785c27f";
const PORTA = 3331;
const SENHA = "isolado-785c27f";
const BANCO = "fd_785c27f";
const QUANDO = "2026-11-05T12:00:00.000Z";
const PONTOS = "-47.123456789,-15.987654321,0 -47.200000001,-15.300000002,0";
const OUTROS = "-48.5,-16.25,0 -48.6,-16.35,0";

function kml(nome: string, coordinates: string) {
  return `<kml><Placemark><name>${nome}</name><Polygon><coordinates>${coordinates}</coordinates></Polygon></Placemark></kml>`;
}

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

function adaptador(conn: mysql.PoolConnection | mysql.Connection): TransacaoImportacaoCoordenadas {
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
    async travarPastosDaFazenda(titularUserId, fazendaId) {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, fazendaId, nome, sigla FROM pastos
         WHERE userId = ? AND fazendaId = ? ORDER BY id FOR UPDATE`,
        [titularUserId, fazendaId],
      );
      return rows.map((row) => ({
        id: Number(row.id),
        userId: Number(row.userId),
        fazendaId: Number(row.fazendaId),
        nome: String(row.nome),
        sigla: row.sigla == null ? null : String(row.sigla),
      }));
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
    async gravarCoordenadas(id, titularUserId, coordenadas) {
      await conn.query(
        "UPDATE pastos SET coordenadas = ? WHERE id = ? AND userId = ?",
        [coordenadas, id, titularUserId],
      );
    },
    async relerPasto(id, titularUserId) {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId, fazendaId, coordenadas FROM pastos WHERE id = ? AND userId = ?",
        [id, titularUserId],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: Number(row.id),
        userId: Number(row.userId),
        fazendaId: Number(row.fazendaId),
        coordenadas: row.coordenadas == null ? null : String(row.coordenadas),
      };
    },
  };
}

describe.sequential("pastos.importarCoordenadas em MySQL isolado", () => {
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
        tipoPastagem varchar(80) NULL,
        area decimal(10,2) NULL,
        incluirArea tinyint NULL DEFAULT 1,
        capacidade int NULL,
        status varchar(30) NULL DEFAULT 'ativo',
        coordenadas text NULL,
        observacoes text NULL
      );
      CREATE TABLE animais (
        id int NOT NULL PRIMARY KEY,
        userId int NOT NULL,
        nome varchar(100) NOT NULL
      );
      CREATE TABLE lotes (
        id int NOT NULL PRIMARY KEY,
        userId int NOT NULL,
        nome varchar(100) NOT NULL,
        pastoAtualId int NULL
      );
    `);
    await conn.end();
    pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, database: BANCO, user: "root", password: SENHA, connectionLimit: 6,
    });
  }, 120_000);

  beforeEach(async () => {
    await pool.query("DELETE FROM pastos");
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM lotes");
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
      `INSERT INTO pastos (id, userId, fazendaId, nome, sigla, tipo, tipoPastagem, area, incluirArea, capacidade, status, observacoes) VALUES
       (7, 1, 10, 'Pasto Norte', 'PN', 'Pasto', 'Braquiaria', 12.50, 1, 40, 'ativo', 'Seco'),
       (8, 1, 20, 'Pasto Sul', 'PS', 'Pasto', 'Mombaça', 8.00, 1, 25, 'ativo', NULL),
       (9, 9, 30, 'Pasto Alheio', NULL, 'Pasto', NULL, NULL, 1, NULL, 'ativo', 'secreto'),
       (11, 1, 10, 'Pasto Leste', 'PL', 'Pasto', 'Braquiaria', 3.00, 1, 10, 'ativo', NULL),
       (15, 1, 30, 'Cruzado', NULL, 'Pasto', NULL, NULL, 1, NULL, 'ativo', NULL),
       (16, 1, 999, 'Sem Fazenda', NULL, 'Pasto', NULL, NULL, 1, NULL, 'ativo', NULL)`,
    );
    await pool.query("INSERT INTO animais (id, userId, nome) VALUES (1, 1, 'Mimosa')");
    await pool.query("INSERT INTO lotes (id, userId, nome, pastoAtualId) VALUES (1, 1, 'Lote A', 7)");
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

  async function tentar(identidade: IdentidadeUsuario, fazendaId: number, nome: string, coordinates: string, quando = QUANDO) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const resposta = await importarCoordenadasNaTransacao(
        identidade,
        { fazendaId, kmlContent: kml(nome, coordinates) },
        adaptador(conn),
        quando,
      );
      await conn.commit();
      return resposta;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async function pasto(id: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, userId, fazendaId, nome, sigla, tipo, tipoPastagem, area, incluirArea, capacidade, status, coordenadas, observacoes
       FROM pastos WHERE id = ?`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      userId: Number(row.userId),
      fazendaId: Number(row.fazendaId),
      nome: String(row.nome),
      sigla: row.sigla == null ? null : String(row.sigla),
      tipo: row.tipo == null ? null : String(row.tipo),
      tipoPastagem: row.tipoPastagem == null ? null : String(row.tipoPastagem),
      area: row.area == null ? null : String(row.area),
      incluirArea: Number(row.incluirArea),
      capacidade: row.capacidade == null ? null : Number(row.capacidade),
      status: String(row.status),
      coordenadas: row.coordenadas == null ? null : String(row.coordenadas),
      observacoes: row.observacoes == null ? null : String(row.observacoes),
    };
  }

  async function vizinhos() {
    const [animais] = await pool.query<RowDataPacket[]>("SELECT id, userId, nome FROM animais");
    const [lotes] = await pool.query<RowDataPacket[]>("SELECT id, userId, nome, pastoAtualId FROM lotes");
    return {
      animais: animais.map((row) => ({ id: Number(row.id), userId: Number(row.userId), nome: String(row.nome) })),
      lotes: lotes.map((row) => ({
        id: Number(row.id), userId: Number(row.userId), nome: String(row.nome), pastoAtualId: Number(row.pastoAtualId),
      })),
    };
  }

  it("A. Principal importa no pasto próprio", async () => {
    const resposta = await tentar(pessoa(1, "principal"), 10, "Pasto Norte", PONTOS);
    expect(resposta).toEqual({ importados: 1, ignorados: [], totalNoArquivo: 1 });
    const row = await pasto(7);
    expect(JSON.parse(row?.coordenadas ?? "{}")).toEqual({ coordinates: PONTOS, importadoEm: QUANDO });
    expect(row).toMatchObject({
      userId: 1, fazendaId: 10, nome: "Pasto Norte", sigla: "PN", tipo: "Pasto",
      tipoPastagem: "Braquiaria", area: "12.50", incluirArea: 1, capacidade: 40, status: "ativo", observacoes: "Seco",
    });
    expect((await pasto(11))?.coordenadas).toBeNull();
    expect(await vizinhos()).toEqual({
      animais: [{ id: 1, userId: 1, nome: "Mimosa" }],
      lotes: [{ id: 1, userId: 1, nome: "Lote A", pastoAtualId: 7 }],
    });
  });

  it("B. Secundário importa na fazenda concedida", async () => {
    const resposta = await tentar(pessoa(3, "secundario"), 10, "PN", OUTROS);
    expect(resposta.importados).toBe(1);
    expect(JSON.parse((await pasto(7))?.coordenadas ?? "{}").coordinates).toBe(OUTROS);
    expect(await pasto(7)).toMatchObject({ userId: 1, fazendaId: 10, nome: "Pasto Norte" });
  });

  it("C. Comum importa só com a permissão", async () => {
    await expect(tentar(pessoa(2, "comum"), 10, "Pasto Norte", PONTOS)).rejects.toMatchObject({
      code: "FORBIDDEN", message: "Sem permissão para editar pastos.",
    });
    expect((await pasto(7))?.coordenadas).toBeNull();
    await pool.query("INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, 'pastos.editar', 1)");
    expect(await tentar(pessoa(2, "comum"), 10, "Pasto Norte", PONTOS)).toMatchObject({ importados: 1 });
    expect(JSON.parse((await pasto(7))?.coordenadas ?? "{}").coordinates).toBe(PONTOS);
  });

  it("D. Outra conta e fazenda inválida não mudam", async () => {
    await expect(tentar(pessoa(1, "principal"), 30, "Pasto Alheio", PONTOS)).rejects.toMatchObject({
      code: "NOT_FOUND", message: "Pasto não encontrado.",
    });
    expect(await pasto(9)).toMatchObject({ userId: 9, nome: "Pasto Alheio", observacoes: "secreto", coordenadas: null });
    await expect(tentar(pessoa(1, "principal"), 30, "Cruzado", PONTOS)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await pasto(15)).toMatchObject({ userId: 1, fazendaId: 30, nome: "Cruzado", coordenadas: null });
    await expect(tentar(pessoa(1, "principal"), 999, "Sem Fazenda", PONTOS)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await pasto(16)).toMatchObject({ userId: 1, fazendaId: 999, coordenadas: null });
    expect((await pasto(7))?.coordenadas).toBeNull();
  });

  it("E. Fazenda não concedida não muda o pasto", async () => {
    await expect(tentar(pessoa(3, "secundario"), 20, "Pasto Sul", PONTOS)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await pasto(8)).toMatchObject({ userId: 1, fazendaId: 20, nome: "Pasto Sul", coordenadas: null });
  });

  it("F. Permissão ou vínculo removido antes da gravação impede a importação", async () => {
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 3");
    await expect(tentar(pessoa(3, "secundario"), 10, "Pasto Norte", PONTOS)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await pasto(7))?.coordenadas).toBeNull();
    await pool.query("INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (3, 1, 'pastos.editar', 1)");
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 3");
    await expect(tentar(pessoa(3, "secundario"), 10, "Pasto Norte", PONTOS)).rejects.toBeInstanceOf(TRPCError);
    expect((await pasto(7))?.coordenadas).toBeNull();
  });

  it("G. Importação, exclusão e revogação concorrentes esperam a trava", async () => {
    const a = await pool.getConnection();
    const b = await pool.getConnection();
    const c = await pool.getConnection();
    const d = await pool.getConnection();
    try {
      await a.beginTransaction();
      await importarCoordenadasNaTransacao(
        pessoa(3, "secundario"),
        { fazendaId: 10, kmlContent: kml("Pasto Norte", PONTOS) },
        adaptador(a),
        QUANDO,
      );
      await b.query("SET innodb_lock_wait_timeout = 3");
      let importou = false;
      const esperaImportacao = (async () => {
        await b.beginTransaction();
        await importarCoordenadasNaTransacao(
          pessoa(1, "principal"),
          { fazendaId: 10, kmlContent: kml("Pasto Norte", OUTROS) },
          adaptador(b),
          "2026-11-05T12:01:00.000Z",
        );
        await b.commit();
        importou = true;
      })();
      await new Promise((resolver) => setTimeout(resolver, 400));
      expect(importou).toBe(false);
      await a.commit();
      await esperaImportacao;
      expect(importou).toBe(true);
      expect(JSON.parse((await pasto(7))?.coordenadas ?? "{}").coordinates).toBe(OUTROS);
      expect(await pasto(7)).toMatchObject({ userId: 1, fazendaId: 10, nome: "Pasto Norte", observacoes: "Seco" });

      await a.beginTransaction();
      await importarCoordenadasNaTransacao(
        pessoa(1, "principal"),
        { fazendaId: 10, kmlContent: kml("Pasto Norte", PONTOS) },
        adaptador(a),
        QUANDO,
      );
      await c.query("SET innodb_lock_wait_timeout = 3");
      let apagou = false;
      const esperaExclusao = c.query("DELETE FROM pastos WHERE userId = 1 AND fazendaId = 10").then(() => { apagou = true; });
      await new Promise((resolver) => setTimeout(resolver, 400));
      expect(apagou).toBe(false);
      await a.commit();
      await esperaExclusao;
      expect(apagou).toBe(true);
      await expect(tentar(pessoa(1, "principal"), 10, "Pasto Norte", PONTOS)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Cadastre subdivisões antes de importar coordenadas",
      });
      expect(await pasto(7)).toBeNull();
      expect(await pasto(11)).toBeNull();

      await pool.query(
        `INSERT INTO pastos (id, userId, fazendaId, nome, sigla, tipo, area, incluirArea, capacidade, status, observacoes) VALUES
         (7, 1, 10, 'Pasto Norte', 'PN', 'Pasto', 12.50, 1, 40, 'ativo', 'Seco')`,
      );
      await a.beginTransaction();
      await importarCoordenadasNaTransacao(
        pessoa(3, "secundario"),
        { fazendaId: 10, kmlContent: kml("Pasto Norte", PONTOS) },
        adaptador(a),
        QUANDO,
      );
      await d.query("SET innodb_lock_wait_timeout = 3");
      let revogou = false;
      const esperaRevogacao = d.query("DELETE FROM usuario_permissoes WHERE userId = 3").then(() => { revogou = true; });
      await new Promise((resolver) => setTimeout(resolver, 400));
      expect(revogou).toBe(false);
      await a.commit();
      await esperaRevogacao;
      expect(revogou).toBe(true);
      await expect(tentar(pessoa(3, "secundario"), 10, "Pasto Norte", OUTROS)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(JSON.parse((await pasto(7))?.coordenadas ?? "{}").coordinates).toBe(PONTOS);
    } finally {
      await a.rollback().catch(() => undefined);
      await b.rollback().catch(() => undefined);
      a.release();
      b.release();
      c.release();
      d.release();
    }
  });

  it("H. Coordenadas gravadas, demais campos e retorno permanecem", async () => {
    const resposta = await tentar(pessoa(1, "principal"), 10, "Pasto Norte", PONTOS);
    expect(resposta).toEqual({ importados: 1, ignorados: [], totalNoArquivo: 1 });
    const row = await pasto(7);
    expect(JSON.parse(row?.coordenadas ?? "{}")).toEqual({ coordinates: PONTOS, importadoEm: QUANDO });
    expect(row).toMatchObject({
      id: 7, userId: 1, fazendaId: 10, nome: "Pasto Norte", sigla: "PN", tipo: "Pasto",
      tipoPastagem: "Braquiaria", area: "12.50", capacidade: 40, status: "ativo", observacoes: "Seco",
    });
    const deNovo = await tentar(pessoa(1, "principal"), 10, "Pasto Norte", PONTOS);
    expect(deNovo.importados).toBe(1);
    expect((await pasto(7))?.coordenadas).toBe(row?.coordenadas);
    expect(await vizinhos()).toEqual({
      animais: [{ id: 1, userId: 1, nome: "Mimosa" }],
      lotes: [{ id: 1, userId: 1, nome: "Lote A", pastoAtualId: 7 }],
    });
  });
});
