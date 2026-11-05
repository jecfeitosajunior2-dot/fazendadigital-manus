import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import { comporListaFazendas } from "./routers";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-fazlist-785c22";
const PORTA = 3322;
const SENHA = "isolado-785c22";
const BANCO = "fd_785c22";

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

type Ficha = { id: number; userId: number; nome: string };

function pessoa(id: number, papel: IdentidadeUsuario["papel"], titularUserId: number, situacao: IdentidadeUsuario["situacao"] = "ativo"): IdentidadeUsuario {
  return {
    id,
    openId: `ficticio-openid-${id}`,
    name: "Teste",
    email: null,
    role: papel === "principal" ? "admin" : "user",
    papel,
    titularUserId,
    situacao,
    sessionVersion: 0,
  };
}

describe.sequential("fazendas.list em MySQL isolado", () => {
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
    await conn.end();
    pool = mysql.createPool({
      host: "127.0.0.1",
      port: PORTA,
      database: BANCO,
      user: "root",
      password: SENHA,
      connectionLimit: 4,
    });
  }, 120_000);

  beforeEach(async () => {
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query("DELETE FROM usuario_fazendas");
    await pool.query("DELETE FROM users");
    await pool.query("DELETE FROM fazendas");
    await pool.query(
      `INSERT INTO fazendas (id, userId, nome) VALUES
       (10, 1, 'Pasto Norte'), (20, 1, 'Pasto Sul'), (30, 9, 'Pasto Alheio')`,
    );
    await pool.query(
      `INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion, passwordHash) VALUES
       (1, 'ficticio-openid-1', 'Ana', 'ana@teste.isolado', 'admin', 'principal', 1, 'ativo', 0, NULL),
       (2, 'ficticio-openid-2', 'Comum', 'comum@teste.isolado', 'user', 'comum', 1, 'ativo', 0, NULL),
       (3, 'ficticio-openid-3', 'Secundario', 'secundario@teste.isolado', 'user', 'secundario', 1, 'ativo', 0, NULL),
       (9, 'ficticio-openid-9', 'Beto', 'beto@teste.isolado', 'admin', 'principal', 9, 'ativo', 0, NULL)`,
    );
    await pool.query(
      `INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
       (3, 1, 'fazendas.visualizar', 1)`,
    );
    await pool.query(
      "INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (3, 10, 1)",
    );
  });

  afterAll(async () => {
    await pool?.end();
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function ficha(titularUserId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, userId, nome FROM fazendas WHERE userId = ? ORDER BY id DESC",
      [titularUserId],
    );
    return rows as Ficha[];
  }

  async function permissoes(userId: number, titularUserId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT permissao FROM usuario_permissoes WHERE userId = ? AND titularUserId = ?",
      [userId, titularUserId],
    );
    return rows.map((row) => String(row.permissao));
  }

  async function vinculos(userId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT userId, fazendaId FROM usuario_fazendas WHERE userId = ?",
      [userId],
    );
    return rows.map((row) => ({ userId: Number(row.userId), fazendaId: Number(row.fazendaId) }));
  }

  it("A. Principal recebe as duas fazendas com a ficha da consulta", async () => {
    const registros = await ficha(1);
    const resultado = comporListaFazendas({
      identidade: pessoa(1, "principal", 1),
      permissoes: [],
      vinculos: [],
      registros,
      locais: [],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas).toEqual([
      { id: 20, userId: 1, nome: "Pasto Sul" },
      { id: 10, userId: 1, nome: "Pasto Norte" },
    ]);
  });

  it("B. Secundário recebe somente a fazenda concedida", async () => {
    const resultado = comporListaFazendas({
      identidade: pessoa(3, "secundario", 1),
      permissoes: await permissoes(3, 1),
      vinculos: await vinculos(3),
      registros: await ficha(1),
      locais: [],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas.map((f) => f.nome)).toEqual(["Pasto Norte"]);
  });

  it("C. Comum sem permissão não revela fazenda", async () => {
    const resultado = comporListaFazendas({
      identidade: pessoa(2, "comum", 1),
      permissoes: await permissoes(2, 1),
      vinculos: await vinculos(2),
      registros: await ficha(1),
      locais: [],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
    if (resultado.ok) expect(resultado.fazendas).toEqual([]);
  });

  it("D. Fazenda de outra conta não aparece para a conta A", async () => {
    const principal = comporListaFazendas({
      identidade: pessoa(1, "principal", 1),
      permissoes: [],
      vinculos: [],
      registros: [...await ficha(1), ...await ficha(9)],
      locais: [],
    });
    const secundario = comporListaFazendas({
      identidade: pessoa(3, "secundario", 1),
      permissoes: await permissoes(3, 1),
      vinculos: await vinculos(3),
      registros: [...await ficha(1), ...await ficha(9)],
      locais: [{ id: 30, userId: 9, nome: "Pasto Alheio" }],
    });
    expect(principal.ok && secundario.ok).toBe(true);
    const texto = JSON.stringify([principal, secundario]);
    expect(texto).not.toContain("Pasto Alheio");
  });

  it("E. Vínculo removido some na próxima listagem", async () => {
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 3 AND fazendaId = 10");
    const resultado = comporListaFazendas({
      identidade: pessoa(3, "secundario", 1),
      permissoes: await permissoes(3, 1),
      vinculos: await vinculos(3),
      registros: await ficha(1),
      locais: [{ id: 10, userId: 1, nome: "Pasto Norte" }],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas).toEqual([]);
  });

  it("F. Espelho sem autorização não aparece", async () => {
    const resultado = comporListaFazendas({
      identidade: pessoa(3, "secundario", 1),
      permissoes: await permissoes(3, 1),
      vinculos: await vinculos(3),
      registros: await ficha(1),
      locais: [
        { id: 77, userId: 1, nome: "Espelho solto" },
        { id: 30, userId: 9, nome: "Pasto Alheio" },
      ],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas.map((f) => f.nome)).toEqual(["Pasto Norte"]);
  });

  it("G. Fazenda apagada no banco isolado não volta pelo espelho", async () => {
    await pool.query("DELETE FROM usuario_fazendas WHERE fazendaId = 10");
    await pool.query("DELETE FROM fazendas WHERE id = 10");
    const resultado = comporListaFazendas({
      identidade: pessoa(1, "principal", 1),
      permissoes: [],
      vinculos: [],
      registros: await ficha(1),
      locais: [
        { id: 10, userId: 1, nome: "Pasto Norte" },
        { id: 20, userId: 1, nome: "Pasto Sul" },
      ],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas.map((f) => ({ id: f.id, userId: f.userId, nome: f.nome }))).toEqual([
      { id: 20, userId: 1, nome: "Pasto Sul" },
    ]);
  });

  it("H. Consulta vazia no banco isolado não recupera o espelho", async () => {
    await pool.query("DELETE FROM usuario_fazendas");
    await pool.query("DELETE FROM fazendas WHERE userId = 1");
    const registros = await ficha(1);
    expect(registros).toEqual([]);
    const resultado = comporListaFazendas({
      identidade: pessoa(1, "principal", 1),
      permissoes: [],
      vinculos: [],
      registros,
      locais: [{ id: 10, userId: 1, nome: "Pasto Norte" }],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas).toEqual([]);
  });
});
