import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  listarPesagensAutorizadas,
  recusarExclusaoFisicaPesagem,
  vinculoDaPesagem,
  type ConsultaListaPesagens,
  type IoListaPesagens,
  type PesagemLista,
} from "./consultaPesagemAutorizada";
import { afirmarBancoDescartavel } from "./isolamentoMysql";

const exec = promisify(execFile);
const CONTAINER = "fd-h4at-pesagens";
const PORTA = 3363;
const SENHA = "isolado-h4at";
const BANCO = "fd_h4at";

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
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, fazendaId int NULL, status varchar(20) NOT NULL,
  pesoAtual decimal(8,2) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  loteDestinoId int NOT NULL, fazendaId int NULL, fazendaOrigemId int NULL,
  dataMovimentacao date NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pesagens (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  peso decimal(8,2) NOT NULL, data date NOT NULL, observacoes text NULL,
  createdAt timestamp NULL DEFAULT CURRENT_TIMESTAMP, compraRecebimentoId int NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

function alvo() {
  return { host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER };
}

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

async function conectar(banco?: string) {
  afirmarBancoDescartavel(alvo());
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

function consultas(conn: mysql.PoolConnection): ConsultaListaPesagens {
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
    async pesagens(titularUserId, animalId) {
      const filtro = animalId == null ? "" : " AND animalId = ?";
      const params = animalId == null ? [titularUserId] : [titularUserId, animalId];
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, animalId, peso, data, observacoes, createdAt, compraRecebimentoId
         FROM pesagens WHERE userId = ?${filtro} ORDER BY createdAt DESC, id DESC`,
        params,
      );
      return linhas.map((linha) => ({
        id: Number(linha.id),
        userId: Number(linha.userId),
        animalId: Number(linha.animalId),
        peso: String(linha.peso),
        data: String(linha.data).slice(0, 10),
        observacoes: linha.observacoes == null ? null : String(linha.observacoes),
        createdAt: linha.createdAt == null ? null : String(linha.createdAt),
        compraRecebimentoId: numero(linha.compraRecebimentoId),
      }));
    },
    async animaisDasPesagens(titularUserId, ids) {
      if (ids.length === 0) return [];
      const marcas = ids.map(() => "?").join(", ");
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, fazendaId FROM animais WHERE userId = ? AND id IN (${marcas})`,
        [titularUserId, ...ids],
      );
      return linhas.map((linha) => ({
        id: Number(linha.id),
        userId: Number(linha.userId),
        fazendaId: numero(linha.fazendaId),
      }));
    },
    async movimentosDosAnimais(titularUserId, ids) {
      if (ids.length === 0) return [];
      const marcas = ids.map(() => "?").join(", ");
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT animalId, dataMovimentacao, fazendaOrigemId, fazendaId
         FROM animal_lote_movimentacoes WHERE userId = ? AND animalId IN (${marcas})`,
        [titularUserId, ...ids],
      );
      return linhas.map((linha) => ({
        animalId: Number(linha.animalId),
        data: String(linha.dataMovimentacao).slice(0, 10),
        fazendaOrigemId: numero(linha.fazendaOrigemId),
        fazendaDestinoId: numero(linha.fazendaId),
      }));
    },
  };
}

describe.sequential("pesagens em MySQL descartável", () => {
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
    await conn.query("INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, 'pesagens.visualizar', 1)");
    await conn.query(`
      INSERT INTO animais (id, userId, fazendaId, status, pesoAtual) VALUES
        (50, 1, 10, 'ativo', '220.00'),
        (51, 1, 20, 'ativo', '310.00'),
        (52, 1, 20, 'ativo', '280.00'),
        (54, 4, 40, 'ativo', '190.00')
    `);
    await conn.query(`
      INSERT INTO animal_lote_movimentacoes
        (userId, animalId, loteDestinoId, fazendaId, fazendaOrigemId, dataMovimentacao)
      VALUES (1, 52, 200, 20, 10, '2026-11-01')
    `);
    await conn.query(`
      INSERT INTO pesagens (id, userId, animalId, peso, data, observacoes, compraRecebimentoId) VALUES
        (1, 1, 50, 220.00, '2026-11-02', 'balança', NULL),
        (2, 1, 50, 180.00, '2026-08-01', 'Desmama', NULL),
        (3, 1, 50, 32.00, '2026-01-01', 'Peso ao nascimento', NULL),
        (4, 1, 50, 210.00, '2026-10-01', 'recebido', 70),
        (5, 1, 51, 310.00, '2026-11-02', 'retiro', NULL),
        (6, 1, 52, 250.00, '2026-10-01', 'antes da mudança', NULL),
        (7, 1, 52, 280.00, '2026-12-01', 'depois da mudança', NULL),
        (8, 4, 54, 190.00, '2026-11-02', 'alheia', NULL)
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

  function io(): IoListaPesagens {
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

  async function listar(executorId: number, sessionVersion: number, animalId?: number, extras: Record<string, unknown> = {}) {
    return listarPesagensAutorizadas(io(), {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      animalId,
      ...extras,
    });
  }

  function ids(resultado: { ok: true; pesagens: PesagemLista[] } | { ok: false }) {
    return resultado.ok ? resultado.pesagens.map((pesagem) => pesagem.id) : [];
  }

  it("principal vê as pesagens da conta, inclusive desmama, nascimento e compra", async () => {
    const resultado = await listar(1, 3);
    expect(resultado.ok).toBe(true);
    expect(ids(resultado).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    if (resultado.ok) {
      const porId = new Map(resultado.pesagens.map((pesagem) => [pesagem.id, pesagem]));
      expect(vinculoDaPesagem(porId.get(2)!)).toBe("desmama");
      expect(vinculoDaPesagem(porId.get(3)!)).toBe("nascimento");
      expect(vinculoDaPesagem(porId.get(4)!)).toBe("compra");
      expect(vinculoDaPesagem(porId.get(1)!)).toBe("comum");
    }
  });

  it("funcionário autorizado vê a fazenda concedida e o histórico de antes da transferência", async () => {
    const resultado = await listar(2, 1);
    expect(ids(resultado).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 6]);
  });

  it("funcionário sem permissão não recebe lista", async () => {
    const resultado = await listar(3, 1);
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_permissao" });
  });

  it("pesagem de outro titular não aparece", async () => {
    const resultado = await listar(1, 3, 54);
    expect(resultado.ok && resultado.pesagens).toEqual([]);
  });

  it("consulta de animal sem pesagem continua vazia", async () => {
    const resultado = await listar(1, 3, 999);
    expect(resultado.ok && resultado.pesagens).toEqual([]);
  });

  it("as duas fazendas concedidas devolvem o antes e o depois", async () => {
    await pool.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 20, 1)");
    const resultado = await listar(2, 1, 52);
    expect(ids(resultado).sort((a, b) => a - b)).toEqual([6, 7]);
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 20");
  });

  it("titular enviado pela tela não troca a conta", async () => {
    const resultado = await listar(1, 3, undefined, {
      titularInformadoPeloCliente: 4,
      papelInformadoPeloCliente: "comum",
      permissoesInformadasPeloCliente: [],
      fazendasInformadasPeloCliente: [40],
    });
    expect(ids(resultado)).not.toContain(8);
    expect(ids(resultado)).toContain(1);
  });

  it("sessão revogada não consulta", async () => {
    const resultado = await listar(2, 99);
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_identidade" });
  });

  it("a recusa de exclusão não apaga comum, desmama, nascimento nem compra", async () => {
    const [antes] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS quantidade FROM pesagens");
    expect(() => recusarExclusaoFisicaPesagem()).toThrow(/exclusão da pesagem está bloqueada/i);
    const [depois] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS quantidade FROM pesagens");
    expect(Number(depois[0]?.quantidade)).toBe(Number(antes[0]?.quantidade));
    const [peso] = await pool.query<RowDataPacket[]>("SELECT pesoAtual FROM animais WHERE id = 50");
    expect(String(peso[0]?.pesoAtual)).toBe("220.00");
  });

  it("duas gravações do mesmo animal permanecem as duas", async () => {
    await Promise.all([
      pool.query("INSERT INTO pesagens (userId, animalId, peso, data, observacoes) VALUES (1, 50, 221.00, '2026-11-03', 'a')"),
      pool.query("INSERT INTO pesagens (userId, animalId, peso, data, observacoes) VALUES (1, 50, 222.00, '2026-11-03', 'b')"),
    ]);
    const resultado = await listar(1, 3, 50);
    const textos = resultado.ok ? resultado.pesagens.map((pesagem) => pesagem.observacoes) : [];
    expect(textos).toContain("a");
    expect(textos).toContain("b");
    expect(textos).toContain("Desmama");
  });
});
