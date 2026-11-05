import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarRebanhoTitularidadeDb } from "./rebanhoTitularidadeDb";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-rebanho-785c1";
const PORTA = 3321;
const SENHA = "isolado-785c1";
const BANCO = "fd_785c1";
const alvo = { host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER };

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

describe.sequential("rebanho por titularidade em MySQL isolado", () => {
  let pool: mysql.Pool;
  let db: ReturnType<typeof criarRebanhoTitularidadeDb>;

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
      host: alvo.host,
      port: alvo.port,
      database: alvo.database,
      user: "root",
      password: SENHA,
      connectionLimit: 4,
    });
    db = criarRebanhoTitularidadeDb(pool, alvo);
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
      `INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
       (3, 1, 'animais.criar', 1),
       (3, 1, 'animais.visualizar', 1),
       (3, 1, 'animais.editar', 1),
       (3, 1, 'lotes.criar', 1),
       (3, 1, 'lotes.visualizar', 1),
       (3, 1, 'lotes.editar', 1),
       (2, 1, 'animais.visualizar', 1)`,
    );
    await pool.query(
      "INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (3, 10, 1), (2, 10, 1)",
    );
  });

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  it("cenário A: secundário cadastra animal na conta do principal", async () => {
    const criado = await db.servico.cadastrarAnimal(3, {
      fazendaId: 10,
      sexo: "femea",
      nome: "Mimosa",
    });
    expect(criado).toMatchObject({ ok: true, userId: 1, executorUserId: 3 });
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT userId, nome FROM animais");
    expect(linhas).toHaveLength(1);
    expect(Number(linhas[0]?.userId)).toBe(1);
    if (!criado.ok) return;
    const lido = await db.servico.obterAnimal(1, criado.id);
    expect(lido).toMatchObject({ ok: true, animal: { nome: "Mimosa", userId: 1 } });
  });

  it("cenário B: comum sem permissão não cria animal", async () => {
    const resultado = await db.servico.cadastrarAnimal(2, { fazendaId: 10, sexo: "macho" });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
    expect(await db.contar("animais")).toBe(0);
  });

  it("cenário C: fazenda de outra conta não recebe animal", async () => {
    const resultado = await db.servico.cadastrarAnimal(3, { fazendaId: 30, sexo: "femea" });
    expect(resultado).toEqual({ ok: false, motivo: "outro_titular" });
    expect(await db.contar("animais")).toBe(0);
    expect(await db.contar("lotes")).toBe(0);
  });

  it("cenário D: funcionário não vê animal de fazenda não autorizada", async () => {
    const criado = await db.servico.cadastrarAnimal(1, { fazendaId: 20, sexo: "macho", nome: "Oculto" });
    expect(criado.ok).toBe(true);
    if (!criado.ok) return;
    const lido = await db.servico.obterAnimal(3, criado.id);
    expect(lido).toEqual({ ok: false, motivo: "nao_encontrado" });
    expect(JSON.stringify(lido)).not.toContain("Oculto");
  });

  it("cenário E: lote do secundário fica na conta do principal", async () => {
    const criado = await db.servico.cadastrarLote(3, { fazendaId: 10, nome: "Bezerros", userId: 3 });
    expect(criado).toEqual({ ok: false, motivo: "titularidade_imutavel" });
    const certo = await db.servico.cadastrarLote(3, { fazendaId: 10, nome: "Bezerros" });
    expect(certo).toMatchObject({ ok: true, userId: 1, executorUserId: 3 });
    const lista = await db.servico.listarLotes(1, { fazendaId: 10 });
    expect(lista).toMatchObject({ ok: true, total: 1 });
    if (lista.ok) expect(lista.itens[0]).toMatchObject({ userId: 1, fazendaId: 10, nome: "Bezerros" });
  });

  it("cenário F: atualização não troca o titular", async () => {
    const criado = await db.servico.cadastrarAnimal(3, { fazendaId: 10, sexo: "femea", nome: "Antes" });
    if (!criado.ok) throw new Error("cadastro");
    const animal = await db.servico.atualizarAnimal(3, { id: criado.id, nome: "Depois", userId: 9 });
    expect(animal).toEqual({ ok: false, motivo: "titularidade_imutavel" });
    const lote = await db.servico.cadastrarLote(3, { fazendaId: 10, nome: "Lote" });
    if (!lote.ok) throw new Error("lote");
    const loteAtual = await db.servico.atualizarLote(3, { id: lote.id, userId: 9, fazendaId: 30 });
    expect(loteAtual).toEqual({ ok: false, motivo: "titularidade_imutavel" });
    const [animais] = await pool.query<RowDataPacket[]>("SELECT userId, nome FROM animais");
    const [lotes] = await pool.query<RowDataPacket[]>("SELECT userId, fazendaId, nome FROM lotes");
    expect(Number(animais[0]?.userId)).toBe(1);
    expect(String(animais[0]?.nome)).toBe("Antes");
    expect(Number(lotes[0]?.userId)).toBe(1);
    expect(Number(lotes[0]?.fazendaId)).toBe(10);
  });

  it("cenário G: falha no meio desfaz animal e movimento", async () => {
    const lote = await db.servico.cadastrarLote(3, { fazendaId: 10, nome: "Curral" });
    if (!lote.ok) throw new Error("lote");
    await expect(db.servico.cadastrarAnimal(
      3,
      { fazendaId: 10, sexo: "macho", loteId: lote.id },
      undefined,
      async () => {
        throw new Error("falha provocada");
      },
    )).rejects.toThrow("falha provocada");
    expect(await db.contar("animais")).toBe(0);
    expect(await db.contar("animal_lote_movimentacoes")).toBe(0);
    expect(await db.contar("lotes")).toBe(1);
  });
});
