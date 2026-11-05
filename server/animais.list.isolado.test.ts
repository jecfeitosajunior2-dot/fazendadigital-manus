import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import { filtrarAnimaisDaLista } from "./routers";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-animlist-785c23";
const PORTA = 3323;
const SENHA = "isolado-785c23";
const BANCO = "fd_785c23";

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

function pessoa(id: number, papel: IdentidadeUsuario["papel"], titularUserId: number): IdentidadeUsuario {
  return {
    id,
    openId: `ficticio-openid-${id}`,
    name: "Teste",
    email: null,
    role: papel === "principal" ? "admin" : "user",
    papel,
    titularUserId,
    situacao: "ativo",
    sessionVersion: 0,
  };
}

type Animal = {
  id: number;
  userId: number;
  fazendaId: number | null;
  loteId: number | null;
  brinco: string | null;
  brincoEletronico: string | null;
  nome: string | null;
  sexo: string;
  status: string;
};

describe.sequential("animais.list em MySQL isolado", () => {
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
    await conn.query(readFileSync(resolve(here, "rebanhoTitularidade.isolado.sql"), "utf8"));
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
    await pool.query("DELETE FROM animal_lote_movimentacoes");
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM lotes");
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
      `INSERT INTO lotes (id, userId, nome, fazendaId) VALUES
       (100, 1, 'Lote Norte', 10), (200, 1, 'Lote Sul', 20), (300, 9, 'Lote Alheio', 30)`,
    );
    await pool.query(
      `INSERT INTO animais (id, userId, brinco, brincoEletronico, nome, sexo, status, loteId, fazendaId) VALUES
       (1, 1, 'A1', 'RFID-A', 'Mimosa', 'femea', 'ativo', 100, 10),
       (2, 1, 'B2', 'RFID-B', 'Estrela', 'femea', 'ativo', 200, 20),
       (4, 1, 'LEG', NULL, 'Legado', 'macho', 'ativo', 100, NULL),
       (3, 9, 'Z9', 'RFID-Z', 'Alheia', 'femea', 'ativo', 300, 30)`,
    );
    await pool.query(
      `INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
       (3, 1, 'animais.visualizar', 1)`,
    );
    await pool.query(
      "INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (3, 10, 1)",
    );
  });

  afterAll(async () => {
    await pool?.end();
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function base() {
    const [fazendas] = await pool.query<RowDataPacket[]>("SELECT id, userId FROM fazendas");
    const [lotes] = await pool.query<RowDataPacket[]>("SELECT id, userId, fazendaId FROM lotes");
    const [animais] = await pool.query<RowDataPacket[]>(
      "SELECT id, userId, fazendaId, loteId, brinco, brincoEletronico, nome, sexo, status FROM animais WHERE userId = 1 OR userId = 9 ORDER BY id",
    );
    return {
      fazendas: fazendas.map((row) => ({ id: Number(row.id), userId: Number(row.userId) })),
      lotes: lotes.map((row) => ({ id: Number(row.id), userId: Number(row.userId), fazendaId: row.fazendaId == null ? null : Number(row.fazendaId) })),
      animais: animais as Animal[],
    };
  }

  async function permissoes(userId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT permissao FROM usuario_permissoes WHERE userId = ? AND titularUserId = 1",
      [userId],
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

  it("A. Principal vê os animais das duas fazendas e o legado", async () => {
    const dados = await base();
    const resultado = filtrarAnimaisDaLista({
      identidade: pessoa(1, "principal", 1),
      permissoes: [],
      vinculos: [],
      fazendasDoTitular: dados.fazendas,
      lotesDoTitular: dados.lotes,
      pastosDoTitular: [],
      animais: dados.animais.filter((animal) => animal.userId === 1),
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais.map((a) => a.brinco).sort()).toEqual(["A1", "B2", "LEG"]);
  });

  it("B. Secundário vê só a fazenda concedida, inclusive o legado dela", async () => {
    const dados = await base();
    const resultado = filtrarAnimaisDaLista({
      identidade: pessoa(3, "secundario", 1),
      permissoes: await permissoes(3),
      vinculos: await vinculos(3),
      fazendasDoTitular: dados.fazendas,
      lotesDoTitular: dados.lotes,
      pastosDoTitular: [],
      animais: dados.animais,
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais.map((a) => a.brinco).sort()).toEqual(["A1", "LEG"]);
  });

  it("C. Comum sem permissão não recebe animal", async () => {
    const dados = await base();
    const resultado = filtrarAnimaisDaLista({
      identidade: pessoa(2, "comum", 1),
      permissoes: await permissoes(2),
      vinculos: await vinculos(2),
      fazendasDoTitular: dados.fazendas,
      lotesDoTitular: dados.lotes,
      pastosDoTitular: [],
      animais: dados.animais,
      consultaMysqlConcluida: true,
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("D. Animal de outra conta não aparece", async () => {
    const dados = await base();
    const resultado = filtrarAnimaisDaLista({
      identidade: pessoa(1, "principal", 1),
      permissoes: [],
      vinculos: [],
      fazendasDoTitular: dados.fazendas,
      lotesDoTitular: dados.lotes,
      pastosDoTitular: [],
      animais: dados.animais,
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(JSON.stringify(resultado.animais)).not.toContain("Alheia");
  });

  it("E. Legado sem fazenda segue o lote da conta e não abre a outra fazenda", async () => {
    const dados = await base();
    const secundario = filtrarAnimaisDaLista({
      identidade: pessoa(3, "secundario", 1),
      permissoes: await permissoes(3),
      vinculos: await vinculos(3),
      fazendasDoTitular: dados.fazendas,
      lotesDoTitular: dados.lotes,
      pastosDoTitular: [],
      animais: dados.animais,
      consultaMysqlConcluida: true,
    });
    expect(secundario.ok).toBe(true);
    if (!secundario.ok) return;
    expect(secundario.animais.some((a) => a.brinco === "LEG")).toBe(true);
    expect(secundario.animais.some((a) => a.brinco === "B2")).toBe(false);
  });

  it("F. Vínculo removido esconde os animais na consulta seguinte", async () => {
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 3");
    const dados = await base();
    const resultado = filtrarAnimaisDaLista({
      identidade: pessoa(3, "secundario", 1),
      permissoes: await permissoes(3),
      vinculos: await vinculos(3),
      fazendasDoTitular: dados.fazendas,
      lotesDoTitular: dados.lotes,
      pastosDoTitular: [],
      animais: dados.animais,
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais).toEqual([]);
  });

  it("G. Animal só do espelho não entra quando o MySQL respondeu", async () => {
    const dados = await base();
    const resultado = filtrarAnimaisDaLista({
      identidade: pessoa(1, "principal", 1),
      permissoes: [],
      vinculos: [],
      fazendasDoTitular: dados.fazendas,
      lotesDoTitular: dados.lotes,
      pastosDoTitular: [],
      animais: dados.animais.filter((animal) => animal.userId === 1),
      locais: [{ id: 99, userId: 1, fazendaId: 10, loteId: null, brinco: "SO-ESPELHO", brincoEletronico: null, nome: "Fantasma", sexo: "macho", status: "ativo" }],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais.some((a) => a.brinco === "SO-ESPELHO")).toBe(false);
  });

  it("H. A ficha devolve brinco, sexo, fazenda e nome", async () => {
    const dados = await base();
    const resultado = filtrarAnimaisDaLista({
      identidade: pessoa(1, "principal", 1),
      permissoes: [],
      vinculos: [],
      fazendasDoTitular: dados.fazendas,
      lotesDoTitular: dados.lotes,
      pastosDoTitular: [],
      animais: dados.animais.filter((animal) => animal.id === 1),
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(Array.isArray(resultado.animais)).toBe(true);
    expect(resultado.animais[0]).toMatchObject({
      id: 1, brinco: "A1", sexo: "femea", fazendaId: 10, nome: "Mimosa", status: "ativo",
    });
  });
});
