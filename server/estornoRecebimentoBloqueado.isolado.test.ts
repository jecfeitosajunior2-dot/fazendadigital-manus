import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MSG_ESTORNO_RECEBIMENTO_INDISPONIVEL, MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO } from "../shared/compraRecebimentoEstorno";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  recusarEstornoRecebimentoAutorizado,
  type ConsultaEstornoRecebimento,
  type IoEstornoRecebimento,
  type PedidoEstornoRecebimento,
} from "./estornoRecebimentoBloqueado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { MSG_SEM_FAZENDA_MANEJO } from "./registrarManejoAutorizado";

const exec = promisify(execFile);
const CONTAINER = "fd-h4ac-estorno";
const PORTA = 3353;
const SENHA = "isolado-h4ac";
const BANCO = "fd_h4ac";

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
CREATE TABLE compras (
  id int NOT NULL, user_id int NOT NULL, data varchar(20) NOT NULL,
  fazenda_id int NULL, status varchar(20) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE compra_recebimentos (
  id int NOT NULL, user_id int NOT NULL, compra_id int NOT NULL, compra_grupo_id int NOT NULL,
  animal_id int NOT NULL, brinco_visual varchar(50) NOT NULL, sexo varchar(10) NOT NULL,
  categoria varchar(50) NOT NULL, status varchar(20) NOT NULL, recebido_por_user_id int NOT NULL,
  motivo_estorno varchar(80) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, fazendaId int NULL, status varchar(20) NOT NULL,
  brinco varchar(50) NULL, sexo varchar(10) NOT NULL, categoria varchar(50) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pesagens (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  peso decimal(8,2) NOT NULL, data date NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE saude_registros (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  tipo varchar(50) NOT NULL, dataRegistro date NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE reproducao_registros (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, femeaId int NOT NULL,
  tipo varchar(50) NOT NULL, dataCobertura date NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  loteDestinoId int NOT NULL, dataMovimentacao date NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_baixas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  fazendaId int NOT NULL, tipo varchar(20) NOT NULL, dataBaixa date NOT NULL,
  status varchar(20) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

function alvo() {
  return { host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER };
}

function pedido(executorId: number, sessionVersion: number, recebimentoId: number, extra: Partial<PedidoEstornoRecebimento> = {}): PedidoEstornoRecebimento {
  return {
    executorId,
    sessionVersionDaSessao: sessionVersion,
    recebimentoId,
    motivo: "lancamento_incorreto",
    ...extra,
  };
}

describe.sequential("estorno de recebimento sem exclusão física", () => {
  let pool: mysql.Pool;
  let segurar: (() => Promise<void>) | null = null;

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
            (3, 'sem-permissao-isolado', 'Sem Permissao', NULL, 'user', 'comum', 1, 'ativo', 1),
            (4, 'outro-titular-isolado', 'Outra Conta', NULL, 'admin', 'principal', 4, 'ativo', 1),
            (5, 'outra-fazenda-isolado', 'So a outra fazenda', NULL, 'user', 'comum', 1, 'ativo', 1)
        `);
        await conn.query(`
          INSERT INTO fazendas (id, userId, nome) VALUES
            (10, 1, 'Sede'), (20, 1, 'Retiro'), (40, 4, 'Alheia')
        `);
        await conn.query(`
          INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
            (2, 10, 1), (3, 10, 1), (5, 20, 1)
        `);
        await conn.query(`
          INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
            (2, 1, 'compras.desfazer_recebimento', 1),
            (3, 1, 'compras.visualizar', 1),
            (5, 1, 'compras.desfazer_recebimento', 1)
        `);
        await conn.query(`
          INSERT INTO compras (id, user_id, data, fazenda_id, status) VALUES
            (1, 1, '2026-11-01', 10, 'concluido'),
            (2, 4, '2026-11-01', 40, 'concluido'),
            (3, 1, '2026-11-01', 20, 'concluido')
        `);
        await conn.query(`
          INSERT INTO animais (id, userId, fazendaId, status, brinco, sexo, categoria) VALUES
            (70, 1, 10, 'ativo', 'B70', 'femea', 'Vaca'),
            (71, 1, 10, 'ativo', 'B71', 'femea', 'Vaca'),
            (72, 1, 10, 'ativo', 'B72', 'femea', 'Vaca'),
            (73, 1, 10, 'ativo', 'B73', 'femea', 'Vaca'),
            (74, 1, 10, 'ativo', 'B74', 'femea', 'Vaca'),
            (75, 1, 10, 'ativo', 'B75', 'femea', 'Vaca'),
            (76, 1, 10, 'vendido', 'B76', 'femea', 'Vaca'),
            (77, 4, 40, 'ativo', 'B77', 'femea', 'Vaca'),
            (78, 1, 10, 'ativo', 'B78', 'femea', 'Vaca'),
            (79, 1, 10, 'ativo', 'B79', 'femea', 'Vaca'),
            (80, 1, 10, 'ativo', 'B80', 'femea', 'Vaca'),
            (81, 1, 10, 'ativo', 'B81', 'femea', 'Vaca'),
            (82, 1, 20, 'ativo', 'B82', 'femea', 'Vaca')
        `);
        await conn.query(`
          INSERT INTO compra_recebimentos
            (id, user_id, compra_id, compra_grupo_id, animal_id, brinco_visual, sexo, categoria, status, recebido_por_user_id) VALUES
            (700, 1, 1, 1, 70, 'B70', 'femea', 'Vaca', 'confirmado', 1),
            (701, 1, 1, 1, 71, 'B71', 'femea', 'Vaca', 'confirmado', 1),
            (702, 1, 1, 1, 72, 'B72', 'femea', 'Vaca', 'confirmado', 1),
            (703, 1, 1, 1, 73, 'B73', 'femea', 'Vaca', 'confirmado', 1),
            (704, 1, 1, 1, 74, 'B74', 'femea', 'Vaca', 'confirmado', 1),
            (705, 1, 1, 1, 75, 'B75', 'femea', 'Vaca', 'confirmado', 1),
            (706, 1, 1, 1, 76, 'B76', 'femea', 'Vaca', 'confirmado', 1),
            (707, 1, 1, 1, 77, 'B77', 'femea', 'Vaca', 'confirmado', 1),
            (708, 4, 2, 1, 77, 'B77', 'femea', 'Vaca', 'confirmado', 4),
            (709, 1, 1, 1, 78, 'B78', 'femea', 'Vaca', 'confirmado', 1),
            (710, 1, 1, 1, 79, 'B79', 'femea', 'Vaca', 'confirmado', 1),
            (711, 1, 1, 1, 80, 'B80', 'femea', 'Vaca', 'confirmado', 1),
            (712, 1, 1, 1, 81, 'B81', 'femea', 'Vaca', 'confirmado', 1),
            (713, 1, 3, 1, 82, 'B82', 'femea', 'Vaca', 'confirmado', 1)
        `);
        await conn.query("INSERT INTO pesagens (userId, animalId, peso, data) VALUES (1, 71, 320, '2026-11-10')");
        await conn.query("INSERT INTO saude_registros (userId, animalId, tipo, dataRegistro) VALUES (1, 72, 'Vacina', '2026-11-10')");
        await conn.query("INSERT INTO reproducao_registros (userId, femeaId, tipo, dataCobertura) VALUES (1, 73, 'Inseminação', '2026-11-10')");
        await conn.query("INSERT INTO animal_lote_movimentacoes (userId, animalId, loteDestinoId, dataMovimentacao) VALUES (1, 74, 100, '2026-11-12')");
        await conn.query("INSERT INTO animal_baixas (userId, animalId, fazendaId, tipo, dataBaixa, status) VALUES (1, 75, 10, 'morte', '2026-11-11', 'ativa')");
        await conn.end();
        break;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    try {
      pool = mysql.createPool({
        host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
        dateStrings: true, connectionLimit: 6,
      });
      await pool.query("SELECT 1 AS ok");
    } catch (erro) {
      throw new Error(`MySQL isolado não respondeu. ${ultimo} ${erro instanceof Error ? erro.message : ""}`);
    }
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  function consultas(conn: mysql.PoolConnection): ConsultaEstornoRecebimento {
    return {
      async usuario(id): Promise<LinhaUsuarioCadastro | null> {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion FROM users WHERE id = ? FOR UPDATE",
          [id],
        );
        const linha = linhas[0];
        if (!linha) return null;
        return {
          id: Number(linha.id), openId: String(linha.openId), name: linha.name, email: linha.email,
          role: linha.role === "admin" ? "admin" : "user",
          papel: linha.papel, titularUserId: Number(linha.titularUserId),
          situacao: linha.situacao, sessionVersion: Number(linha.sessionVersion),
        };
      },
      async permissoes(userId, titularUserId) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT permissao FROM usuario_permissoes WHERE userId = ? AND titularUserId = ? FOR UPDATE",
          [userId, titularUserId],
        );
        return linhas.map((linha) => String(linha.permissao));
      },
      async vinculos(userId) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT userId, fazendaId FROM usuario_fazendas WHERE userId = ? FOR UPDATE",
          [userId],
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
      async espiarRecebimento(id) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id, user_id AS userId, compra_id AS compraId, animal_id AS animalId, status FROM compra_recebimentos WHERE id = ?",
          [id],
        );
        const linha = linhas[0];
        if (!linha) return null;
        return {
          id: Number(linha.id), userId: Number(linha.userId), compraId: Number(linha.compraId),
          animalId: Number(linha.animalId), status: String(linha.status),
        };
      },
      async espiarCompra(id) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id, user_id AS userId, fazenda_id AS fazendaId, status FROM compras WHERE id = ?",
          [id],
        );
        const linha = linhas[0];
        if (!linha) return null;
        return {
          id: Number(linha.id), userId: Number(linha.userId),
          fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
          status: linha.status == null ? null : String(linha.status),
        };
      },
      async espiarAnimal(id) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id, userId FROM animais WHERE id = ?",
          [id],
        );
        const linha = linhas[0];
        return linha ? { id: Number(linha.id), userId: Number(linha.userId) } : null;
      },
      async aposAutorizacao() {
        if (segurar) await segurar();
      },
    };
  }

  function io(): IoEstornoRecebimento {
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
    const [animais] = await pool.query<RowDataPacket[]>("SELECT id, userId, status FROM animais ORDER BY id");
    const [recebimentos] = await pool.query<RowDataPacket[]>("SELECT id, status, motivo_estorno AS motivo FROM compra_recebimentos ORDER BY id");
    const [compras] = await pool.query<RowDataPacket[]>("SELECT id, status FROM compras ORDER BY id");
    const [pesagens] = await pool.query<RowDataPacket[]>("SELECT id, animalId FROM pesagens ORDER BY id");
    const [saude] = await pool.query<RowDataPacket[]>("SELECT id, animalId FROM saude_registros ORDER BY id");
    const [repro] = await pool.query<RowDataPacket[]>("SELECT id, femeaId FROM reproducao_registros ORDER BY id");
    const [movs] = await pool.query<RowDataPacket[]>("SELECT id, animalId FROM animal_lote_movimentacoes ORDER BY id");
    const [baixas] = await pool.query<RowDataPacket[]>("SELECT id, animalId, status FROM animal_baixas ORDER BY id");
    return { animais, recebimentos, compras, pesagens, saude, repro, movs, baixas };
  }

  it("principal, funcionário autorizado e casos de animal recusam sem apagar", async () => {
    const antes = await fotografia();
    const principal = await recusarEstornoRecebimentoAutorizado(io(), pedido(1, 3, 700, {
      titularInformadoPeloCliente: 4,
      permissoesInformadasPeloCliente: [],
      fazendasInformadasPeloCliente: [],
    }));
    expect(principal).toMatchObject({ ok: false, motivo: "indisponivel", mensagem: MSG_ESTORNO_RECEBIMENTO_INDISPONIVEL });

    const funcionario = await recusarEstornoRecebimentoAutorizado(io(), pedido(2, 1, 700));
    expect(funcionario).toMatchObject({ ok: false, motivo: "indisponivel" });

    const semPermissao = await recusarEstornoRecebimentoAutorizado(io(), pedido(3, 1, 700));
    expect(semPermissao).toMatchObject({ ok: false, motivo: "sem_permissao" });

    const semFazenda = await recusarEstornoRecebimentoAutorizado(io(), pedido(5, 1, 700));
    expect(semFazenda).toMatchObject({ ok: false, motivo: "sem_fazenda", mensagem: MSG_SEM_FAZENDA_MANEJO });

    const animalAlheio = await recusarEstornoRecebimentoAutorizado(io(), pedido(1, 3, 707));
    expect(animalAlheio).toMatchObject({ ok: false, motivo: "outro_titular", mensagem: MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO });

    const recebimentoAlheio = await recusarEstornoRecebimentoAutorizado(io(), pedido(1, 3, 708));
    expect(recebimentoAlheio).toMatchObject({ ok: false, motivo: "outro_titular" });

    for (const id of [701, 702, 703, 704, 705, 706]) {
      const resultado = await recusarEstornoRecebimentoAutorizado(io(), pedido(1, 3, id));
      expect(resultado).toMatchObject({ ok: false, motivo: "indisponivel" });
    }

    expect(await fotografia()).toEqual(antes);
  });

  it("histórico concorrente permanece e o estorno não altera nada", async () => {
    const antes = await fotografia();
    let chegou = false;
    let soltar: () => void = () => undefined;
    segurar = () => {
      chegou = true;
      return new Promise<void>((resolve) => { soltar = resolve; });
    };
    const estorno = recusarEstornoRecebimentoAutorizado(io(), pedido(1, 3, 709));
    const prazo = Date.now() + 10_000;
    while (!chegou && Date.now() < prazo) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(chegou).toBe(true);
    await pool.query("INSERT INTO pesagens (userId, animalId, peso, data) VALUES (1, 78, 330, '2026-11-18')");
    await pool.query("INSERT INTO reproducao_registros (userId, femeaId, tipo, dataCobertura) VALUES (1, 79, 'Monta', '2026-11-18')");
    await pool.query("INSERT INTO animal_lote_movimentacoes (userId, animalId, loteDestinoId, dataMovimentacao) VALUES (1, 80, 200, '2026-11-18')");
    soltar();
    segurar = null;
    expect(await estorno).toMatchObject({ ok: false, motivo: "indisponivel" });
    const depois = await fotografia();
    expect(depois.animais).toEqual(antes.animais);
    expect(depois.recebimentos).toEqual(antes.recebimentos);
    expect(depois.compras).toEqual(antes.compras);
    expect(depois.pesagens).toHaveLength(antes.pesagens.length + 1);
    expect(depois.repro).toHaveLength(antes.repro.length + 1);
    expect(depois.movs).toHaveLength(antes.movs.length + 1);
    expect(depois.baixas).toEqual(antes.baixas);
  });

  it("falha no meio do estorno desfaz a transação e preserva compra e recebimento", async () => {
    const antes = await fotografia();
    segurar = async () => { throw new Error("falha no estorno"); };
    await expect(recusarEstornoRecebimentoAutorizado(io(), pedido(1, 3, 712))).rejects.toThrow(/falha no estorno/);
    segurar = null;
    expect(await fotografia()).toEqual(antes);
  });
});
