import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import { resolverConsultaLote } from "./routers";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-loteget-785c26";
const PORTA = 3326;
const SENHA = "isolado-785c26";
const BANCO = "fd_785c26";

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

describe.sequential("lotes.getById em MySQL isolado", () => {
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
    await conn.query(`
      CREATE TABLE pastos (
        id int NOT NULL PRIMARY KEY,
        userId int NOT NULL,
        fazendaId int NOT NULL,
        nome varchar(100) NOT NULL,
        capacidade int NULL
      )
    `);
    await conn.end();
    pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, database: BANCO, user: "root", password: SENHA, connectionLimit: 4,
    });
  }, 120_000);

  beforeEach(async () => {
    await pool.query("DELETE FROM animal_lote_movimentacoes");
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM lotes");
    await pool.query("DELETE FROM pastos");
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query("DELETE FROM usuario_fazendas");
    await pool.query("DELETE FROM users");
    await pool.query("DELETE FROM fazendas");
    await pool.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Pasto Norte'), (20, 1, 'Pasto Sul'), (30, 9, 'Fazenda Alheia')");
    await pool.query("INSERT INTO pastos (id, userId, fazendaId, nome, capacidade) VALUES (7, 1, 10, 'Pasto Norte', 40)");
    await pool.query(
      `INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion, passwordHash) VALUES
       (1, 'ficticio-openid-1', 'Ana', 'ana@teste.isolado', 'admin', 'principal', 1, 'ativo', 0, NULL),
       (2, 'ficticio-openid-2', 'Comum', 'comum@teste.isolado', 'user', 'comum', 1, 'ativo', 0, NULL),
       (3, 'ficticio-openid-3', 'Secundario', 'secundario@teste.isolado', 'user', 'secundario', 1, 'ativo', 0, NULL),
       (9, 'ficticio-openid-9', 'Beto', 'beto@teste.isolado', 'admin', 'principal', 9, 'ativo', 0, NULL)`,
    );
    await pool.query(
      `INSERT INTO lotes (id, userId, nome, sigla, descricao, fazendaId, ativo) VALUES
       (100, 1, 'Lote Norte', 'LN', 'Bezerros', 10, 1),
       (200, 1, 'Lote Sul', 'LS', NULL, 20, 1),
       (8, 1, 'Sem Fazenda', NULL, NULL, NULL, 1),
       (300, 9, 'Lote Alheio', NULL, NULL, 30, 1)`,
    );
    await pool.query(
      `INSERT INTO animais (id, userId, brinco, nome, sexo, status, loteId, fazendaId) VALUES
       (1, 1, 'A1', 'Mimosa', 'femea', 'ativo', 100, 10),
       (2, 1, 'A2', 'Estrela', 'femea', 'ativo', 100, 10),
       (3, 9, 'Z9', 'Alheia', 'femea', 'ativo', 100, 30)`,
    );
    await pool.query("INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (3, 1, 'lotes.visualizar', 1), (2, 1, 'animais.visualizar', 1)");
    await pool.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (3, 10, 1), (2, 10, 1)");
  });

  afterAll(async () => {
    await pool?.end();
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function apoio() {
    const [fazendas] = await pool.query<RowDataPacket[]>("SELECT id, userId, nome FROM fazendas WHERE userId = 1");
    const [pastos] = await pool.query<RowDataPacket[]>("SELECT id, userId, fazendaId, nome, capacidade FROM pastos WHERE userId = 1");
    const [contagem] = await pool.query<RowDataPacket[]>(
      "SELECT loteId, COUNT(*) AS quantidade FROM animais WHERE userId = 1 AND status = 'ativo' AND loteId IS NOT NULL GROUP BY loteId",
    );
    return {
      fazendas: fazendas.map((row) => ({ id: Number(row.id), userId: Number(row.userId), nome: String(row.nome) })),
      pastos: pastos.map((row) => ({
        id: Number(row.id), userId: Number(row.userId), fazendaId: Number(row.fazendaId),
        nome: String(row.nome), capacidade: row.capacidade == null ? null : Number(row.capacidade),
      })),
      contagem: contagem.map((row) => ({ loteId: Number(row.loteId), quantidade: Number(row.quantidade) })),
    };
  }

  async function lote(id: number, titularUserId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, userId, nome, sigla, descricao, fazendaId, ativo FROM lotes WHERE id = ? AND userId = ?",
      [id, titularUserId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      userId: Number(row.userId),
      nome: String(row.nome),
      sigla: row.sigla == null ? null : String(row.sigla),
      descricao: row.descricao == null ? null : String(row.descricao),
      fazendaId: row.fazendaId == null ? null : Number(row.fazendaId),
      ativo: Number(row.ativo) === 1,
      pastoAtualId: Number(row.id) === 100 ? 7 : null,
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

  it("A. Principal recebe a ficha do lote próprio", async () => {
    const dados = await apoio();
    const candidato = await lote(100, 1);
    const resultado = resolverConsultaLote({
      identidade: pessoa(1, "principal"),
      permissoes: [], vinculos: [],
      fazendasDoTitular: dados.fazendas,
      pastosDoTitular: dados.pastos,
      lotes: candidato ? [candidato] : [],
      contagemPorLote: dados.contagem,
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.lote).toMatchObject({ id: 100, nome: "Lote Norte", sigla: "LN", descricao: "Bezerros", fazendaId: 10 });
    expect(resultado.lote).not.toHaveProperty("qtdAnimais");
    expect(resultado.ficha).toMatchObject({ pastoNome: "Pasto Norte", fazendaNome: "Pasto Norte", qtdAnimais: 2 });
  });

  it("B. Secundário consulta o lote da fazenda concedida", async () => {
    const dados = await apoio();
    const candidato = await lote(100, 1);
    const resultado = resolverConsultaLote({
      identidade: pessoa(3, "secundario"),
      permissoes: await permissoes(3),
      vinculos: await vinculos(3),
      fazendasDoTitular: dados.fazendas,
      pastosDoTitular: dados.pastos,
      lotes: candidato ? [candidato] : [],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok && resultado.lote.nome).toBe("Lote Norte");
  });

  it("C. Comum sem a permissão de lotes é recusado", async () => {
    const dados = await apoio();
    const candidato = await lote(100, 1);
    const resultado = resolverConsultaLote({
      identidade: pessoa(2, "comum"),
      permissoes: await permissoes(2),
      vinculos: await vinculos(2),
      fazendasDoTitular: dados.fazendas,
      pastosDoTitular: dados.pastos,
      lotes: candidato ? [candidato] : [],
      consultaMysqlConcluida: true,
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
    expect(JSON.stringify(resultado)).not.toContain("Lote Norte");
  });

  it("D. ID de outra conta não revela o lote", async () => {
    const dados = await apoio();
    const candidato = await lote(300, 1);
    expect(candidato).toBeNull();
    const resultado = resolverConsultaLote({
      identidade: pessoa(1, "principal"),
      permissoes: [], vinculos: [],
      fazendasDoTitular: dados.fazendas,
      pastosDoTitular: dados.pastos,
      lotes: [],
      consultaMysqlConcluida: true,
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
    expect(JSON.stringify(resultado)).not.toContain("Lote Alheio");
  });

  it("E. Lote sem fazenda fica com o Principal", async () => {
    const dados = await apoio();
    const candidato = await lote(8, 1);
    const dono = resolverConsultaLote({
      identidade: pessoa(1, "principal"),
      permissoes: [], vinculos: [],
      fazendasDoTitular: dados.fazendas,
      pastosDoTitular: dados.pastos,
      lotes: candidato ? [candidato] : [],
      consultaMysqlConcluida: true,
    });
    const delegado = resolverConsultaLote({
      identidade: pessoa(3, "secundario"),
      permissoes: await permissoes(3),
      vinculos: await vinculos(3),
      fazendasDoTitular: dados.fazendas,
      pastosDoTitular: dados.pastos,
      lotes: candidato ? [candidato] : [],
      consultaMysqlConcluida: true,
    });
    expect(dono.ok && dono.lote.nome).toBe("Sem Fazenda");
    expect(delegado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("F. Vínculo removido recusa a próxima consulta", async () => {
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 3");
    const dados = await apoio();
    const candidato = await lote(100, 1);
    const resultado = resolverConsultaLote({
      identidade: pessoa(3, "secundario"),
      permissoes: await permissoes(3),
      vinculos: await vinculos(3),
      fazendasDoTitular: dados.fazendas,
      pastosDoTitular: dados.pastos,
      lotes: candidato ? [candidato] : [],
      consultaMysqlConcluida: true,
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("G. Lote só do espelho não reaparece", async () => {
    const dados = await apoio();
    const resultado = resolverConsultaLote({
      identidade: pessoa(1, "principal"),
      permissoes: [], vinculos: [],
      fazendasDoTitular: dados.fazendas,
      pastosDoTitular: dados.pastos,
      lotes: [],
      locais: [{ id: 99, userId: 1, nome: "Só Espelho", fazendaId: 10, ativo: true }],
      consultaMysqlConcluida: true,
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("H. A ficha legítima do Principal conserva nome, sigla e fazenda", async () => {
    const dados = await apoio();
    const candidato = await lote(100, 1);
    const resultado = resolverConsultaLote({
      identidade: pessoa(1, "principal"),
      permissoes: [], vinculos: [],
      fazendasDoTitular: dados.fazendas,
      pastosDoTitular: dados.pastos,
      lotes: candidato ? [candidato] : [],
      contagemPorLote: dados.contagem,
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.lote.nome).toBe("Lote Norte");
    expect(resultado.lote.sigla).toBe("LN");
    expect(resultado.lote.fazendaId).toBe(10);
    expect(resultado.ficha.qtdAnimais).toBe(2);
    expect(resultado.ficha.qtdAnimais).not.toBe(3);
  });
});
