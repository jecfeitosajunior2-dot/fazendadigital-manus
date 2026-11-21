import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  PERMISSAO_CATALOGO_SEMEN_CRIAR,
  PERMISSAO_CONSULTAR_SEMEN,
  autorizarSemenNaFazenda,
  type ConsultaAutorizacaoPersistida,
  type IoSemen,
} from "./consultaSemenAutorizada";
import { afirmarBancoDescartavel } from "./isolamentoMysql";

const exec = promisify(execFile);
const CONTAINER = "fd-h4av-semen";
const PORTA = 3365;
const SENHA = "isolado-h4av";
const BANCO = "fd_h4av";

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
CREATE TABLE semen_partidas (
  id int NOT NULL, user_id int NOT NULL, fazenda_id int NOT NULL,
  origem_reprodutor varchar(20) NOT NULL, reprodutor_key varchar(120) NOT NULL,
  partida varchar(120) NOT NULL, saldo_doses int NOT NULL, custo_unitario decimal(12,2) NULL,
  status varchar(20) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE semen_reprodutores_externos (
  id int NOT NULL AUTO_INCREMENT, user_id int NOT NULL, fazenda_id int NOT NULL,
  reprodutor_key varchar(120) NOT NULL, reprodutor_texto varchar(500) NOT NULL,
  ativo tinyint NOT NULL DEFAULT 1, PRIMARY KEY (id)
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
  return valor == null ? null : Number(valor);
}

function consultas(conn: mysql.PoolConnection): ConsultaAutorizacaoPersistida {
  return {
    async usuario(id): Promise<LinhaUsuarioCadastro | null> {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion
         FROM users WHERE id = ? FOR UPDATE`,
        [id],
      );
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id),
        openId: String(linha.openId),
        name: linha.name == null ? null : String(linha.name),
        email: linha.email == null ? null : String(linha.email),
        role: linha.role === "admin" ? "admin" : "user",
        papel: linha.papel,
        titularUserId: numero(linha.titularUserId),
        situacao: linha.situacao,
        sessionVersion: Number(linha.sessionVersion),
      };
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
        "SELECT id, userId FROM fazendas WHERE userId = ?",
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

describe.sequential("consulta de sêmen em MySQL descartável", () => {
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
        (1, 'principal-isolado', 'Administrador da conta', 'principal@isolado.local', 'admin', 'principal', 1, 'ativo', 3),
        (2, 'funcionario-isolado', 'Funcionario Curral', 'curral@isolado.local', 'user', 'comum', 1, 'ativo', 1),
        (3, 'sem-permissao-isolado', 'Sem Permissao', 'sem@isolado.local', 'user', 'comum', 1, 'ativo', 1),
        (4, 'outro-titular-isolado', 'Outro Titular', 'outro@isolado.local', 'admin', 'principal', 4, 'ativo', 1)
    `);
    await conn.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (20, 1, 'Retiro'), (40, 4, 'Alheia')");
    await conn.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1), (3, 10, 1)");
    await conn.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'semen.visualizar', 1),
        (2, 1, 'semen.criar', 1)
    `);
    await conn.query(`
      INSERT INTO semen_partidas
        (id, user_id, fazenda_id, origem_reprodutor, reprodutor_key, partida, saldo_doses, custo_unitario, status)
      VALUES
        (1, 1, 10, 'externo', 'touro-a', 'P-1', 8, 12.50, 'disponivel'),
        (2, 1, 20, 'externo', 'touro-b', 'P-2', 3, 9.00, 'disponivel'),
        (3, 4, 40, 'externo', 'alheio', 'P-9', 20, 99.00, 'disponivel')
    `);
    await conn.end();
    pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
      dateStrings: true, connectionLimit: 4,
    });
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  function io(): IoSemen {
    return {
      async emTransacao(fn) {
        afirmarBancoDescartavel(alvo());
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          try {
            const resultado = await fn(consultas(conn));
            await conn.commit();
            return resultado;
          } catch (erro) {
            await conn.rollback();
            throw erro;
          }
        } finally {
          conn.release();
        }
      },
    };
  }

  async function autorizar(executorId: number, sessionVersion: number, fazendaId: number, permissaoId = PERMISSAO_CONSULTAR_SEMEN) {
    return autorizarSemenNaFazenda(io(), {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      fazendaId,
      permissaoId,
      titularInformadoPeloCliente: 4,
      papelInformadoPeloCliente: "principal",
      permissoesInformadasPeloCliente: ["semen.visualizar"],
      fazendasInformadasPeloCliente: [40],
    });
  }

  async function doses(titular: number, fazendaId: number) {
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT id, saldo_doses, custo_unitario FROM semen_partidas WHERE user_id = ? AND fazenda_id = ? ORDER BY id",
      [titular, fazendaId],
    );
    return linhas.map((linha) => ({
      id: Number(linha.id),
      saldo: Number(linha.saldo_doses),
      custo: String(linha.custo_unitario),
    }));
  }

  it("principal consulta a sede e o retiro da própria conta", async () => {
    expect(await autorizar(1, 3, 10)).toMatchObject({ ok: true, titularUserId: 1 });
    expect(await autorizar(1, 3, 20)).toMatchObject({ ok: true, titularUserId: 1 });
    expect(await doses(1, 10)).toEqual([{ id: 1, saldo: 8, custo: "12.50" }]);
    expect(await doses(1, 20)).toEqual([{ id: 2, saldo: 3, custo: "9.00" }]);
    expect(await doses(1, 40)).toEqual([]);
  });

  it("funcionário vê o saldo do titular na fazenda concedida", async () => {
    const acesso = await autorizar(2, 1, 10);
    expect(acesso).toMatchObject({ ok: true, titularUserId: 1 });
    if (!acesso.ok) return;
    expect(await doses(acesso.titularUserId, 10)).toEqual([{ id: 1, saldo: 8, custo: "12.50" }]);
  });

  it("fazenda não concedida e outro titular ficam de fora", async () => {
    expect(await autorizar(2, 1, 20)).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    expect(await autorizar(2, 1, 40)).toMatchObject({ ok: false });
    expect(await doses(4, 40)).toEqual([{ id: 3, saldo: 20, custo: "99.00" }]);
    expect(await doses(1, 40)).toEqual([]);
  });

  it("sem permissão e sessão revogada não consultam", async () => {
    expect(await autorizar(3, 1, 10)).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await autorizar(2, 99, 10)).toMatchObject({ ok: false, motivo: "sem_identidade" });
  });

  it("catálogo novo fica no nome do titular", async () => {
    const acesso = await autorizar(2, 1, 10, PERMISSAO_CATALOGO_SEMEN_CRIAR);
    expect(acesso.ok).toBe(true);
    if (!acesso.ok) return;
    await pool.query(
      `INSERT INTO semen_reprodutores_externos (user_id, fazenda_id, reprodutor_key, reprodutor_texto, ativo)
       VALUES (?, 10, 'touro-c', 'Touro C', 1)`,
      [acesso.titularUserId],
    );
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT user_id FROM semen_reprodutores_externos WHERE reprodutor_key = 'touro-c'",
    );
    expect(Number(linhas[0]?.user_id)).toBe(1);
  });

  it("revogar permissão e fazenda fecha a consulta", async () => {
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = 'semen.visualizar'");
    expect(await autorizar(2, 1, 10)).toMatchObject({ ok: false, motivo: "sem_permissao" });
    await pool.query("INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, 'semen.visualizar', 1)");
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 10");
    expect(await autorizar(2, 1, 10)).toMatchObject({ ok: false, motivo: "sem_fazenda" });
  });

  it("leitura concorrente não enxerga dose ainda não confirmada", async () => {
    const gravando = await pool.getConnection();
    const lendo = await pool.getConnection();
    try {
      await gravando.beginTransaction();
      await gravando.query("UPDATE semen_partidas SET saldo_doses = 1 WHERE id = 1");
      const [visto] = await lendo.query<RowDataPacket[]>("SELECT saldo_doses FROM semen_partidas WHERE id = 1");
      expect(Number(visto[0]?.saldo_doses)).toBe(8);
      await gravando.rollback();
    } finally {
      gravando.release();
      lendo.release();
    }
    const [final] = await pool.query<RowDataPacket[]>("SELECT saldo_doses FROM semen_partidas WHERE id = 1");
    expect(Number(final[0]?.saldo_doses)).toBe(8);
  });
});
