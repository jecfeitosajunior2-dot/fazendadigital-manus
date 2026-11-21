import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  listarSaudeAutorizada,
  type ConsultaListaSaude,
  type IoListaSaude,
  type SaudeLista,
} from "./consultaSaudeAutorizada";
import { afirmarBancoDescartavel } from "./isolamentoMysql";

const exec = promisify(execFile);
const CONTAINER = "fd-h4au-saude";
const PORTA = 3364;
const SENHA = "isolado-h4au";
const BANCO = "fd_h4au";

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
  id int NOT NULL, userId int NOT NULL, fazendaId int NULL, brinco varchar(50) NULL,
  brincoEletronico varchar(80) NULL, status varchar(20) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  loteDestinoId int NOT NULL, fazendaId int NULL, fazendaOrigemId int NULL,
  dataMovimentacao date NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE estoque_movimentacoes (
  id int NOT NULL, estoque_id int NOT NULL, fazenda_id int NULL,
  quantidade decimal(12,2) NOT NULL, data_movimentacao date NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE saude_registros (
  id int NOT NULL, userId int NOT NULL, animalId int NOT NULL, tipo varchar(50) NOT NULL,
  descricao text NULL, medicamento varchar(200) NULL, dosagem varchar(100) NULL,
  viaAplicacao varchar(80) NULL, estoqueId int NULL, quantidadeConsumo decimal(12,4) NULL,
  valorUnitario decimal(10,2) NULL, veterinario varchar(200) NULL, custo decimal(10,2) NULL,
  dataRegistro date NOT NULL, proximaData date NULL, observacoes text NULL,
  estoqueMovimentacaoId int NULL, status varchar(20) NULL, estornadoEm timestamp NULL,
  motivoEstorno text NULL, createdAt timestamp NULL, PRIMARY KEY (id)
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

function consultas(conn: mysql.PoolConnection): ConsultaListaSaude {
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
    async registros(titularUserId, animalId) {
      const filtro = animalId == null ? "" : " AND s.animalId = ?";
      const params = animalId == null ? [titularUserId] : [titularUserId, animalId];
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT s.id, s.userId, s.animalId, s.tipo, s.descricao, s.medicamento, s.dosagem, s.viaAplicacao,
                s.estoqueId, s.quantidadeConsumo, s.valorUnitario, s.veterinario, s.custo, s.dataRegistro,
                s.proximaData, s.observacoes, s.estoqueMovimentacaoId, s.status, s.estornadoEm,
                s.motivoEstorno, s.createdAt, m.fazenda_id AS fazendaDoMovimentoId
         FROM saude_registros s
         LEFT JOIN estoque_movimentacoes m ON m.id = s.estoqueMovimentacaoId
         WHERE s.userId = ?${filtro}
         ORDER BY s.createdAt DESC, s.id DESC`,
        params,
      );
      return linhas.map((linha) => ({
        id: Number(linha.id),
        userId: Number(linha.userId),
        animalId: Number(linha.animalId),
        tipo: String(linha.tipo),
        descricao: linha.descricao == null ? null : String(linha.descricao),
        medicamento: linha.medicamento == null ? null : String(linha.medicamento),
        dosagem: linha.dosagem == null ? null : String(linha.dosagem),
        viaAplicacao: linha.viaAplicacao == null ? null : String(linha.viaAplicacao),
        estoqueId: numero(linha.estoqueId),
        quantidadeConsumo: linha.quantidadeConsumo == null ? null : String(linha.quantidadeConsumo),
        valorUnitario: linha.valorUnitario == null ? null : String(linha.valorUnitario),
        veterinario: linha.veterinario == null ? null : String(linha.veterinario),
        custo: linha.custo == null ? null : String(linha.custo),
        dataRegistro: String(linha.dataRegistro).slice(0, 10),
        proximaData: linha.proximaData == null ? null : String(linha.proximaData).slice(0, 10),
        observacoes: linha.observacoes == null ? null : String(linha.observacoes),
        estoqueMovimentacaoId: numero(linha.estoqueMovimentacaoId),
        status: linha.status == null ? null : String(linha.status),
        estornadoEm: linha.estornadoEm == null ? null : String(linha.estornadoEm),
        motivoEstorno: linha.motivoEstorno == null ? null : String(linha.motivoEstorno),
        createdAt: linha.createdAt == null ? null : String(linha.createdAt),
        fazendaDoMovimentoId: numero(linha.fazendaDoMovimentoId),
      }));
    },
    async animaisDosRegistros(titularUserId, ids) {
      if (ids.length === 0) return [];
      const marcas = ids.map(() => "?").join(", ");
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, fazendaId, brinco, brincoEletronico FROM animais WHERE userId = ? AND id IN (${marcas})`,
        [titularUserId, ...ids],
      );
      return linhas.map((linha) => ({
        id: Number(linha.id),
        userId: Number(linha.userId),
        fazendaId: numero(linha.fazendaId),
        brinco: linha.brinco == null ? null : String(linha.brinco),
        brincoEletronico: linha.brincoEletronico == null ? null : String(linha.brincoEletronico),
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

describe.sequential("sanidade em MySQL descartável", () => {
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
    await conn.query("INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, 'saude.visualizar', 1)");
    await conn.query(`
      INSERT INTO animais (id, userId, fazendaId, brinco, status) VALUES
        (50, 1, 10, 'A50', 'ativo'),
        (51, 1, 20, 'A51', 'ativo'),
        (52, 1, 20, 'A52', 'ativo'),
        (54, 4, 40, 'X54', 'ativo')
    `);
    await conn.query(`
      INSERT INTO animal_lote_movimentacoes
        (userId, animalId, loteDestinoId, fazendaId, fazendaOrigemId, dataMovimentacao)
      VALUES (1, 52, 200, 20, 10, '2026-11-01')
    `);
    await conn.query(`
      INSERT INTO estoque_movimentacoes (id, estoque_id, fazenda_id, quantidade, data_movimentacao)
      VALUES (900, 500, 10, 1.00, '2026-12-02')
    `);
    await conn.query(`
      INSERT INTO saude_registros
        (id, userId, animalId, tipo, descricao, medicamento, veterinario, custo, dataRegistro, proximaData, status, estoqueMovimentacaoId, createdAt)
      VALUES
        (1, 1, 50, 'Vacina', 'aftosa', 'Ivomec', 'Dr. Campo', 12.50, '2026-11-02', '2026-12-01', 'ativo', NULL, '2026-11-02 10:00:00'),
        (2, 1, 50, 'Outro', 'curativo', NULL, 'Funcionario Curral', NULL, '2026-08-01', NULL, 'estornado', NULL, '2026-08-01 10:00:00'),
        (3, 1, 50, 'Castração', 'burdizzo', NULL, 'Funcionario Curral', NULL, '2026-07-01', NULL, 'ativo', NULL, '2026-07-01 10:00:00'),
        (4, 1, 51, 'Vacina', 'retiro', 'Ivomec', 'Dr. Campo', 8.00, '2026-11-02', NULL, 'ativo', NULL, '2026-11-02 11:00:00'),
        (5, 1, 52, 'Outro', 'antes', NULL, NULL, NULL, '2026-10-01', NULL, 'ativo', NULL, '2026-10-01 10:00:00'),
        (6, 1, 52, 'Outro', 'depois', NULL, NULL, NULL, '2026-12-01', NULL, 'ativo', NULL, '2026-12-01 10:00:00'),
        (7, 1, 52, 'Vacina', 'saida antiga', 'Ivomec', 'Dr. Campo', 4.00, '2026-12-02', '2026-12-20', 'ativo', 900, '2026-12-02 10:00:00'),
        (8, 4, 54, 'Vacina', 'alheia', 'Ivomec', 'Outro', 1.00, '2026-11-02', NULL, 'ativo', NULL, '2026-11-02 12:00:00')
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

  function io(): IoListaSaude {
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
    return listarSaudeAutorizada(io(), {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      animalId,
      ...extras,
    });
  }

  function ids(resultado: { ok: true; registros: SaudeLista[] } | { ok: false }) {
    return resultado.ok ? resultado.registros.map((registro) => registro.id) : [];
  }

  it("principal vê a conta, inclusive estorno e castração", async () => {
    const resultado = await listar(1, 3);
    expect(resultado.ok).toBe(true);
    expect(ids(resultado).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    if (!resultado.ok) return;
    const porId = new Map(resultado.registros.map((registro) => [registro.id, registro]));
    expect(porId.get(1)?.brincoVisual).toBe("A50");
    expect(porId.get(1)?.veterinario).toBe("Dr. Campo");
    expect(porId.get(1)?.medicamento).toBe("Ivomec");
    expect(porId.get(2)?.status).toBe("estornado");
    expect(porId.get(3)?.tipo).toBe("Castração");
    expect(porId.get(3)?.veterinario).toBe("Funcionario Curral");
    expect(String(porId.get(1)?.createdAt) > String(porId.get(3)?.createdAt)).toBe(true);
  });

  it("funcionário vê a fazenda concedida, o histórico anterior e a saída antiga", async () => {
    const resultado = await listar(2, 1);
    expect(ids(resultado).sort((a, b) => a - b)).toEqual([1, 2, 3, 5, 7]);
  });

  it("funcionário sem permissão não recebe lista", async () => {
    const resultado = await listar(3, 1);
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_permissao" });
  });

  it("tratamento de outro titular não aparece", async () => {
    const resultado = await listar(1, 3, 54);
    expect(resultado).toEqual({ ok: true, registros: [] });
  });

  it("consulta de animal sem lançamento continua vazia", async () => {
    const resultado = await listar(1, 3, 999);
    expect(resultado).toEqual({ ok: true, registros: [] });
  });

  it("as duas fazendas devolvem o antes, o depois e a saída de estoque", async () => {
    await pool.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 20, 1)");
    const resultado = await listar(2, 1, 52);
    expect(ids(resultado).sort((a, b) => a - b)).toEqual([5, 6, 7]);
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 20");
  });

  it("titular enviado pela tela não troca a conta", async () => {
    const resultado = await listar(1, 3, undefined, {
      titularInformadoPeloCliente: 4,
      papelInformadoPeloCliente: "comum",
      permissoesInformadasPeloCliente: [],
      fazendasInformadasPeloCliente: [40],
    });
    expect(ids(resultado)).toContain(1);
    expect(ids(resultado)).not.toContain(8);
  });

  it("sessão revogada não consulta", async () => {
    const resultado = await listar(2, 99);
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_identidade" });
  });
});
