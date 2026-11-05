import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import { montarFichaAnimal, resolverConsultaAnimal } from "./routers";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-anidget-785c24";
const PORTA = 3324;
const SENHA = "isolado-785c24";
const BANCO = "fd_785c24";

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
    id, openId: `ficticio-openid-${id}`, name: "Teste", email: null,
    role: papel === "principal" ? "admin" : "user", papel, titularUserId,
    situacao: "ativo", sessionVersion: 0,
  };
}

type Animal = {
  id: number; userId: number; fazendaId: number | null; loteId: number | null;
  brinco: string | null; brincoEletronico: string | null; nome: string | null; sexo: string; status: string;
};

describe.sequential("animais.getById em MySQL isolado", () => {
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
      host: "127.0.0.1", port: PORTA, database: BANCO, user: "root", password: SENHA, connectionLimit: 4,
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
    await pool.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Pasto Norte'), (20, 1, 'Pasto Sul'), (30, 9, 'Pasto Alheio')");
    await pool.query(
      `INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion, passwordHash) VALUES
       (1, 'ficticio-openid-1', 'Ana', 'ana@teste.isolado', 'admin', 'principal', 1, 'ativo', 0, NULL),
       (2, 'ficticio-openid-2', 'Comum', 'comum@teste.isolado', 'user', 'comum', 1, 'ativo', 0, NULL),
       (3, 'ficticio-openid-3', 'Secundario', 'secundario@teste.isolado', 'user', 'secundario', 1, 'ativo', 0, NULL),
       (9, 'ficticio-openid-9', 'Beto', 'beto@teste.isolado', 'admin', 'principal', 9, 'ativo', 0, NULL)`,
    );
    await pool.query("INSERT INTO lotes (id, userId, nome, fazendaId) VALUES (100, 1, 'Lote Norte', 10), (200, 1, 'Lote Sul', 20)");
    await pool.query(
      `INSERT INTO animais (id, userId, brinco, brincoEletronico, nome, sexo, status, loteId, fazendaId) VALUES
       (1, 1, 'A1', 'RFID-A', 'Mimosa', 'femea', 'ativo', 100, 10),
       (2, 1, 'B2', 'RFID-B', 'Estrela', 'femea', 'ativo', 200, 20),
       (4, 1, 'LEG', NULL, 'Legado', 'macho', 'ativo', 100, NULL),
       (3, 9, 'Z9', 'RFID-Z', 'Alheia', 'femea', 'ativo', NULL, 30)`,
    );
    await pool.query("INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (3, 1, 'animais.visualizar', 1)");
    await pool.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (3, 10, 1)");
  });

  afterAll(async () => {
    await pool?.end();
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function contexto() {
    const [fazendas] = await pool.query<RowDataPacket[]>("SELECT id, userId FROM fazendas");
    const [lotes] = await pool.query<RowDataPacket[]>("SELECT id, userId, nome, fazendaId FROM lotes");
    return {
      fazendas: fazendas.map((row) => ({ id: Number(row.id), userId: Number(row.userId) })),
      lotes: lotes.map((row) => ({
        id: Number(row.id), userId: Number(row.userId), nome: String(row.nome),
        fazendaId: row.fazendaId == null ? null : Number(row.fazendaId),
      })),
    };
  }

  async function animal(id: number, titularUserId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, userId, fazendaId, loteId, brinco, brincoEletronico, nome, sexo, status FROM animais WHERE id = ? AND userId = ?",
      [id, titularUserId],
    );
    return (rows as Animal[])[0];
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

  it("A. Principal recebe a ficha do animal próprio", async () => {
    const dados = await contexto();
    const candidato = await animal(1, 1);
    const resultado = resolverConsultaAnimal({
      identidade: pessoa(1, "principal", 1),
      permissoes: [], vinculos: [],
      fazendasDoTitular: dados.fazendas,
      lotesDoTitular: dados.lotes,
      pastosDoTitular: [],
      animais: candidato ? [candidato] : [],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const ficha = montarFichaAnimal(resultado.animal, {
      loteNome: dados.lotes.find((lote) => lote.id === resultado.animal.loteId)?.nome ?? null,
      baixa: null, genealogiaDisplay: null, descendentes: [], agora: Date.now(),
    });
    expect(ficha).toMatchObject({ id: 1, brinco: "A1", nome: "Mimosa", sexo: "femea", loteNome: "Lote Norte" });
  });

  it("B. Secundário consulta o animal da fazenda concedida", async () => {
    const dados = await contexto();
    const resultado = resolverConsultaAnimal({
      identidade: pessoa(3, "secundario", 1),
      permissoes: await permissoes(3),
      vinculos: await vinculos(3),
      fazendasDoTitular: dados.fazendas,
      lotesDoTitular: dados.lotes,
      pastosDoTitular: [],
      animais: [await animal(1, 1)].filter(Boolean),
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok && resultado.animal.brinco).toBe("A1");
  });

  it("C. Fazenda não concedida não revela o animal", async () => {
    const dados = await contexto();
    const resultado = resolverConsultaAnimal({
      identidade: pessoa(3, "secundario", 1),
      permissoes: await permissoes(3),
      vinculos: await vinculos(3),
      fazendasDoTitular: dados.fazendas,
      lotesDoTitular: dados.lotes,
      pastosDoTitular: [],
      animais: [await animal(2, 1)].filter(Boolean),
      consultaMysqlConcluida: true,
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("D. ID de outra conta não revela informações", async () => {
    const dados = await contexto();
    const daConta = await animal(3, 1);
    const resultado = resolverConsultaAnimal({
      identidade: pessoa(1, "principal", 1),
      permissoes: [], vinculos: [],
      fazendasDoTitular: dados.fazendas,
      lotesDoTitular: dados.lotes,
      pastosDoTitular: [],
      animais: daConta ? [daConta] : [],
      consultaMysqlConcluida: true,
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
    expect(JSON.stringify(resultado)).not.toContain("Alheia");
  });

  it("E. Legado sem fazenda segue o lote da conta", async () => {
    const dados = await contexto();
    const legado = await animal(4, 1);
    const resultado = resolverConsultaAnimal({
      identidade: pessoa(3, "secundario", 1),
      permissoes: await permissoes(3),
      vinculos: await vinculos(3),
      fazendasDoTitular: dados.fazendas,
      lotesDoTitular: dados.lotes,
      pastosDoTitular: [],
      animais: legado ? [legado] : [],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok && resultado.animal.brinco).toBe("LEG");
  });

  it("F. Vínculo removido recusa a próxima consulta", async () => {
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 3");
    const dados = await contexto();
    const resultado = resolverConsultaAnimal({
      identidade: pessoa(3, "secundario", 1),
      permissoes: await permissoes(3),
      vinculos: await vinculos(3),
      fazendasDoTitular: dados.fazendas,
      lotesDoTitular: dados.lotes,
      pastosDoTitular: [],
      animais: [await animal(1, 1)].filter(Boolean),
      consultaMysqlConcluida: true,
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("G. Animal só do espelho não reaparece", async () => {
    const dados = await contexto();
    const resultado = resolverConsultaAnimal({
      identidade: pessoa(1, "principal", 1),
      permissoes: [], vinculos: [],
      fazendasDoTitular: dados.fazendas,
      lotesDoTitular: dados.lotes,
      pastosDoTitular: [],
      animais: [],
      locais: [{ id: 99, userId: 1, fazendaId: 10, loteId: null, brinco: "SO-ESPELHO", brincoEletronico: null, nome: "Fantasma", sexo: "macho", status: "ativo" }],
      consultaMysqlConcluida: true,
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("H. A ficha do Principal conserva brinco, nome, sexo e lote", async () => {
    const dados = await contexto();
    const candidato = await animal(1, 1);
    const resultado = resolverConsultaAnimal({
      identidade: pessoa(1, "principal", 1),
      permissoes: [], vinculos: [],
      fazendasDoTitular: dados.fazendas,
      lotesDoTitular: dados.lotes,
      pastosDoTitular: [],
      animais: candidato ? [candidato] : [],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const ficha = montarFichaAnimal({ ...resultado.animal, createdAt: "2026-01-01T00:00:00.000Z" }, {
      loteNome: "Lote Norte", baixa: null, genealogiaDisplay: null, descendentes: [],
      agora: new Date("2026-02-01T00:00:00.000Z").getTime(),
    });
    expect(ficha.brinco).toBe("A1");
    expect(ficha.nome).toBe("Mimosa");
    expect(ficha.sexo).toBe("femea");
    expect(ficha.loteNome).toBe("Lote Norte");
    expect(typeof ficha.diasNaFazenda).toBe("number");
  });
});
