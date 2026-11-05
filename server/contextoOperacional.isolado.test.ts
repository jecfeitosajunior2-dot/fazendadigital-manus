import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarContextoOperacionalDb } from "./contextoOperacionalDb";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-ctx-785b";
const PORTA = 3320;
const SENHA = "isolado-785b";
const BANCO = "fd_785b";
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

describe.sequential("contexto operacional em MySQL isolado", () => {
  let pool: mysql.Pool;
  let svc: ReturnType<typeof criarContextoOperacionalDb>;

  beforeAll(async () => {
    expect(PORTA).not.toBe(3306);
    expect(BANCO).not.toBe("fazenda_digital");
    expect(CONTAINER).not.toBe("fazenda-digital-mysql");
    expect(() => criarContextoOperacionalDb({} as mysql.Pool, { ...alvo, database: "fazenda_digital" })).toThrow(/operacional/);
    expect(() => criarContextoOperacionalDb({} as mysql.Pool, { ...alvo, port: 3306 })).toThrow(/porta/);
    expect(() => criarContextoOperacionalDb({} as mysql.Pool, { ...alvo, container: "fazenda-digital-mysql" })).toThrow(/instância/);
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
      host: alvo.host,
      port: alvo.port,
      database: alvo.database,
      user: "root",
      password: SENHA,
      connectionLimit: 4,
    });
    svc = criarContextoOperacionalDb(pool, alvo);
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
       (1, 'ficticio-openid-1', 'Pessoa 1', 'pessoa-1@teste.isolado', 'admin', 'principal', 1, 'ativo', 0, NULL),
       (2, 'ficticio-openid-2', 'Pessoa 2', 'pessoa-2@teste.isolado', 'user', 'comum', 1, 'ativo', 0, NULL),
       (3, 'ficticio-openid-3', 'Pessoa 3', 'pessoa-3@teste.isolado', 'user', 'secundario', 1, 'ativo', 0, NULL),
       (9, 'ficticio-openid-9', 'Pessoa 9', 'pessoa-9@teste.isolado', 'admin', 'principal', 9, 'ativo', 0, NULL)`,
    );
    await pool.query(
      `INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
       (3, 1, 'animais.visualizar', 1),
       (3, 1, 'auditoria.visualizar', 1),
       (2, 1, 'pesagens.criar', 1)`,
    );
    await pool.query(
      `INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
       (3, 10, 1), (2, 10, 1)`,
    );
  });

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  it("lê o titular da conta e separa o executor", async () => {
    const resultado = await svc.resolver(3, {
      permissaoId: "animais.visualizar",
      fazendaId: 10,
      titularInformadoPeloCliente: 9,
      papelInformadoPeloCliente: "principal",
      permissoesInformadasPeloCliente: ["vendas.confirmar"],
    });
    expect(resultado).toEqual({
      ok: true,
      contexto: {
        executorUserId: 3,
        titularUserId: 1,
        papel: "secundario",
        fazendaId: 10,
        permissao: "animais.visualizar",
      },
    });
  });

  it("isola a fazenda da outra conta", async () => {
    const daOutra = await svc.resolver(1, { permissaoId: "animais.visualizar", fazendaId: 30 });
    const alheioNaNossa = await svc.resolver(9, { permissaoId: "animais.visualizar", fazendaId: 10 });
    expect(daOutra).toEqual({ ok: false, motivo: "outro_titular" });
    expect(alheioNaNossa).toEqual({ ok: false, motivo: "outro_titular" });
  });

  it("aplica a permissão efetiva e a fazenda concedida", async () => {
    const pesagem = await svc.resolver(2, { permissaoId: "pesagens.criar", fazendaId: 10 });
    const semPermissao = await svc.resolver(2, { permissaoId: "animais.criar", fazendaId: 10 });
    const semFazenda = await svc.resolver(3, { permissaoId: "animais.visualizar", fazendaId: 20 });
    expect(pesagem.ok).toBe(true);
    expect(semPermissao).toEqual({ ok: false, motivo: "sem_permissao" });
    expect(semFazenda).toEqual({ ok: false, motivo: "sem_fazenda" });
  });

  it("recusa depois que a permissão e a fazenda são revogadas", async () => {
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 3 AND permissao = 'animais.visualizar'");
    const semPermissao = await svc.resolver(3, { permissaoId: "animais.visualizar", fazendaId: 10 });
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 10");
    const semFazenda = await svc.resolver(2, { permissaoId: "pesagens.criar", fazendaId: 10 });
    expect(semPermissao).toEqual({ ok: false, motivo: "sem_permissao" });
    expect(semFazenda).toEqual({ ok: false, motivo: "sem_fazenda" });
  });

  it("recusa inativo, convidado, ausente e sessão divergente", async () => {
    await pool.query("UPDATE users SET situacao = 'inativo' WHERE id = 2");
    const inativo = await svc.resolver(2, { permissaoId: "pesagens.criar", fazendaId: 10 });
    await pool.query("UPDATE users SET situacao = 'convidado' WHERE id = 3");
    const convidado = await svc.resolver(3, { permissaoId: "animais.visualizar", fazendaId: 10 });
    const ausente = await svc.resolver(99, { permissaoId: "animais.visualizar", fazendaId: 10 });
    const sessao = await svc.resolver(1, {
      permissaoId: "animais.visualizar",
      fazendaId: 10,
      sessionVersionDaSessao: 4,
    });
    expect(inativo).toEqual({ ok: false, motivo: "sem_identidade" });
    expect(convidado).toEqual({ ok: false, motivo: "sem_identidade" });
    expect(ausente).toEqual({ ok: false, motivo: "sem_identidade" });
    expect(sessao).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("não abre a auditoria histórica para o secundário e não grava nada", async () => {
    const antes = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM auditoria_eventos");
    const bloqueado = await svc.resolver(3, { permissaoId: "auditoria.visualizar" });
    const principal = await svc.resolver(1, { permissaoId: "auditoria.visualizar" });
    const depois = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM auditoria_eventos");
    expect(bloqueado).toEqual({ ok: false, motivo: "AUDITORIA_HISTORICA_INDISPONIVEL" });
    expect(principal).toEqual({
      ok: true,
      contexto: {
        executorUserId: 1,
        titularUserId: 1,
        papel: "principal",
        permissao: "auditoria.visualizar",
      },
    });
    expect(Number(antes[0][0]?.total)).toBe(0);
    expect(Number(depois[0][0]?.total)).toBe(0);
  });
});
