import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inserirAnimalImportadoNaTransacao, type TransacaoImportacaoAnimal } from "./importacaoAnimalAutorizada";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-h4aq-animais";
const PORTA = 3361;
const SENHA = "isolado-h4aq";
const BANCO = "fd_h4aq";

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

function adaptador(conn: mysql.PoolConnection): TransacaoImportacaoAnimal {
  return {
    async travarUsuario(id) {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, papel, titularUserId, situacao, sessionVersion FROM users WHERE id = ? FOR UPDATE",
        [id],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: Number(row.id),
        papel: String(row.papel),
        titularUserId: Number(row.titularUserId),
        situacao: String(row.situacao),
        sessionVersion: Number(row.sessionVersion ?? 0),
      };
    },
    async permissoes(userId, titularUserId) {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT permissao FROM usuario_permissoes WHERE userId = ? AND titularUserId = ? FOR UPDATE",
        [userId, titularUserId],
      );
      return rows.map((row) => String(row.permissao));
    },
    async fazendasDoVinculo(userId) {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT fazendaId FROM usuario_fazendas WHERE userId = ? FOR UPDATE",
        [userId],
      );
      return rows.map((row) => Number(row.fazendaId));
    },
    async brincoAtivo(titularUserId, brinco) {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM animais
         WHERE userId = ? AND status = 'ativo' AND LOWER(TRIM(brinco)) = LOWER(TRIM(?))
         LIMIT 1 FOR UPDATE`,
        [titularUserId, brinco],
      );
      return rows.length > 0;
    },
    async rfidAtivo(titularUserId, rfid) {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM animais
         WHERE userId = ? AND status = 'ativo' AND LOWER(TRIM(brincoEletronico)) = LOWER(TRIM(?))
         LIMIT 1 FOR UPDATE`,
        [titularUserId, rfid],
      );
      return rows.length > 0;
    },
    async inserir(row) {
      const [result] = await conn.query<ResultSetHeader>(
        `INSERT INTO animais (userId, fazendaId, loteId, pastoId, brinco, brincoEletronico, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.userId, row.fazendaId, row.loteId ?? null, row.pastoId ?? null,
          row.brinco ?? null, row.brincoEletronico ?? null, row.status ?? "ativo",
        ],
      );
      return Number(result.insertId);
    },
  };
}

describe("animais.importar no MySQL descartável", () => {
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
      CREATE TABLE animais (
        id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId int NOT NULL,
        fazendaId int NOT NULL,
        loteId int NULL,
        pastoId int NULL,
        brinco varchar(50) NULL,
        brincoEletronico varchar(80) NULL,
        status varchar(20) NOT NULL
      );
    `);
    await conn.query(readFileSync(resolve(here, "../drizzle/propostas/0070_animais_brinco_ativo_uq.sql"), "utf8"));
    await conn.end();
    pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
      connectionLimit: 6,
    });
  }, 120_000);

  beforeEach(async () => {
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query("DELETE FROM usuario_fazendas");
    await pool.query("DELETE FROM users");
    await pool.query("DELETE FROM fazendas");
    await pool.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Norte'), (20, 1, 'Sul'), (30, 9, 'Alheia')");
    await pool.query(
      `INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion, passwordHash) VALUES
       (1, 'ficticio-openid-1', 'Ana', 'ana@teste.isolado', 'admin', 'principal', 1, 'ativo', 0, NULL),
       (2, 'ficticio-openid-2', 'Bia', 'bia@teste.isolado', 'user', 'comum', 1, 'ativo', 0, NULL),
       (3, 'ficticio-openid-3', 'Caio', 'caio@teste.isolado', 'user', 'comum', 1, 'ativo', 0, NULL),
       (9, 'ficticio-openid-9', 'Beto', 'beto@teste.isolado', 'admin', 'principal', 9, 'ativo', 0, NULL)`,
    );
    await pool.query(
      `INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
       (2, 1, 'animais.criar', 1), (2, 1, 'animais.visualizar', 1),
       (3, 1, 'animais.criar', 1)`,
    );
    await pool.query(
      `INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1), (3, 10, 1)`,
    );
  });

  afterAll(async () => {
    await pool?.end();
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function importar(executorId: number, brinco: string, fazendaId = 10) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const resultado = await inserirAnimalImportadoNaTransacao(adaptador(conn), {
        executorId,
        titularUserId: 1,
        sessionVersionDaSessao: 0,
        fazendaId,
        brinco,
        brincoEletronico: null,
        status: "ativo",
        row: { userId: 99, fazendaId, brinco, status: "ativo" },
      });
      if (!resultado.ok) {
        await conn.rollback();
        return resultado;
      }
      await conn.commit();
      return resultado;
    } catch (erro) {
      await conn.rollback();
      throw erro;
    } finally {
      conn.release();
    }
  }

  it("duas importações do mesmo brinco deixam um animal só, na conta do titular", async () => {
    const resultados = await Promise.all([importar(2, "B1"), importar(3, "B1")]);
    const motivos = resultados.map((item) => item.ok ? "ok" : item.motivo).sort();
    expect(motivos).toEqual(["brinco_duplicado", "ok"]);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT userId, fazendaId, brinco FROM animais");
    expect(rows.map((row) => ({
      userId: Number(row.userId), fazendaId: Number(row.fazendaId), brinco: String(row.brinco),
    }))).toEqual([{ userId: 1, fazendaId: 10, brinco: "B1" }]);
  });

  it("o índice recusa a segunda gravação mesmo sem a consulta prévia", async () => {
    async function inserirCru() {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          "INSERT INTO animais (userId, fazendaId, brinco, status) VALUES (1, 10, 'DUP', 'ativo')",
        );
        await new Promise((resolver) => setTimeout(resolver, 150));
        await conn.commit();
        return "ok";
      } catch (erro) {
        await conn.rollback();
        const errno = (erro as { errno?: number }).errno;
        return errno === 1062 ? "duplicado" : "erro";
      } finally {
        conn.release();
      }
    }
    const resultados = await Promise.all([inserirCru(), inserirCru()]);
    expect(resultados.sort()).toEqual(["duplicado", "ok"]);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM animais WHERE brinco = 'DUP'");
    expect(rows).toHaveLength(1);
  });

  it("falha antes do commit não deixa animal", async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await inserirAnimalImportadoNaTransacao(adaptador(conn), {
        executorId: 1, titularUserId: 1, sessionVersionDaSessao: 0, fazendaId: 10,
        brinco: "X1", brincoEletronico: null, status: "ativo",
        row: { userId: 1, fazendaId: 10, brinco: "X1", status: "ativo" },
      });
      throw new Error("falha de gravação");
    } catch (erro) {
      await conn.rollback();
      expect(erro).toBeInstanceOf(Error);
    } finally {
      conn.release();
    }
    const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM animais");
    expect(rows).toEqual([]);
  });

  it("fazenda fora do vínculo e permissão revogada não gravam", async () => {
    expect(await importar(2, "FORA", 20)).toEqual({ ok: false, motivo: "sem_permissao" });

    let seguir = () => {};
    const podeSeguir = new Promise<void>((resolver) => { seguir = resolver; });
    const revogando = (async () => {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query("SELECT id FROM users WHERE id = 2 FOR UPDATE");
        await conn.query("DELETE FROM usuario_permissoes WHERE userId = 2");
        seguir();
        await new Promise((resolver) => setTimeout(resolver, 250));
        await conn.commit();
      } finally {
        conn.release();
      }
    })();
    await podeSeguir;
    const resultado = await importar(2, "NOVO");
    await revogando;
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
    const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM animais");
    expect(rows).toEqual([]);
  });

  it("consulta não devolve animal de outra conta", async () => {
    await pool.query(
      "INSERT INTO animais (userId, fazendaId, brinco, status) VALUES (1, 10, 'MEU', 'ativo'), (9, 30, 'OUTRO', 'ativo')",
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT brinco FROM animais WHERE userId = 1 ORDER BY brinco",
    );
    expect(rows.map((row) => String(row.brinco))).toEqual(["MEU"]);
  });
});
