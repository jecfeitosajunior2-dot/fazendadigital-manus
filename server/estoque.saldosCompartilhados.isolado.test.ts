import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { afirmarBancoDescartavel } from "./isolamentoMysql";

const exec = promisify(execFile);
const CONTAINER = "fd-h4ax-saldos";
const PORTA = 3367;
const SENHA = "isolado-h4ax";
const BANCO = "fd_h4ax";

function alvo() {
  return { host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, container: CONTAINER };
}

function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

async function esperarMysql() {
  const prazo = Date.now() + 90_000;
  let ultimo = "";
  while (Date.now() < prazo) {
    try {
      const conn = await mysql.createConnection({
        host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
      });
      await conn.query("SELECT 1");
      await conn.end();
      return;
    } catch (erro) {
      ultimo = erro instanceof Error ? erro.message : String(erro);
      await new Promise((resolver) => setTimeout(resolver, 1500));
    }
  }
  throw new Error(`MySQL isolado não respondeu. ${ultimo}`);
}

describe.sequential("saldos compartilhados em MySQL descartável", () => {
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
    const conn = await mysql.createConnection({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, multipleStatements: true,
    });
    await conn.query(`
      CREATE TABLE estoque (
        id int NOT NULL,
        quantidade decimal(10,2) NOT NULL,
        valor_total_estoque decimal(14,2) NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB;
      INSERT INTO estoque (id, quantidade, valor_total_estoque) VALUES (1, 10.00, 40.00), (2, 10.00, 30.00);
    `);
    await conn.end();
    pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, connectionLimit: 4,
    });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function saldo(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT quantidade FROM estoque WHERE id = ?", [id]);
    return Number(linhas[0].quantidade);
  }

  it("duas baixas do mesmo produto não leem a mesma quantidade", async () => {
    const a = await pool.getConnection();
    const b = await pool.getConnection();
    try {
      await a.beginTransaction();
      const [antes] = await a.query<RowDataPacket[]>("SELECT quantidade FROM estoque WHERE id = 1 FOR UPDATE");
      expect(Number(antes[0].quantidade)).toBe(10);
      const espera = b.query<RowDataPacket[]>("SELECT quantidade FROM estoque WHERE id = 1 FOR UPDATE");
      await new Promise((resolver) => setTimeout(resolver, 300));
      await a.query("UPDATE estoque SET quantidade = 2 WHERE id = 1");
      await a.commit();
      const [depois] = await espera;
      expect(Number(depois[0].quantidade)).toBe(2);
      const restante = Number(depois[0].quantidade);
      expect(restante).toBeLessThan(8);
      await b.rollback();
    } finally {
      a.release();
      b.release();
    }
    expect(await saldo(1)).toBe(2);
  });

  it("entrada e saída sobrepostas deixam o saldo da conta certa", async () => {
    await pool.query("UPDATE estoque SET quantidade = 10 WHERE id = 1");
    const entrada = await pool.getConnection();
    const saida = await pool.getConnection();
    try {
      await entrada.beginTransaction();
      await entrada.query("SELECT quantidade FROM estoque WHERE id = 1 FOR UPDATE");
      const espera = saida.query<RowDataPacket[]>("SELECT quantidade FROM estoque WHERE id = 1 FOR UPDATE");
      await new Promise((resolver) => setTimeout(resolver, 300));
      await entrada.query("UPDATE estoque SET quantidade = quantidade + 5 WHERE id = 1");
      await entrada.commit();
      const [visto] = await espera;
      expect(Number(visto[0].quantidade)).toBe(15);
      await saida.query("UPDATE estoque SET quantidade = quantidade - 4 WHERE id = 1");
      await saida.commit();
    } finally {
      entrada.release();
      saida.release();
    }
    expect(await saldo(1)).toBe(11);
  });

  it("desfaz a baixa se a transação cair antes do commit", async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("SELECT quantidade FROM estoque WHERE id = 2 FOR UPDATE");
      await conn.query("UPDATE estoque SET quantidade = 0 WHERE id = 2");
      await conn.rollback();
    } finally {
      conn.release();
    }
    expect(await saldo(2)).toBe(10);
  });

  it("deadlock desfaz os dois lados e não grava saldo pela metade", async () => {
    const a = await pool.getConnection();
    const b = await pool.getConnection();
    try {
      await a.beginTransaction();
      await b.beginTransaction();
      await a.query("SELECT quantidade FROM estoque WHERE id = 1 FOR UPDATE");
      await b.query("SELECT quantidade FROM estoque WHERE id = 2 FOR UPDATE");
      await a.query("UPDATE estoque SET quantidade = 1 WHERE id = 1");
      await b.query("UPDATE estoque SET quantidade = 1 WHERE id = 2");
      const disputa = await Promise.allSettled([
        a.query("SELECT quantidade FROM estoque WHERE id = 2 FOR UPDATE"),
        b.query("SELECT quantidade FROM estoque WHERE id = 1 FOR UPDATE"),
      ]);
      expect(disputa.some((item) => item.status === "rejected")).toBe(true);
      await a.rollback().catch(() => undefined);
      await b.rollback().catch(() => undefined);
    } finally {
      a.release();
      b.release();
    }
    expect(await saldo(1)).toBe(11);
    expect(await saldo(2)).toBe(10);
  });
});
