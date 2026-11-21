import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ConsultaAutorizacaoPersistida, LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  PERMISSAO_ESTORNAR_ESTOQUE,
  autorizarEstoqueNaFazenda,
  type IoEstoque,
} from "./consultaEstoqueAutorizada";
import { indiceChaveConfiavel } from "./estoqueChaveMovimento";
import { afirmarBancoDescartavel } from "./isolamentoMysql";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-h4ay-estoque";
const PORTA = 3369;
const SENHA = "isolado-h4ay";
const BANCO = "fd_h4ay";

const ESQUEMA = `
CREATE TABLE users (
  id int NOT NULL, openId varchar(255) NOT NULL, name varchar(255) NOT NULL,
  email varchar(255) NULL, role enum('admin','user') NOT NULL,
  papel enum('principal','secundario','comum') NOT NULL,
  titularUserId int NULL, situacao enum('convidado','ativo','inativo') NOT NULL,
  sessionVersion int NOT NULL DEFAULT 0, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE fazendas (
  id int NOT NULL, userId int NOT NULL, nome varchar(200) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_fazendas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  concedidoPorUserId int NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_permissoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, titularUserId int NOT NULL,
  permissao varchar(80) NOT NULL, concedidoPorUserId int NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE estoque (
  id int NOT NULL, quantidade decimal(10,2) NOT NULL, situacao varchar(20) NOT NULL DEFAULT 'ativo',
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE movimentos (
  id int NOT NULL, estoque_id int NOT NULL, status varchar(20) NOT NULL, quantidade decimal(10,2) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

function alvo() {
  return { host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, container: CONTAINER };
}

function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

async function conectar(banco?: string) {
  return mysql.createConnection({
    host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: banco,
    multipleStatements: true, dateStrings: true,
  });
}

function mysqlCli(sql: string, banco = BANCO) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolver, rejeitar) => {
    const filho = spawn("docker", [
      "exec", "-i", CONTAINER, "mysql", "-uroot", `-p${SENHA}`, "--default-character-set=utf8mb4", banco,
    ], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    filho.stdout.setEncoding("utf8");
    filho.stderr.setEncoding("utf8");
    filho.stdout.on("data", (pedaço) => { stdout += pedaço; });
    filho.stderr.on("data", (pedaço) => { stderr += pedaço; });
    filho.on("error", rejeitar);
    filho.on("close", (code) => resolver({ code: code ?? 1, stdout, stderr }));
    filho.stdin.write(sql);
    filho.stdin.end();
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

function numero(valor: unknown): number | null {
  if (valor == null || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function consultas(conn: mysql.PoolConnection): ConsultaAutorizacaoPersistida {
  return {
    async usuario(userId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion FROM users WHERE id = ? FOR UPDATE",
        [userId],
      );
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id),
        openId: String(linha.openId),
        name: linha.name == null ? null : String(linha.name),
        email: linha.email == null ? null : String(linha.email),
        role: linha.role,
        papel: linha.papel,
        titularUserId: numero(linha.titularUserId),
        situacao: linha.situacao,
        sessionVersion: Number(linha.sessionVersion),
      } as LinhaUsuarioCadastro;
    },
    async permissoes(userId, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT permissao FROM usuario_permissoes WHERE userId = ? AND titularUserId = ? FOR UPDATE",
        [userId, titularUserId],
      );
      return linhas.map((linha) => String(linha.permissao));
    },
    async vinculos(userId, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT uf.userId, uf.fazendaId FROM usuario_fazendas uf
         JOIN users u ON u.id = uf.userId
         WHERE uf.userId = ? AND u.titularUserId = ? FOR UPDATE`,
        [userId, titularUserId],
      );
      return linhas.map((linha) => ({ userId: Number(linha.userId), fazendaId: Number(linha.fazendaId) }));
    },
    async fazendasDoTitular(titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId FROM fazendas WHERE userId = ? ORDER BY id",
        [titularUserId],
      );
      return linhas.map((linha) => ({ id: Number(linha.id), userId: Number(linha.userId) }));
    },
    async fazenda(id) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId FROM fazendas WHERE id = ? FOR UPDATE",
        [id],
      );
      const linha = linhas[0];
      return linha ? { id: Number(linha.id), userId: Number(linha.userId) } : null;
    },
  };
}

function io(pool: mysql.Pool): IoEstoque {
  return {
    emTransacao(fn) {
      return pool.getConnection().then(async (conn) => {
        try {
          await conn.beginTransaction();
          const resultado = await fn(consultas(conn));
          await conn.commit();
          return resultado;
        } catch (erro) {
          await conn.rollback();
          throw erro;
        } finally {
          conn.release();
        }
      });
    },
  };
}

function errno(erro: unknown) {
  return (erro as { errno?: number }).errno ?? 0;
}

describe.sequential("estoque H4-AY em MySQL descartável", () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    afirmarBancoDescartavel(alvo());
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
    await docker(
      "run", "-d", "--name", CONTAINER,
      "-e", `MYSQL_ROOT_PASSWORD=${SENHA}`,
      "-e", `MYSQL_DATABASE=${BANCO}`,
      "-p", `127.0.0.1:${PORTA}:3306`,
      "mysql:8.4",
    );
    await esperarMysql();
    const conn = await conectar(BANCO);
    await conn.query(ESQUEMA);
    await conn.query(`
      INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion) VALUES
        (1, 'principal-ay', 'Administrador da conta', 'principal@isolado.local', 'admin', 'principal', 1, 'ativo', 3),
        (2, 'funcionario-ay', 'Funcionario Curral', 'curral@isolado.local', 'user', 'comum', 1, 'ativo', 1),
        (4, 'outro-ay', 'Outro Titular', 'outro@isolado.local', 'admin', 'principal', 4, 'ativo', 1)
    `);
    await conn.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (20, 1, 'Retiro'), (40, 4, 'Alheia')");
    await conn.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1)");
    await conn.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'estoque.criar', 1),
        (2, 1, 'estoque.confirmar', 1),
        (2, 1, 'estoque.estornar', 1)
    `);
    await conn.query(`
      INSERT INTO estoque (id, quantidade, situacao) VALUES
        (1, 10.00, 'ativo'), (2, 10.00, 'ativo'), (3, 0.00, 'ativo'), (4, 8.00, 'ativo')
    `);
    await conn.query("INSERT INTO movimentos (id, estoque_id, status, quantidade) VALUES (50, 4, 'ativa', 2.00)");
    await conn.end();
    const proposta = readFileSync(resolve(here, "../drizzle/propostas/0072_estoque_movimentacao_chaves.sql"), "utf8");
    const aplicada = await mysqlCli(proposta);
    if (aplicada.code !== 0 || !aplicada.stdout.includes("criada")) {
      throw new Error(aplicada.stderr || aplicada.stdout || "proposta 0072 não criou a chave");
    }
    pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
      connectionLimit: 6, dateStrings: true,
    });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function saldo(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT quantidade FROM estoque WHERE id = ?", [id]);
    return Number(linhas[0]?.quantidade);
  }

  async function chaves() {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM estoque_movimentacao_chaves");
    return Number(linhas[0]?.total);
  }

  it("a segunda aplicação da proposta conserva a tabela", async () => {
    const deNovo = await mysqlCli(readFileSync(resolve(here, "../drizzle/propostas/0072_estoque_movimentacao_chaves.sql"), "utf8"));
    expect(deNovo.code).toBe(0);
    expect(deNovo.stdout).toContain("ok");
    const [linhas] = await pool.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME AS coluna, NON_UNIQUE AS naoUnico, SEQ_IN_INDEX AS ordem
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'estoque_movimentacao_chaves' AND INDEX_NAME = 'estoque_mov_chave_uq'`,
      [BANCO],
    );
    expect(indiceChaveConfiavel(linhas)).toBe(true);
  });

  it("recusa uma tabela de chave com formato diferente", async () => {
    const ruim = await conectar();
    await ruim.query("CREATE DATABASE IF NOT EXISTS fd_h4ay_ruim");
    await ruim.query("USE fd_h4ay_ruim");
    await ruim.query("DROP TABLE IF EXISTS estoque_movimentacao_chaves");
    await ruim.query("CREATE TABLE estoque_movimentacao_chaves (id INT NOT NULL PRIMARY KEY) ENGINE=InnoDB");
    await ruim.end();
    const resposta = await mysqlCli(
      readFileSync(resolve(here, "../drizzle/propostas/0072_estoque_movimentacao_chaves.sql"), "utf8"),
      "fd_h4ay_ruim",
    );
    expect(resposta.code).not.toBe(0);
    const conferir = await conectar("fd_h4ay_ruim");
    const [colunas] = await conferir.query<RowDataPacket[]>(
      "SELECT COLUMN_NAME AS nome FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'fd_h4ay_ruim' AND TABLE_NAME = 'estoque_movimentacao_chaves'",
    );
    await conferir.query("DROP DATABASE fd_h4ay_ruim");
    await conferir.end();
    expect(colunas.map((linha) => String(linha.nome))).toEqual(["id"]);
  });

  it("a mesma chave entra uma vez e chaves diferentes entram as duas", async () => {
    await pool.query(
      `INSERT INTO estoque_movimentacao_chaves
        (titular_user_id, chave, conteudo_hash, estoque_id, fazenda_id, tipo, quantidade, movimentacao_id, grupo_id)
       VALUES (1, 'chave-igual-01', 'a', 1, 10, 'entrada', 1.00, 1, 'g1')`,
    );
    await expect(pool.query(
      `INSERT INTO estoque_movimentacao_chaves
        (titular_user_id, chave, conteudo_hash, estoque_id, fazenda_id, tipo, quantidade, movimentacao_id, grupo_id)
       VALUES (1, 'chave-igual-01', 'b', 1, 10, 'entrada', 9.00, 2, 'g2')`,
    )).rejects.toMatchObject({ errno: 1062 });
    await pool.query(
      `INSERT INTO estoque_movimentacao_chaves
        (titular_user_id, chave, conteudo_hash, estoque_id, fazenda_id, tipo, quantidade, movimentacao_id, grupo_id)
       VALUES (1, 'chave-outra-02', 'c', 1, 10, 'saida', 1.00, 3, 'g3')`,
    );
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT conteudo_hash AS hash FROM estoque_movimentacao_chaves WHERE titular_user_id = 1 AND chave = 'chave-igual-01'",
    );
    expect(linhas).toHaveLength(1);
    expect(String(linhas[0]?.hash)).toBe("a");
    expect(await chaves()).toBe(2);
  });

  it("não dobra o saldo quando a mesma chave chega com outro conteúdo", async () => {
    const a = await pool.getConnection();
    try {
      await a.beginTransaction();
      await a.query("SELECT quantidade FROM estoque WHERE id = 3 FOR UPDATE");
      await a.query("UPDATE estoque SET quantidade = 4 WHERE id = 3");
      await expect(a.query(
        `INSERT INTO estoque_movimentacao_chaves
          (titular_user_id, chave, conteudo_hash, estoque_id, fazenda_id, tipo, quantidade, movimentacao_id)
         VALUES (1, 'chave-igual-01', 'diferente', 3, 10, 'entrada', 4.00, 9)`,
      )).rejects.toMatchObject({ errno: 1062 });
      await a.rollback();
    } finally {
      a.release();
    }
    expect(await saldo(3)).toBe(0);
  });

  it("duas saídas sobrepostas descontam uma de cada vez", async () => {
    const a = await pool.getConnection();
    const b = await pool.getConnection();
    try {
      await a.beginTransaction();
      await b.beginTransaction();
      const [antes] = await a.query<RowDataPacket[]>("SELECT quantidade FROM estoque WHERE id = 1 FOR UPDATE");
      await a.query("UPDATE estoque SET quantidade = ? WHERE id = 1", [Number(antes[0]?.quantidade) - 4]);
      const espera = b.query<RowDataPacket[]>("SELECT quantidade FROM estoque WHERE id = 1 FOR UPDATE");
      await a.commit();
      const [depois] = await espera;
      expect(Number(depois[0]?.quantidade)).toBe(6);
      await b.query("UPDATE estoque SET quantidade = ? WHERE id = 1", [Number(depois[0]?.quantidade) - 3]);
      await b.commit();
    } finally {
      a.release();
      b.release();
    }
    expect(await saldo(1)).toBe(3);
  });

  it("entrada e saída sobrepostas fecham na conta certa", async () => {
    const entrada = await pool.getConnection();
    const saida = await pool.getConnection();
    try {
      await entrada.beginTransaction();
      await saida.beginTransaction();
      await entrada.query("SELECT quantidade FROM estoque WHERE id = 1 FOR UPDATE");
      await entrada.query("UPDATE estoque SET quantidade = quantidade + 5 WHERE id = 1");
      const espera = saida.query<RowDataPacket[]>("SELECT quantidade FROM estoque WHERE id = 1 FOR UPDATE");
      await entrada.commit();
      const [linha] = await espera;
      await saida.query("UPDATE estoque SET quantidade = ? WHERE id = 1", [Number(linha[0]?.quantidade) - 2]);
      await saida.commit();
    } finally {
      entrada.release();
      saida.release();
    }
    expect(await saldo(1)).toBe(6);
  });

  it("dois cadastros com a mesma chave deixam um saldo só", async () => {
    const a = await pool.getConnection();
    const b = await pool.getConnection();
    try {
      await a.beginTransaction();
      await b.beginTransaction();
      await a.query("SELECT quantidade FROM estoque WHERE id = 3 FOR UPDATE");
      const segundo = b.query("SELECT quantidade FROM estoque WHERE id = 3 FOR UPDATE");
      await a.query("UPDATE estoque SET quantidade = 5 WHERE id = 3");
      await a.query(
        `INSERT INTO estoque_movimentacao_chaves
          (titular_user_id, chave, conteudo_hash, estoque_id, fazenda_id, tipo, quantidade, movimentacao_id)
         VALUES (1, 'saldo-inicial-03', 'hash-inicial', 3, 10, 'saldo_inicial', 5.00, 30)`,
      );
      await a.commit();
      await segundo;
      await b.query("UPDATE estoque SET quantidade = quantidade + 5 WHERE id = 3");
      await expect(b.query(
        `INSERT INTO estoque_movimentacao_chaves
          (titular_user_id, chave, conteudo_hash, estoque_id, fazenda_id, tipo, quantidade, movimentacao_id)
         VALUES (1, 'saldo-inicial-03', 'hash-inicial', 3, 10, 'saldo_inicial', 5.00, 31)`,
      )).rejects.toMatchObject({ errno: 1062 });
      await b.rollback();
    } finally {
      a.release();
      b.release();
    }
    expect(await saldo(3)).toBe(5);
  });

  it("uma falha antes do commit devolve o saldo", async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("UPDATE estoque SET quantidade = 1 WHERE id = 2");
      await conn.rollback();
    } finally {
      conn.release();
    }
    expect(await saldo(2)).toBe(10);
  });

  it("travas em sentidos opostos na mesma ordem não se atravessam", async () => {
    const ida = await pool.getConnection();
    const volta = await pool.getConnection();
    try {
      await ida.beginTransaction();
      await volta.beginTransaction();
      await ida.query("SELECT id FROM estoque WHERE id = 1 FOR UPDATE");
      const espera = volta.query("SELECT id FROM estoque WHERE id = 1 FOR UPDATE");
      await ida.query("SELECT id FROM estoque WHERE id = 2 FOR UPDATE");
      await ida.query("UPDATE estoque SET quantidade = quantidade - 1 WHERE id = 1");
      await ida.query("UPDATE estoque SET quantidade = quantidade + 1 WHERE id = 2");
      await ida.commit();
      await espera;
      await volta.query("SELECT id FROM estoque WHERE id = 2 FOR UPDATE");
      await volta.query("UPDATE estoque SET quantidade = quantidade + 1 WHERE id = 1");
      await volta.query("UPDATE estoque SET quantidade = quantidade - 1 WHERE id = 2");
      await volta.commit();
    } finally {
      ida.release();
      volta.release();
    }
    expect(await saldo(1)).toBe(6);
    expect(await saldo(2)).toBe(10);
  });

  it("deadlock desfaz os dois lados", async () => {
    const antes1 = await saldo(1);
    const antes2 = await saldo(2);
    const a = await pool.getConnection();
    const b = await pool.getConnection();
    try {
      await a.beginTransaction();
      await b.beginTransaction();
      await a.query("SELECT id FROM estoque WHERE id = 1 FOR UPDATE");
      await b.query("SELECT id FROM estoque WHERE id = 2 FOR UPDATE");
      await a.query("UPDATE estoque SET quantidade = 1 WHERE id = 1");
      await b.query("UPDATE estoque SET quantidade = 1 WHERE id = 2");
      const disputa = await Promise.allSettled([
        a.query("SELECT id FROM estoque WHERE id = 2 FOR UPDATE"),
        b.query("SELECT id FROM estoque WHERE id = 1 FOR UPDATE"),
      ]);
      expect(disputa.some((item) => item.status === "rejected" && errno(item.reason) === 1213)).toBe(true);
      await a.rollback().catch(() => undefined);
      await b.rollback().catch(() => undefined);
    } finally {
      a.release();
      b.release();
    }
    expect(await saldo(1)).toBe(antes1);
    expect(await saldo(2)).toBe(antes2);
  });

  it("dois estornos da mesma linha geram uma devolução só", async () => {
    const a = await pool.getConnection();
    const b = await pool.getConnection();
    try {
      await a.beginTransaction();
      await b.beginTransaction();
      await a.query("SELECT id FROM movimentos WHERE id = 50 FOR UPDATE");
      const espera = b.query<RowDataPacket[]>("SELECT status FROM movimentos WHERE id = 50 FOR UPDATE");
      await a.query("UPDATE movimentos SET status = 'estornada' WHERE id = 50");
      await a.query("UPDATE estoque SET quantidade = quantidade + 2 WHERE id = 4");
      await a.query("INSERT INTO movimentos (id, estoque_id, status, quantidade) VALUES (51, 4, 'estorno', -2.00)");
      await a.commit();
      const [linha] = await espera;
      expect(String(linha[0]?.status)).toBe("estornada");
      await b.rollback();
    } finally {
      a.release();
      b.release();
    }
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM movimentos WHERE status = 'estorno'");
    expect(Number(linhas[0]?.total)).toBe(1);
    expect(await saldo(4)).toBe(10);
  });

  it("recusa funcionário sem permissão, fazenda revogada e fazenda de outro titular", async () => {
    const pedido = {
      executorId: 2,
      sessionVersionDaSessao: 1,
      fazendaId: 10,
      permissaoId: PERMISSAO_ESTORNAR_ESTOQUE,
    };
    const liberado = await autorizarEstoqueNaFazenda(io(pool), pedido, "sem");
    expect(liberado.ok).toBe(true);
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = 'estoque.estornar'");
    const revogada = await autorizarEstoqueNaFazenda(io(pool), pedido, "sem");
    expect(revogada.ok).toBe(false);
    if (!revogada.ok) expect(revogada.motivo).toBe("sem_permissao");
    const outraFazenda = await autorizarEstoqueNaFazenda(io(pool), { ...pedido, fazendaId: 20 }, "sem");
    expect(outraFazenda.ok).toBe(false);
    const outroTitular = await autorizarEstoqueNaFazenda(io(pool), { ...pedido, fazendaId: 40 }, "sem");
    expect(outroTitular.ok).toBe(false);
  });

  it("não aceita a operação quando o índice único não está visível", async () => {
    const [linhas] = await pool.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME AS coluna, NON_UNIQUE AS naoUnico, SEQ_IN_INDEX AS ordem
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND INDEX_NAME = 'indice_que_nao_existe'`,
      [BANCO],
    );
    expect(indiceChaveConfiavel(linhas)).toBe(false);
  });

  it("não conecta quando o MySQL do teste está fechado", async () => {
    await expect(mysql.createConnection({
      host: "127.0.0.1", port: 9, user: "root", password: "x", database: "fd_teste_nao_conectar",
      connectTimeout: 1000,
    })).rejects.toThrow();
  });
});
