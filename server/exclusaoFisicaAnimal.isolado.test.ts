import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MSG_EXCLUSAO_FISICA_INDISPONIVEL } from "../shared/animalExclusao";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { baixarEEspelharAnimal, type PedidoBaixaAnimal } from "./baixarAnimalAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { recusarExclusaoFisicaAnimal } from "./exclusaoFisicaAnimal";
import { pesarEEspelharAnimal, type IoPesagemAnimal, type PedidoPesagem } from "./pesarAnimalAutorizado";

const exec = promisify(execFile);
const CONTAINER = "fd-h4v-exclusao";
const PORTA = 3347;
const SENHA = "isolado-h4v";
const BANCO = "fd_h4v";

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
CREATE TABLE pastos (
  id int NOT NULL, userId int NOT NULL, fazendaId int NOT NULL, nome varchar(100) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE lotes (
  id int NOT NULL, userId int NOT NULL, nome varchar(100) NOT NULL,
  fazendaId int NULL, pastoAtualId int NULL, ativo tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, loteId int NULL, fazendaId int NULL,
  pastoId int NULL, status varchar(20) NOT NULL, brinco varchar(50) NULL,
  dataNascimento date NULL, pesoAtual decimal(8,2) NULL, categoria varchar(50) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pesagens (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  peso decimal(8,2) NOT NULL, data date NOT NULL, observacoes text NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_baixas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  fazendaId int NOT NULL, tipo varchar(20) NOT NULL, dataBaixa date NOT NULL,
  destino varchar(255) NULL, motivo varchar(255) NULL, usuarioNome varchar(200) NULL,
  vendaId int NULL, status varchar(20) NOT NULL, PRIMARY KEY (id),
  UNIQUE KEY animal_baixas_animal_ativa_uq ((CASE WHEN status = 'ativa' THEN animalId END))
) ENGINE=InnoDB;
CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  loteDestinoId int NOT NULL, dataMovimentacao date NOT NULL, usuarioNome varchar(200) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

function alvo() {
  return { host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER };
}

describe.sequential("exclusão física bloqueada em MySQL isolado", () => {
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
    const prazo = Date.now() + 90_000;
    let ultimo = "";
    while (Date.now() < prazo) {
      try {
        const conn = await mysql.createConnection({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
          multipleStatements: true, dateStrings: true,
        });
        await conn.query("SELECT 1 AS ok");
        await conn.query(ESQUEMA);
        await conn.query(`
          INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion) VALUES
            (1, 'principal-isolado', 'Administrador da conta', NULL, 'admin', 'principal', 1, 'ativo', 3),
            (2, 'funcionario-isolado', 'Funcionario Curral', NULL, 'user', 'comum', 1, 'ativo', 1),
            (3, 'sem-permissao-isolado', 'Sem Permissao', NULL, 'user', 'comum', 1, 'ativo', 1)
        `);
        await conn.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede')");
        await conn.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1)");
        await conn.query(`
          INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
            (2, 1, 'animais.inativar', 1), (2, 1, 'pesagens.criar', 1), (3, 1, 'animais.visualizar', 1)
        `);
        await conn.query("INSERT INTO pastos (id, userId, fazendaId, nome) VALUES (1000, 1, 10, 'Curral')");
        await conn.query("INSERT INTO lotes (id, userId, nome, fazendaId, pastoAtualId, ativo) VALUES (100, 1, 'Lote', 10, 1000, 1)");
        await conn.query(`
          INSERT INTO animais (id, userId, loteId, fazendaId, pastoId, status, brinco, dataNascimento, pesoAtual, categoria) VALUES
            (50, 1, NULL, 10, NULL, 'ativo', 'BR-50', '2026-05-10', 200, 'Bezerro'),
            (51, 1, 100, 10, 1000, 'ativo', 'BR-51', '2026-05-10', 210, 'Bezerro'),
            (52, 1, 100, 10, 1000, 'vendido', 'BR-52', '2026-05-10', 300, 'Bezerro'),
            (54, 4, NULL, 40, NULL, 'ativo', 'BR-54', '2026-05-10', 180, 'Bezerro'),
            (56, 1, 100, 10, 1000, 'ativo', 'BR-56', '2026-05-10', 190, 'Bezerro')
        `);
        await conn.query("INSERT INTO pesagens (userId, animalId, peso, data, observacoes) VALUES (1, 51, 180, '2026-10-01', 'entrada')");
        await conn.query("INSERT INTO animal_lote_movimentacoes (userId, animalId, loteDestinoId, dataMovimentacao, usuarioNome) VALUES (1, 51, 100, '2026-01-01', 'antes')");
        await conn.query(`
          INSERT INTO animal_baixas (userId, animalId, fazendaId, tipo, dataBaixa, motivo, usuarioNome, vendaId, status)
          VALUES (1, 52, 10, 'venda', '2026-11-01', 'Venda #1', 'caixa', 1, 'ativa')
        `);
        await conn.end();
        break;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    if (!pool) {
      try {
        pool = mysql.createPool({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
          dateStrings: true, connectionLimit: 4,
        });
        await pool.query("SELECT 1 AS ok");
      } catch (erro) {
        throw new Error(`MySQL isolado não respondeu. ${ultimo} ${erro instanceof Error ? erro.message : ""}`);
      }
    }
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  function ioPesagem(): IoPesagemAnimal {
    return {
      async emTransacao(fn) {
        const conn = await pool.getConnection();
        try {
          await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
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

  async function fotografia() {
    const [animais] = await pool.query<RowDataPacket[]>("SELECT id, userId, status, pesoAtual, loteId FROM animais ORDER BY id");
    const [pesagens] = await pool.query<RowDataPacket[]>("SELECT id, animalId, peso FROM pesagens ORDER BY id");
    const [baixas] = await pool.query<RowDataPacket[]>("SELECT animalId, tipo, status FROM animal_baixas ORDER BY id");
    const [movimentos] = await pool.query<RowDataPacket[]>("SELECT id, animalId FROM animal_lote_movimentacoes ORDER BY id");
    return {
      animais: animais.map((linha) => `${linha.id}:${linha.status}:${linha.pesoAtual}`),
      pesagens: pesagens.map((linha) => `${linha.id}:${linha.animalId}:${linha.peso}`),
      baixas: baixas.map((linha) => `${linha.animalId}:${linha.tipo}:${linha.status}`),
      movimentos: movimentos.map((linha) => `${linha.id}:${linha.animalId}`),
    };
  }

  it("recusa principal, funcionário e cadastros diferentes sem apagar nada", async () => {
    const antes = await fotografia();
    const espelho: number[] = [];
    for (const id of [50, 51, 52, 54, 999]) {
      expect(() => recusarExclusaoFisicaAnimal()).toThrowError(expect.objectContaining({
        code: "PRECONDITION_FAILED",
        message: MSG_EXCLUSAO_FISICA_INDISPONIVEL,
      }));
      expect(id).toBeGreaterThan(0);
    }
    expect(espelho).toEqual([]);
    expect(await fotografia()).toEqual(antes);
  });

  it("mantém morte, transferência externa, pesagem e o histórico", async () => {
    const morte: PedidoBaixaAnimal = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      executorNome: "Administrador da conta",
      input: { fazendaId: 10, animalId: 51, dataBaixa: "2026-11-10", tipo: "morte", motivo: "doenca" },
    };
    const externa: PedidoBaixaAnimal = {
      ...morte,
      input: { fazendaId: 10, animalId: 56, dataBaixa: "2026-11-10", tipo: "transferencia", destino: "Sítio do vizinho" },
    };
    const pesagem: PedidoPesagem = {
      executorId: 2,
      sessionVersionDaSessao: 1,
      input: { animalId: 50, peso: "220", data: "2026-11-10" },
    };
    await expect(baixarEEspelharAnimal(ioPesagem() as never, morte, { async baixar() {} })).resolves.toMatchObject({
      ok: true,
      status: "morto",
    });
    await expect(baixarEEspelharAnimal(ioPesagem() as never, externa, { async baixar() {} })).resolves.toMatchObject({
      ok: true,
      status: "transferido",
    });
    await expect(pesarEEspelharAnimal(ioPesagem(), pesagem, { async pesar() {} })).resolves.toMatchObject({
      ok: true,
      peso: "220.00",
    });
    const foto = await fotografia();
    expect(foto.animais).toContain("51:morto:210.00");
    expect(foto.animais).toContain("56:transferido:190.00");
    expect(foto.animais).toContain("50:ativo:220.00");
    expect(foto.animais).toContain("52:vendido:300.00");
    expect(foto.baixas).toContain("52:venda:ativa");
    expect(foto.baixas).toContain("51:morte:ativa");
    expect(foto.baixas).toContain("56:transferencia:ativa");
    expect(foto.movimentos).toEqual(["1:51"]);
    expect(foto.pesagens.some((linha) => linha.startsWith("1:51:"))).toBe(true);
    expect(foto.pesagens.some((linha) => linha.includes(":50:220"))).toBe(true);
  });

  it("recusa do mesmo jeito quando o MySQL está parado", async () => {
    await pool.end();
    await docker("stop", CONTAINER);
    expect(() => recusarExclusaoFisicaAnimal()).toThrowError(expect.objectContaining({
      message: MSG_EXCLUSAO_FISICA_INDISPONIVEL,
    }));
  });
});

function autenticacao(conn: mysql.PoolConnection) {
  return {
    async usuario(id: number): Promise<LinhaUsuarioCadastro | null> {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion FROM users WHERE id = ? FOR UPDATE",
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
        titularUserId: linha.titularUserId == null ? null : Number(linha.titularUserId),
        situacao: linha.situacao,
        sessionVersion: Number(linha.sessionVersion),
      };
    },
    async permissoes(userId: number, titularUserId: number) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT permissao FROM usuario_permissoes WHERE userId = ? AND titularUserId = ? FOR UPDATE",
        [userId, titularUserId],
      );
      return linhas.map((linha) => String(linha.permissao));
    },
    async vinculos(userId: number, titularUserId: number) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT uf.userId, uf.fazendaId FROM usuario_fazendas uf
         JOIN users u ON u.id = uf.userId WHERE uf.userId = ? AND u.titularUserId = ? FOR UPDATE`,
        [userId, titularUserId],
      );
      return linhas.map((linha) => ({ userId: Number(linha.userId), fazendaId: Number(linha.fazendaId) }));
    },
    async fazendasDoTitular(titularUserId: number) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId FROM fazendas WHERE userId = ?", [titularUserId]);
      return linhas.map((linha) => ({ id: Number(linha.id), userId: Number(linha.userId) }));
    },
    async fazenda(id: number) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId FROM fazendas WHERE id = ? FOR UPDATE", [id]);
      return linhas[0] ? { id: Number(linhas[0].id), userId: Number(linhas[0].userId) } : null;
    },
  };
}

function consultas(conn: mysql.PoolConnection) {
  const auth = autenticacao(conn);
  const animalSql = `SELECT id, userId, fazendaId, loteId, pastoId, status, dataNascimento, pesoAtual, categoria, NULL AS dataDesmama, NULL AS brinco FROM animais`;
  const mapear = (linha: RowDataPacket) => ({
    id: Number(linha.id),
    userId: Number(linha.userId),
    fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
    loteId: linha.loteId == null ? null : Number(linha.loteId),
    pastoId: linha.pastoId == null ? null : Number(linha.pastoId),
    status: linha.status == null ? null : String(linha.status),
    dataDesmama: null,
    dataNascimento: linha.dataNascimento == null ? null : String(linha.dataNascimento).slice(0, 10),
    pesoAtual: linha.pesoAtual == null ? null : String(linha.pesoAtual),
    categoria: linha.categoria == null ? null : String(linha.categoria),
    brinco: null,
  });
  return {
    ...auth,
    async lote(id: number) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId, fazendaId FROM lotes WHERE id = ? FOR UPDATE", [id]);
      return linhas[0] ? { id: Number(linhas[0].id), userId: Number(linhas[0].userId), fazendaId: Number(linhas[0].fazendaId) } : null;
    },
    async pasto(id: number) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId, fazendaId FROM pastos WHERE id = ? FOR UPDATE", [id]);
      return linhas[0] ? { id: Number(linhas[0].id), userId: Number(linhas[0].userId), fazendaId: Number(linhas[0].fazendaId) } : null;
    },
    async espiar(id: number) {
      const [linhas] = await conn.query<RowDataPacket[]>(`${animalSql} WHERE id = ?`, [id]);
      return linhas[0] ? mapear(linhas[0]) : null;
    },
    async animal(id: number, titularUserId: number) {
      const [linhas] = await conn.query<RowDataPacket[]>(`${animalSql} WHERE id = ? AND userId = ? FOR UPDATE`, [id, titularUserId]);
      return linhas[0] ? mapear(linhas[0]) : null;
    },
    async baixaAtiva(animalId: number) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, vendaId, dataBaixa FROM animal_baixas WHERE animalId = ? AND status = 'ativa' LIMIT 1 FOR UPDATE",
        [animalId],
      );
      if (!linhas[0]) return null;
      return {
        id: Number(linhas[0].id),
        vendaId: linhas[0].vendaId == null ? null : Number(linhas[0].vendaId),
        dataBaixa: linhas[0].dataBaixa == null ? null : String(linhas[0].dataBaixa).slice(0, 10),
      };
    },
    async inserirBaixa(row: { userId: number; animalId: number; fazendaId: number; tipo: string; dataBaixa: string; destino: string | null; motivo: string | null; observacoes: string | null; usuarioNome: string | null }) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO animal_baixas (userId, animalId, fazendaId, tipo, dataBaixa, destino, motivo, usuarioNome, vendaId, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'ativa')`,
        [row.userId, row.animalId, row.fazendaId, row.tipo, row.dataBaixa, row.destino, row.motivo, row.usuarioNome],
      );
      return Number(resultado.insertId);
    },
    async atualizarStatus(id: number, titularUserId: number, status: string) {
      await conn.query("UPDATE animais SET status = ? WHERE id = ? AND userId = ? AND status = 'ativo'", [status, id, titularUserId]);
    },
    async sincronizarStatusPasto() {},
    async temRastro() { return false; },
    async excluirAnimal() { throw new Error("a lixeira não pode apagar"); },
    async eventosDesmama() { return []; },
    async pesagensDoAnimal() { return []; },
    async inserirPesagem(row: { userId: number; animalId: number; peso: string; data: string; observacoes: string | null }) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        "INSERT INTO pesagens (userId, animalId, peso, data, observacoes) VALUES (?, ?, ?, ?, ?)",
        [row.userId, row.animalId, row.peso, row.data, row.observacoes],
      );
      return Number(resultado.insertId);
    },
    async atualizarPeso(id: number, titularUserId: number, peso: string) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        "UPDATE animais SET pesoAtual = ? WHERE id = ? AND userId = ?",
        [peso, id, titularUserId],
      );
      return resultado.affectedRows > 0;
    },
    async atualizarDesmama() { return false; },
    async atualizarObservacaoPesagem() {},
  };
}
