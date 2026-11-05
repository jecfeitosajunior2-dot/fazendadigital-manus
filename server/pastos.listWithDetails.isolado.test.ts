import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import { comporPainelPastos } from "./routers";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-pastopainel-785c27c";
const PORTA = 3328;
const SENHA = "isolado-785c27c";
const BANCO = "fd_785c27c";
const HOJE = "2026-11-05";

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
    dateStrings: true,
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

function dias(inicio: string, fim: string) {
  const a = new Date(inicio);
  const b = new Date(fim);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

describe.sequential("pastos.listWithDetails em MySQL isolado", () => {
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
        tipo varchar(80) NULL,
        area decimal(10,2) NULL,
        capacidade int NULL,
        status varchar(30) NULL,
        coordenadas text NULL,
        observacoes text NULL,
        createdAt timestamp NULL
      );
      CREATE TABLE lotes (
        id int NOT NULL PRIMARY KEY,
        userId int NOT NULL,
        nome varchar(100) NOT NULL,
        fazendaId int NULL,
        pastoAtualId int NULL,
        dataEntradaPasto date NULL,
        ativo tinyint NULL
      );
      CREATE TABLE animais (
        id int NOT NULL PRIMARY KEY,
        userId int NOT NULL,
        loteId int NULL,
        status varchar(20) NULL
      );
      CREATE TABLE lote_pasto_movimentacoes (
        id int NOT NULL PRIMARY KEY,
        userId int NOT NULL,
        loteId int NOT NULL,
        pastoOrigemId int NULL,
        dataSaida date NULL
      );
    `);
    await conn.end();
    pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, database: BANCO, user: "root", password: SENHA,
      connectionLimit: 4, dateStrings: true,
    });
  }, 120_000);

  beforeEach(async () => {
    await pool.query("DELETE FROM lote_pasto_movimentacoes");
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM lotes");
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
      `INSERT INTO pastos (id, userId, fazendaId, nome, sigla, tipo, area, capacidade, status, coordenadas, observacoes, createdAt) VALUES
       (7, 1, 10, 'Pasto Norte', 'PN', 'Pasto', 12.50, 40, 'ativo', '-15.1,-47.2', NULL, '2026-11-02 00:00:00'),
       (8, 1, 20, 'Pasto Sul', 'PS', 'Pasto', 8.00, 0, 'descanso', NULL, NULL, '2026-11-01 00:00:00'),
       (17, 1, 10, 'Pasto Vazio', NULL, 'Pasto', NULL, 10, 'descanso', NULL, NULL, '2026-10-15 00:00:00'),
       (15, 1, 30, 'Cruzado', NULL, 'Pasto', NULL, NULL, 'ativo', NULL, NULL, '2026-11-03 00:00:00'),
       (9, 9, 30, 'Pasto Alheio', NULL, 'Pasto', NULL, NULL, 'ativo', 'secreto', NULL, '2026-11-04 00:00:00')`,
    );
    await pool.query(
      `INSERT INTO lotes (id, userId, nome, fazendaId, pastoAtualId, dataEntradaPasto, ativo) VALUES
       (100, 1, 'Lote Norte', 10, 7, '2026-11-01', 1),
       (104, 1, 'Lote da Conta', 30, 7, '2026-11-03', 1),
       (101, 1, 'Lote Sul', 20, 8, '2026-10-20', 1),
       (102, 9, 'Lote Alheio', 30, 7, '2026-11-01', 1)`,
    );
    await pool.query(
      `INSERT INTO animais (id, userId, loteId, status) VALUES
       (1, 1, 100, 'ativo'), (2, 1, 100, 'ativo'), (3, 1, 100, 'ativo'),
       (4, 1, 100, 'ativo'), (5, 1, 100, 'ativo'), (6, 1, 100, 'ativo'),
       (7, 1, 100, 'ativo'), (8, 1, 100, 'ativo'), (9, 1, 100, 'ativo'),
       (10, 1, 100, 'ativo'), (11, 1, 100, 'vendido'),
       (17, 1, 104, 'ativo'), (18, 1, 104, 'ativo'), (19, 1, 104, 'ativo'),
       (12, 9, 100, 'ativo'), (13, 9, 100, 'ativo'), (14, 9, 100, 'ativo'), (15, 9, 100, 'ativo'),
       (16, 9, 102, 'ativo')`,
    );
    await pool.query(
      `INSERT INTO lote_pasto_movimentacoes (id, userId, loteId, pastoOrigemId, dataSaida) VALUES
       (1, 1, 100, 17, '2026-10-26'),
       (2, 9, 102, 17, '2026-11-04')`,
    );
    await pool.query("INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (3, 1, 'pastos.visualizar', 1), (2, 1, 'animais.visualizar', 1)");
    await pool.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (3, 10, 1), (2, 10, 1)");
  });

  afterAll(async () => {
    await pool?.end();
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function painel(userId: number, papel: IdentidadeUsuario["papel"], filtro?: number) {
    const [fazendas] = await pool.query<RowDataPacket[]>(
      "SELECT id, userId, nome FROM fazendas WHERE userId = ?",
      [1],
    );
    const [pastos] = await pool.query<RowDataPacket[]>(
      `SELECT id, userId, fazendaId, nome, sigla, tipo, area, capacidade, status, coordenadas, observacoes, createdAt
       FROM pastos WHERE userId = 1 ORDER BY createdAt DESC`,
    );
    const [lotes] = await pool.query<RowDataPacket[]>(
      "SELECT id, userId, nome, fazendaId, pastoAtualId, dataEntradaPasto, ativo FROM lotes WHERE userId = 1 ORDER BY id",
    );
    const loteIds = lotes.map((row) => Number(row.id));
    const [contagem] = loteIds.length === 0
      ? [[] as RowDataPacket[]]
      : await pool.query<RowDataPacket[]>(
        `SELECT loteId, COUNT(*) AS quantidade FROM animais
         WHERE userId = 1 AND status = 'ativo' AND loteId IN (?) GROUP BY loteId`,
        [loteIds],
      );
    const pastoIds = pastos.map((row) => Number(row.id));
    const [saidas] = await pool.query<RowDataPacket[]>(
      `SELECT userId, pastoOrigemId, dataSaida FROM lote_pasto_movimentacoes
       WHERE userId = 1 AND pastoOrigemId IN (?) ORDER BY dataSaida DESC`,
      [pastoIds],
    );
    const [perms] = await pool.query<RowDataPacket[]>(
      "SELECT permissao FROM usuario_permissoes WHERE userId = ? AND titularUserId = 1",
      [userId],
    );
    const [vincs] = await pool.query<RowDataPacket[]>(
      "SELECT userId, fazendaId FROM usuario_fazendas WHERE userId = ?",
      [userId],
    );
    return comporPainelPastos({
      identidade: pessoa(userId, papel),
      permissoes: perms.map((row) => String(row.permissao)),
      vinculos: vincs.map((row) => ({ userId: Number(row.userId), fazendaId: Number(row.fazendaId) })),
      fazendasDoTitular: fazendas.map((row) => ({ id: Number(row.id), userId: Number(row.userId) })),
      nomesFazendas: fazendas.map((row) => ({ id: Number(row.id), userId: Number(row.userId), nome: String(row.nome) })),
      pastos: pastos.map((row) => ({
        id: Number(row.id),
        userId: Number(row.userId),
        fazendaId: Number(row.fazendaId),
        nome: String(row.nome),
        sigla: row.sigla == null ? null : String(row.sigla),
        tipo: row.tipo == null ? null : String(row.tipo),
        area: row.area == null ? null : String(row.area),
        capacidade: row.capacidade == null ? null : Number(row.capacidade),
        status: row.status == null ? null : String(row.status),
        coordenadas: row.coordenadas == null ? null : String(row.coordenadas),
        observacoes: row.observacoes == null ? null : String(row.observacoes),
        createdAt: row.createdAt,
      })),
      lotesDoTitular: lotes.map((row) => ({
        id: Number(row.id),
        userId: Number(row.userId),
        nome: String(row.nome),
        fazendaId: row.fazendaId == null ? null : Number(row.fazendaId),
        pastoAtualId: row.pastoAtualId == null ? null : Number(row.pastoAtualId),
        dataEntradaPasto: row.dataEntradaPasto == null ? null : String(row.dataEntradaPasto).slice(0, 10),
        ativo: row.ativo == null ? null : Boolean(row.ativo),
      })),
      contagemPorLote: contagem.map((row) => ({
        loteId: Number(row.loteId),
        quantidade: Number(row.quantidade),
        userId: 1,
      })),
      movimentacoes: saidas.map((row) => ({
        userId: Number(row.userId),
        pastoOrigemId: row.pastoOrigemId == null ? null : Number(row.pastoOrigemId),
        dataSaida: row.dataSaida == null ? null : String(row.dataSaida).slice(0, 10),
      })),
      consultaMysqlConcluida: true,
      filtroFazendaId: filtro,
      hoje: HOJE,
    });
  }

  it("A. Principal vê o painel das duas fazendas", async () => {
    const resultado = await painel(1, "principal");
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.nome)).toEqual(["Pasto Norte", "Pasto Sul", "Pasto Vazio"]);
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.fazendaNome)).toEqual(["Fazenda Norte", "Fazenda Sul", "Fazenda Norte"]);
  });

  it("B. Secundário vê só a fazenda concedida", async () => {
    const resultado = await painel(3, "secundario");
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.nome)).toEqual(["Pasto Norte", "Pasto Vazio"]);
  });

  it("C. Comum sem permissão é recusado", async () => {
    const resultado = await painel(2, "comum");
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
    expect(JSON.stringify(resultado)).not.toContain("Pasto Norte");
  });

  it("D. Outra conta não entra em pasto, lote, animal nem nome", async () => {
    const resultado = await painel(1, "principal");
    const texto = JSON.stringify(resultado);
    expect(texto).not.toContain("Pasto Alheio");
    expect(texto).not.toContain("Lote Alheio");
    expect(texto).not.toContain("Fazenda Alheia");
    expect(texto).not.toContain("secreto");
    const norte = resultado.ok ? resultado.pastos[0] : null;
    expect(norte?.qtdAnimais).toBe(10);
  });

  it("E. Pasto ligado a fazenda de outra conta fica de fora", async () => {
    const resultado = await painel(1, "principal");
    expect(resultado.ok && resultado.pastos.some((pasto) => pasto.nome === "Cruzado")).toBe(false);
  });

  it("F. Sem o vínculo, a consulta seguinte fica vazia", async () => {
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 3");
    const resultado = await painel(3, "secundario");
    expect(resultado.ok && resultado.pastos).toEqual([]);
  });

  it("G. Ocupação e lotes ignoram a outra conta", async () => {
    const resultado = await painel(1, "principal");
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const norte = resultado.pastos[0]!;
    expect(norte.qtdAnimais).toBe(10);
    expect(norte.qtdLotes).toBe(1);
    expect(norte.lotes.map((lote) => lote.nome)).toEqual(["Lote Norte"]);
    expect(norte.pctOcupacao).toBe(25);
    expect(norte.lotes.every((lote) => lote.fazendaNome === "Fazenda Norte")).toBe(true);
  });

  it("H. Contrato, coleção e ordenação permanecem", async () => {
    const resultado = await painel(1, "principal");
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.pastos.map((pasto) => pasto.nome)).toEqual(["Pasto Norte", "Pasto Sul", "Pasto Vazio"]);
    const norte = resultado.pastos[0]!;
    expect(norte).toMatchObject({
      id: 7, userId: 1, fazendaId: 10, nome: "Pasto Norte", sigla: "PN", tipo: "Pasto",
      capacidade: 40, status: "ativo", coordenadas: "-15.1,-47.2", observacoes: null,
      fazendaNome: "Fazenda Norte", qtdAnimais: 10, qtdLotes: 1,
    });
    expect(norte.lotes[0]).toMatchObject({
      id: 100, nome: "Lote Norte", qtdAnimais: 10, pastoNome: "Pasto Norte", pastoCapacidade: 40,
      diasNoPasto: dias("2026-11-01", HOJE),
    });
    expect(norte.diasPastejo).toBe(dias("2026-11-01", HOJE));
    expect(norte.diasDescanso).toBeNull();
    expect(resultado.pastos[1]?.pctOcupacao).toBeNull();
    expect(resultado.pastos[2]?.diasDescanso).toBe(dias("2026-10-26", HOJE));
    expect(resultado.pastos[2]?.diasPastejo).toBeNull();
    expect(resultado.pastos[2]?.qtdLotes).toBe(0);
  });
});
