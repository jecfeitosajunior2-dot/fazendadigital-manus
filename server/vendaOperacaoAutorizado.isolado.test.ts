import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TRPCError } from "@trpc/server";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MSG_VENDA_CONFLITO_IDEMPOTENCIA,
  validarCondicaoRecebimentoVenda,
} from "../shared/vendaFinanceiro";
import {
  MSG_VENDA_ANIMAL_INDISPONIVEL,
  MSG_VENDA_ANIMAL_OUTRA_FAZENDA,
  calcularValorItem,
} from "../shared/vendaComercial";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { MSG_SEM_FAZENDA_MANEJO } from "./registrarManejoAutorizado";
import {
  MSG_SEM_PERMISSAO_CANCELAR_VENDA,
  MSG_SEM_PERMISSAO_CONFIRMAR_VENDA,
  cancelarVendaAutorizada,
  confirmarVendaAutorizada,
  type ConsultaVendaOperacao,
  type IoVendaOperacao,
} from "./vendaOperacaoAutorizado";

const exec = promisify(execFile);
const CONTAINER = "fd-h4ad-venda";
const PORTA = 3354;
const SENHA = "isolado-h4ad";
const BANCO = "fd_h4ad";
const MSG_JA_CANCELADA = "Esta venda já está cancelada.";
const MSG_ANIMAL_ALTERADO = "Não foi possível cancelar: um ou mais animais já não estão mais como vendidos nesta venda.";
const MSG_COM_RECEBIMENTO = "Esta venda não pode ser cancelada porque já tem recebimento efetivo.";

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
CREATE TABLE pessoas (
  id int NOT NULL, userId int NOT NULL, nome varchar(200) NOT NULL,
  tipo varchar(20) NOT NULL, ativo tinyint NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, fazendaId int NULL, loteId int NULL, pastoId int NULL,
  status varchar(20) NOT NULL, brinco varchar(50) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_baixas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  fazendaId int NOT NULL, tipo varchar(20) NOT NULL, dataBaixa date NOT NULL,
  status varchar(20) NOT NULL, vendaId int NULL, destino varchar(255) NULL,
  motivo varchar(255) NULL, usuarioNome varchar(200) NULL,
  ativaChave int GENERATED ALWAYS AS (CASE WHEN status = 'ativa' THEN animalId ELSE NULL END) STORED,
  PRIMARY KEY (id), UNIQUE KEY animal_baixas_animal_ativa_uq (ativaChave)
) ENGINE=InnoDB;
CREATE TABLE vendas (
  id int NOT NULL AUTO_INCREMENT, user_id int NOT NULL, fazenda_id int NULL,
  comprador_id int NULL, comprador varchar(255) NULL, data varchar(20) NOT NULL,
  status varchar(20) NOT NULL, valor_total varchar(50) NULL, quantidade_animais int NULL,
  idempotency_key varchar(80) NULL, cancelado_por_user_id int NULL,
  motivo_cancelamento varchar(255) NULL, PRIMARY KEY (id),
  UNIQUE KEY vendas_idem_uq (user_id, idempotency_key)
) ENGINE=InnoDB;
CREATE TABLE venda_itens (
  id int NOT NULL AUTO_INCREMENT, user_id int NOT NULL, venda_id int NOT NULL,
  animal_id int NOT NULL, valor_item decimal(12,2) NOT NULL,
  preco_unitario decimal(12,2) NOT NULL, PRIMARY KEY (id),
  UNIQUE KEY venda_itens_venda_animal_uq (venda_id, animal_id)
) ENGINE=InnoDB;
CREATE TABLE financeiro_titulos (
  id int NOT NULL AUTO_INCREMENT, user_id int NOT NULL, venda_id int NOT NULL,
  estado varchar(20) NOT NULL, valor_original decimal(12,2) NOT NULL,
  origem_item_chave varchar(40) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE financeiro_parcelas (
  id int NOT NULL AUTO_INCREMENT, user_id int NOT NULL, titulo_id int NOT NULL,
  numero int NOT NULL, valor_original decimal(12,2) NOT NULL, vencimento date NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE financeiro_liquidacoes (
  id int NOT NULL AUTO_INCREMENT, user_id int NOT NULL, titulo_id int NOT NULL,
  valor decimal(12,2) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE financeiro_movimentos (
  id int NOT NULL AUTO_INCREMENT, user_id int NOT NULL, titulo_id int NULL,
  valor decimal(12,2) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  loteDestinoId int NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

type Conn = mysql.PoolConnection;
type Spec = {
  fazendaId: number;
  itens: { animalId: number; precoUnitario: number }[];
  condicao?: "a_vista" | "parcelado";
  parcelas?: { numero: number; vencimento: string; valorOriginal: number }[];
  idempotencyKey?: string;
  integrado: boolean;
  usuarioNome: string;
  falha?: "baixa" | "financeiro";
  depoisDasTravas?: () => Promise<void>;
  ordem?: number[];
};

function recusar(message: string, code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

function duplicado(error: unknown): boolean {
  const item = error as { errno?: number; code?: string };
  return item?.errno === 1062 || item?.code === "ER_DUP_ENTRY";
}

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

describe.sequential("confirmação e cancelamento de venda", () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    afirmarBancoDescartavel({ host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER });
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
            (5, 'retiro-isolado', 'So o Retiro', NULL, 'user', 'comum', 1, 'ativo', 1)
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
            (2, 1, 'vendas.confirmar', 1), (2, 1, 'vendas.cancelar', 1),
            (3, 1, 'vendas.visualizar', 1),
            (5, 1, 'vendas.confirmar', 1), (5, 1, 'vendas.cancelar', 1)
        `);
        await conn.query("INSERT INTO pessoas (id, userId, nome, tipo, ativo) VALUES (7, 1, 'Frigorifico', 'cliente', 1)");
        await conn.query(`
          INSERT INTO animais (id, userId, fazendaId, loteId, pastoId, status, brinco) VALUES
            (10, 1, 10, 5, 8, 'ativo', 'A10'), (11, 1, 10, 5, 8, 'ativo', 'A11'),
            (12, 1, 10, 5, 8, 'ativo', 'A12'), (14, 4, 40, NULL, NULL, 'ativo', 'A14'),
            (15, 1, 10, 5, 8, 'ativo', 'A15'), (16, 1, 10, 5, 8, 'ativo', 'A16'),
            (18, 1, 10, 5, 8, 'ativo', 'A18'), (19, 1, 10, 5, 8, 'ativo', 'A19'),
            (20, 1, 10, 5, 8, 'ativo', 'A20'), (21, 1, 10, 5, 8, 'ativo', 'A21'),
            (23, 1, 10, 5, 8, 'ativo', 'A23'), (24, 1, 10, 5, 8, 'ativo', 'A24'),
            (25, 1, 20, 5, 8, 'ativo', 'A25'), (27, 1, 20, 6, 9, 'ativo', 'A27'),
            (28, 1, 10, 5, 8, 'ativo', 'A28'), (31, 1, 10, 5, 8, 'ativo', 'A31'),
            (32, 1, 10, 5, 8, 'ativo', 'A32'), (33, 1, 10, 5, 8, 'ativo', 'A33'),
            (40, 1, 10, 5, 8, 'vendido', 'A40'), (41, 1, 10, 5, 8, 'vendido', 'A41'),
            (42, 1, 10, 5, 8, 'vendido', 'A42'), (44, 1, 10, 5, 8, 'morto', 'A44'),
            (45, 4, 40, NULL, NULL, 'vendido', 'A45'), (46, 1, 20, 6, 9, 'vendido', 'A46'),
            (47, 1, 10, 5, 8, 'vendido', 'A47'), (48, 1, 10, 5, 8, 'vendido', 'A48'),
            (49, 1, 10, 5, 8, 'morto', 'A49')
        `);
        await conn.query(`
          INSERT INTO animal_baixas (userId, animalId, fazendaId, tipo, dataBaixa, status, vendaId, motivo) VALUES
            (1, 12, 10, 'morte', '2026-11-01', 'ativa', NULL, 'Raio'),
            (1, 40, 10, 'venda', '2026-11-02', 'ativa', 500, 'Venda #500'),
            (1, 41, 10, 'venda', '2026-11-02', 'ativa', 501, 'Venda #501'),
            (1, 42, 10, 'venda', '2026-11-02', 'ativa', 502, 'Venda #502'),
            (1, 44, 10, 'venda', '2026-11-02', 'ativa', 504, 'Venda #504'),
            (4, 45, 40, 'venda', '2026-11-02', 'ativa', 505, 'Venda #505'),
            (1, 46, 20, 'venda', '2026-11-02', 'ativa', 506, 'Venda #506'),
            (1, 47, 10, 'venda', '2026-11-02', 'ativa', 507, 'Venda #507'),
            (1, 48, 10, 'venda', '2026-11-02', 'ativa', 508, 'Venda #508'),
            (1, 49, 10, 'morte', '2026-11-01', 'ativa', NULL, 'Raio antigo')
        `);
        await conn.query(`
          INSERT INTO vendas (id, user_id, fazenda_id, comprador_id, comprador, data, status, valor_total, quantidade_animais) VALUES
            (500, 1, 10, 7, 'Frigorifico', '2026-11-02', 'concluido', '1000.00', 1),
            (501, 1, 10, 7, 'Frigorifico', '2026-11-02', 'concluido', '1000.00', 1),
            (502, 1, 10, 7, 'Frigorifico', '2026-11-02', 'concluido', '1000.00', 1),
            (504, 1, 10, 7, 'Frigorifico', '2026-11-02', 'concluido', '1000.00', 1),
            (505, 4, 40, 7, 'Frigorifico', '2026-11-02', 'concluido', '1000.00', 1),
            (506, 1, 20, 7, 'Frigorifico', '2026-11-02', 'concluido', '1000.00', 1),
            (507, 1, 10, 7, 'Frigorifico', '2026-11-02', 'concluido', '1000.00', 1),
            (508, 1, 10, 7, 'Frigorifico', '2026-11-02', 'concluido', '1000.00', 1),
            (509, 1, NULL, 7, 'Frigorifico', '2026-11-02', 'concluido', '1000.00', 1)
        `);
        await conn.query(`
          INSERT INTO venda_itens (user_id, venda_id, animal_id, valor_item, preco_unitario) VALUES
            (1, 500, 40, 1000, 1000), (1, 501, 41, 1000, 1000), (1, 502, 42, 1000, 1000),
            (1, 504, 44, 1000, 1000), (4, 505, 45, 1000, 1000), (1, 506, 46, 1000, 1000),
            (1, 507, 47, 1000, 1000), (1, 508, 48, 1000, 1000)
        `);
        await conn.query(`
          INSERT INTO financeiro_titulos (id, user_id, venda_id, estado, valor_original, origem_item_chave) VALUES
            (801, 1, 501, 'ativo', 1000, 'principal'),
            (802, 1, 502, 'ativo', 1000, 'principal')
        `);
        await conn.query(`
          INSERT INTO financeiro_parcelas (user_id, titulo_id, numero, valor_original, vencimento) VALUES
            (1, 801, 1, 400, '2026-11-10'), (1, 801, 2, 600, '2026-12-10'),
            (1, 802, 1, 1000, '2026-11-02')
        `);
        await conn.query("INSERT INTO financeiro_liquidacoes (user_id, titulo_id, valor) VALUES (1, 802, 1000)");
        await conn.query("INSERT INTO animal_lote_movimentacoes (userId, animalId, loteDestinoId) VALUES (1, 40, 5)");
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
        dateStrings: true, connectionLimit: 8,
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

  function consultas(conn: Conn): ConsultaVendaOperacao & { conn: Conn } {
    return {
      conn,
      async usuario(id): Promise<LinhaUsuarioCadastro | null> {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion FROM users WHERE id = ? FOR UPDATE",
          [id],
        );
        const linha = linhas[0];
        if (!linha) return null;
        return {
          id: Number(linha.id), openId: String(linha.openId), name: linha.name, email: linha.email,
          role: linha.role === "admin" ? "admin" : "user", papel: linha.papel,
          titularUserId: Number(linha.titularUserId), situacao: linha.situacao,
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
          "SELECT id, userId FROM fazendas WHERE id = ? FOR UPDATE", [id],
        );
        const linha = linhas[0];
        return linha ? { id: Number(linha.id), userId: Number(linha.userId) } : null;
      },
      async espiarVenda(id) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id, user_id AS userId, fazenda_id AS fazendaId, status FROM vendas WHERE id = ?",
          [id],
        );
        const linha = linhas[0];
        if (!linha) return null;
        return {
          id: Number(linha.id),
          userId: Number(linha.userId),
          fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
          status: linha.status == null ? null : String(linha.status),
        };
      },
    };
  }

  function io(): IoVendaOperacao {
    return {
      async emTransacao(fn) {
        const conn = await pool.getConnection();
        try {
          await conn.query("SET SESSION innodb_lock_wait_timeout = 8");
          await conn.beginTransaction();
          const resultado = await fn(consultas(conn));
          await conn.commit();
          return resultado;
        } catch (error) {
          await conn.rollback();
          throw error;
        } finally {
          conn.release();
        }
      },
    };
  }

  async function numero(sql: string, params: unknown[] = []) {
    const [linhas] = await pool.query<RowDataPacket[]>(sql, params);
    return Number(linhas[0]?.n ?? 0);
  }

  async function animal(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT userId, fazendaId, loteId, pastoId, status FROM animais WHERE id = ?",
      [id],
    );
    const linha = linhas[0];
    return {
      userId: Number(linha.userId),
      fazendaId: Number(linha.fazendaId),
      loteId: linha.loteId == null ? null : Number(linha.loteId),
      pastoId: linha.pastoId == null ? null : Number(linha.pastoId),
      status: String(linha.status),
    };
  }

  async function confirmar(executorId: number, spec: Spec) {
    return confirmarVendaAutorizada(io(), {
      executorId,
      sessionVersionDaSessao: executorId === 1 ? 3 : 1,
      fazendaId: spec.fazendaId,
      titularInformadoPeloCliente: 4,
      permissoesInformadasPeloCliente: ["vendas.confirmar"],
    }, (titularUserId, tx) => efeitoConfirmar((tx as { conn: Conn }).conn, titularUserId, spec));
  }

  async function cancelar(executorId: number, vendaId: number, gancho?: () => Promise<void>) {
    return cancelarVendaAutorizada(io(), {
      executorId,
      sessionVersionDaSessao: executorId === 1 ? 3 : 1,
      vendaId,
      motivo: "Cliente desistiu",
      titularInformadoPeloCliente: 4,
    }, (titularUserId, tx) => efeitoCancelar((tx as { conn: Conn }).conn, titularUserId, vendaId, executorId, gancho));
  }

  async function efeitoConfirmar(conn: Conn, titularUserId: number, spec: Spec) {
    const ids = [...new Set(spec.itens.map((item) => item.animalId))].sort((a, b) => a - b);
    const condicao = spec.integrado
      ? validarCondicaoRecebimentoVenda({
        fazendaId: spec.fazendaId,
        compradorId: 7,
        data: "2026-11-10",
        formaPrecificacao: "cabeca",
        condicao: spec.condicao ?? "a_vista",
        itens: spec.itens,
        parcelas: spec.parcelas,
      })
      : null;
    if (condicao && !condicao.ok) recusar(condicao.message);
    const itens = spec.integrado && condicao && condicao.ok
      ? condicao.itens
      : spec.itens.map((item) => {
        const calc = calcularValorItem({ forma: "cabeca", precoUnitario: item.precoUnitario });
        if (!calc.ok) recusar(calc.message);
        return { ...item, valorItem: calc.valor };
      });
    const valorTotal = itens.reduce((soma, item) => soma + Number(item.valorItem), 0);
    if (spec.idempotencyKey) {
      const [existentes] = await conn.query<RowDataPacket[]>(
        "SELECT id, status FROM vendas WHERE user_id = ? AND idempotency_key = ? FOR UPDATE",
        [titularUserId, spec.idempotencyKey],
      );
      if (existentes[0]) {
        if (String(existentes[0].status) === "cancelado") recusar("Esta venda já foi cancelada. A mesma chave não confirma de novo e não gera outra venda.");
        const [gravados] = await conn.query<RowDataPacket[]>(
          "SELECT animal_id AS animalId FROM venda_itens WHERE venda_id = ? ORDER BY animal_id",
          [existentes[0].id],
        );
        const mesmos = gravados.map((linha) => Number(linha.animalId)).join(",") === ids.join(",");
        if (!mesmos) recusar(MSG_VENDA_CONFLITO_IDEMPOTENCIA, "CONFLICT");
        const [titulos] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM financeiro_titulos WHERE user_id = ? AND venda_id = ? ORDER BY id",
          [titularUserId, existentes[0].id],
        );
        return {
          success: true as const,
          vendaId: Number(existentes[0].id),
          tituloId: titulos[0] ? Number(titulos[0].id) : null,
          quantidade: ids.length,
          valorTotal,
          idempotente: true,
        };
      }
    }
    const [compradores] = await conn.query<RowDataPacket[]>(
      "SELECT nome, tipo, ativo FROM pessoas WHERE id = 7 AND userId = ?",
      [titularUserId],
    );
    if (!compradores[0] || compradores[0].tipo !== "cliente" || Number(compradores[0].ativo) !== 1) {
      recusar("Selecione o comprador.");
    }
    const animais = [];
    for (const id of ids) {
      spec.ordem?.push(id);
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId, fazendaId, status, brinco FROM animais WHERE id = ? FOR UPDATE",
        [id],
      );
      const linha = linhas[0];
      if (!linha || Number(linha.userId) !== titularUserId) recusar(MSG_VENDA_ANIMAL_INDISPONIVEL);
      animais.push(linha);
    }
    for (const linha of animais) {
      if (String(linha.status) !== "ativo") recusar(MSG_VENDA_ANIMAL_INDISPONIVEL);
      if (Number(linha.fazendaId) !== spec.fazendaId) recusar(MSG_VENDA_ANIMAL_OUTRA_FAZENDA);
      const [baixas] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM animal_baixas WHERE animalId = ? AND status = 'ativa' FOR UPDATE",
        [linha.id],
      );
      if (baixas.length) recusar(MSG_VENDA_ANIMAL_INDISPONIVEL);
    }
    if (spec.depoisDasTravas) await spec.depoisDasTravas();
    let vendaId = 0;
    try {
      const [inserida] = await conn.query<ResultSetHeader>(
        `INSERT INTO vendas (user_id, fazenda_id, comprador_id, comprador, data, status, valor_total, quantidade_animais, idempotency_key)
         VALUES (?, ?, 7, ?, '2026-11-10', 'concluido', ?, ?, ?)`,
        [titularUserId, spec.fazendaId, String(compradores[0].nome), valorTotal.toFixed(2), ids.length, spec.idempotencyKey ?? null],
      );
      vendaId = Number(inserida.insertId);
    } catch (error) {
      if (!(duplicado(error) && spec.idempotencyKey)) throw error;
      const [existentes] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM vendas WHERE user_id = ? AND idempotency_key = ?",
        [titularUserId, spec.idempotencyKey],
      );
      if (!existentes[0]) throw error;
      return { success: true as const, vendaId: Number(existentes[0].id), tituloId: null, quantidade: ids.length, valorTotal, idempotente: true };
    }
    for (const item of itens) {
      await conn.query(
        "INSERT INTO venda_itens (user_id, venda_id, animal_id, valor_item, preco_unitario) VALUES (?, ?, ?, ?, ?)",
        [titularUserId, vendaId, item.animalId, item.valorItem, item.precoUnitario],
      );
    }
    if (spec.falha === "baixa") throw new Error("falha na baixa");
    for (const id of ids) {
      await conn.query(
        `INSERT INTO animal_baixas (userId, animalId, fazendaId, tipo, dataBaixa, status, vendaId, destino, motivo, usuarioNome)
         VALUES (?, ?, ?, 'venda', '2026-11-10', 'ativa', ?, ?, ?, ?)`,
        [titularUserId, id, spec.fazendaId, vendaId, String(compradores[0].nome), `Venda #${vendaId}`, spec.usuarioNome],
      );
      const [atualizado] = await conn.query<ResultSetHeader>(
        "UPDATE animais SET status = 'vendido' WHERE id = ? AND userId = ? AND status = 'ativo'",
        [id, titularUserId],
      );
      if (atualizado.affectedRows !== 1) recusar(MSG_VENDA_ANIMAL_INDISPONIVEL);
    }
    if (spec.falha === "financeiro") throw new Error("falha no financeiro");
    let tituloId: number | null = null;
    if (spec.integrado && condicao && condicao.ok) {
      const [titulo] = await conn.query<ResultSetHeader>(
        `INSERT INTO financeiro_titulos (user_id, venda_id, estado, valor_original, origem_item_chave)
         VALUES (?, ?, 'ativo', ?, 'principal')`,
        [titularUserId, vendaId, valorTotal.toFixed(2)],
      );
      tituloId = Number(titulo.insertId);
      for (const parcela of condicao.parcelas) {
        await conn.query(
          `INSERT INTO financeiro_parcelas (user_id, titulo_id, numero, valor_original, vencimento)
           VALUES (?, ?, ?, ?, ?)`,
          [titularUserId, tituloId, parcela.numero, parcela.valorOriginal, parcela.vencimento],
        );
      }
    }
    return { success: true as const, vendaId, tituloId, quantidade: ids.length, valorTotal, idempotente: false };
  }

  async function efeitoCancelar(conn: Conn, titularUserId: number, vendaId: number, executorId: number, gancho?: () => Promise<void>) {
    const [vendas] = await conn.query<RowDataPacket[]>(
      "SELECT id, user_id AS userId, status FROM vendas WHERE id = ? FOR UPDATE",
      [vendaId],
    );
    const venda = vendas[0];
    if (!venda || Number(venda.userId) !== titularUserId) recusar("Venda não encontrada.", "NOT_FOUND");
    if (String(venda.status) === "cancelado") recusar(MSG_JA_CANCELADA);
    if (String(venda.status) !== "concluido") recusar("Só é possível cancelar uma venda concluída.");
    const [itens] = await conn.query<RowDataPacket[]>(
      "SELECT animal_id AS animalId FROM venda_itens WHERE user_id = ? AND venda_id = ? ORDER BY animal_id",
      [titularUserId, vendaId],
    );
    const ids = itens.map((item) => Number(item.animalId));
    if (!ids.length) recusar("Esta venda não tem itens individuais e não pode ser cancelada por aqui.");
    for (const id of ids) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, status FROM animais WHERE id = ? AND userId = ? FOR UPDATE",
        [id, titularUserId],
      );
      if (!linhas[0] || String(linhas[0].status) !== "vendido") recusar(MSG_ANIMAL_ALTERADO);
    }
    if (gancho) await gancho();
    const baixas = [];
    for (const id of ids) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, tipo FROM animal_baixas
         WHERE userId = ? AND animalId = ? AND vendaId = ? AND tipo = 'venda' AND status = 'ativa' FOR UPDATE`,
        [titularUserId, id, vendaId],
      );
      if (!linhas[0]) recusar("Não foi possível cancelar: a baixa ativa desta venda não foi encontrada para todos os animais.");
      baixas.push(Number(linhas[0].id));
    }
    const [titulos] = await conn.query<RowDataPacket[]>(
      "SELECT id, estado FROM financeiro_titulos WHERE user_id = ? AND venda_id = ? ORDER BY id FOR UPDATE",
      [titularUserId, vendaId],
    );
    if (titulos.length > 1) recusar("Há mais de um título financeiro para esta venda.");
    const titulo = titulos[0];
    if (titulo && String(titulo.estado) !== "cancelado") {
      const [liquidacoes] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM financeiro_liquidacoes WHERE user_id = ? AND titulo_id = ?",
        [titularUserId, titulo.id],
      );
      if (liquidacoes.length) recusar(MSG_COM_RECEBIMENTO);
    }
    for (const baixaId of baixas) {
      const [estornada] = await conn.query<ResultSetHeader>(
        `UPDATE animal_baixas SET status = 'estornada'
         WHERE id = ? AND userId = ? AND vendaId = ? AND tipo = 'venda' AND status = 'ativa'`,
        [baixaId, titularUserId, vendaId],
      );
      if (estornada.affectedRows !== 1) recusar("Não foi possível cancelar: a baixa ativa desta venda não foi encontrada para todos os animais.");
    }
    for (const id of ids) {
      const [restaurado] = await conn.query<ResultSetHeader>(
        "UPDATE animais SET status = 'ativo' WHERE id = ? AND userId = ? AND status = 'vendido'",
        [id, titularUserId],
      );
      if (restaurado.affectedRows !== 1) recusar(MSG_ANIMAL_ALTERADO);
    }
    if (titulo && String(titulo.estado) !== "cancelado") {
      await conn.query(
        "UPDATE financeiro_titulos SET estado = 'cancelado' WHERE id = ? AND user_id = ? AND estado = 'ativo'",
        [titulo.id, titularUserId],
      );
    }
    const [atualizada] = await conn.query<ResultSetHeader>(
      `UPDATE vendas SET status = 'cancelado', cancelado_por_user_id = ?, motivo_cancelamento = 'Cliente desistiu'
       WHERE id = ? AND user_id = ? AND status = 'concluido'`,
      [executorId, vendaId, titularUserId],
    );
    if (atualizada.affectedRows !== 1) recusar(MSG_JA_CANCELADA);
    return { success: true as const, vendaId, quantidade: ids.length, tituloCancelado: Boolean(titulo) };
  }

  it("confirma um animal, vários, e recusa quem não pode", async () => {
    const principal = await confirmar(1, {
      fazendaId: 10, integrado: true, condicao: "a_vista", usuarioNome: "Administrador da conta",
      idempotencyKey: "ven-h4ad-principal", itens: [{ animalId: 15, precoUnitario: 1500 }],
    });
    expect(principal).toMatchObject({ success: true, quantidade: 1, valorTotal: 1500, idempotente: false });
    expect(await animal(15)).toMatchObject({ status: "vendido", userId: 1, loteId: 5, pastoId: 8, fazendaId: 10 });
    const [baixaPrincipal] = await pool.query<RowDataPacket[]>(
      "SELECT userId, tipo, vendaId, usuarioNome FROM animal_baixas WHERE animalId = 15 AND status = 'ativa'",
    );
    expect(baixaPrincipal[0]).toMatchObject({
      userId: 1, tipo: "venda", vendaId: principal.vendaId, usuarioNome: "Administrador da conta",
    });
    const parcelasVista = await numero("SELECT COUNT(*) AS n FROM financeiro_parcelas WHERE titulo_id = ?", [principal.tituloId]);
    expect(parcelasVista).toBe(1);

    const varios = await confirmar(2, {
      fazendaId: 10, integrado: true, condicao: "parcelado", usuarioNome: "Funcionario Curral",
      idempotencyKey: "ven-h4ad-varios",
      itens: [{ animalId: 11, precoUnitario: 1000 }, { animalId: 10, precoUnitario: 1000 }],
      parcelas: [
        { numero: 1, vencimento: "2026-11-10", valorOriginal: 1000 },
        { numero: 2, vencimento: "2026-12-10", valorOriginal: 1000 },
      ],
    });
    expect(varios.quantidade).toBe(2);
    expect(await animal(10)).toMatchObject({ status: "vendido", userId: 1 });
    expect(await animal(11)).toMatchObject({ status: "vendido", userId: 1 });
    expect(await numero("SELECT COUNT(*) AS n FROM animal_baixas WHERE vendaId = ? AND tipo = 'venda' AND userId = 1", [varios.vendaId])).toBe(2);
    expect(await numero("SELECT COUNT(*) AS n FROM financeiro_parcelas WHERE titulo_id = ?", [varios.tituloId])).toBe(2);
    const [titulo] = await pool.query<RowDataPacket[]>("SELECT user_id AS userId, estado FROM financeiro_titulos WHERE id = ?", [varios.tituloId]);
    expect(titulo[0]).toMatchObject({ userId: 1, estado: "ativo" });

    const comercial = await confirmar(1, {
      fazendaId: 10, integrado: false, usuarioNome: "Administrador da conta",
      itens: [{ animalId: 28, precoUnitario: 800 }],
    });
    expect(comercial.tituloId).toBeNull();
    expect(await numero("SELECT COUNT(*) AS n FROM animal_baixas WHERE animalId = 28 AND tipo = 'venda' AND vendaId = ?", [comercial.vendaId])).toBe(1);
    expect(await numero("SELECT COUNT(*) AS n FROM financeiro_titulos WHERE venda_id = ?", [comercial.vendaId])).toBe(0);

    await expect(confirmar(3, {
      fazendaId: 10, integrado: true, usuarioNome: "Sem Permissao",
      itens: [{ animalId: 16, precoUnitario: 1000 }],
    })).rejects.toMatchObject({ message: MSG_SEM_PERMISSAO_CONFIRMAR_VENDA });
    await expect(confirmar(5, {
      fazendaId: 10, integrado: true, usuarioNome: "So o Retiro",
      itens: [{ animalId: 16, precoUnitario: 1000 }],
    })).rejects.toMatchObject({ message: MSG_SEM_FAZENDA_MANEJO });
    expect(await animal(16)).toMatchObject({ status: "ativo" });

    const retiro = await confirmar(5, {
      fazendaId: 20, integrado: true, usuarioNome: "So o Retiro",
      idempotencyKey: "ven-h4ad-retiro", itens: [{ animalId: 27, precoUnitario: 900 }],
    });
    expect(retiro.vendaId).toBeGreaterThan(0);
    const [vendaRetiro] = await pool.query<RowDataPacket[]>("SELECT user_id AS userId, fazenda_id AS fazendaId FROM vendas WHERE id = ?", [retiro.vendaId]);
    expect(vendaRetiro[0]).toMatchObject({ userId: 1, fazendaId: 20 });
  });

  it("não confirma parcial, não repete baixa nem título, e desfaz a transação inteira", async () => {
    const vendasAntes = await numero("SELECT COUNT(*) AS n FROM vendas");
    await expect(confirmar(2, {
      fazendaId: 10, integrado: true, usuarioNome: "Funcionario Curral",
      itens: [{ animalId: 31, precoUnitario: 1000 }, { animalId: 12, precoUnitario: 1000 }],
    })).rejects.toMatchObject({ message: MSG_VENDA_ANIMAL_INDISPONIVEL });
    await expect(confirmar(2, {
      fazendaId: 10, integrado: true, usuarioNome: "Funcionario Curral",
      itens: [{ animalId: 32, precoUnitario: 1000 }, { animalId: 25, precoUnitario: 1000 }],
    })).rejects.toMatchObject({ message: MSG_VENDA_ANIMAL_OUTRA_FAZENDA });
    await expect(confirmar(2, {
      fazendaId: 10, integrado: true, usuarioNome: "Funcionario Curral",
      itens: [{ animalId: 33, precoUnitario: 1000 }, { animalId: 14, precoUnitario: 1000 }],
    })).rejects.toMatchObject({ message: MSG_VENDA_ANIMAL_INDISPONIVEL });
    expect(await animal(31)).toMatchObject({ status: "ativo" });
    expect(await animal(12)).toMatchObject({ status: "ativo" });
    expect(await numero("SELECT COUNT(*) AS n FROM animal_baixas WHERE animalId = 12 AND tipo = 'morte' AND status = 'ativa'")).toBe(1);
    expect(await animal(32)).toMatchObject({ status: "ativo", fazendaId: 10 });
    expect(await animal(25)).toMatchObject({ status: "ativo", fazendaId: 20 });
    expect(await animal(14)).toMatchObject({ status: "ativo", userId: 4 });
    expect(await numero("SELECT COUNT(*) AS n FROM vendas")).toBe(vendasAntes);

    const ordem: number[] = [];
    const primeira = await confirmar(2, {
      fazendaId: 10, integrado: true, usuarioNome: "Funcionario Curral",
      idempotencyKey: "ven-h4ad-idem-16", ordem,
      itens: [{ animalId: 16, precoUnitario: 1100 }],
    });
    const repetida = await confirmar(1, {
      fazendaId: 10, integrado: true, usuarioNome: "Administrador da conta",
      idempotencyKey: "ven-h4ad-idem-16", itens: [{ animalId: 16, precoUnitario: 1100 }],
    });
    expect(ordem).toEqual([16]);
    expect(repetida).toMatchObject({ vendaId: primeira.vendaId, tituloId: primeira.tituloId, idempotente: true });
    expect(await numero("SELECT COUNT(*) AS n FROM animal_baixas WHERE animalId = 16")).toBe(1);
    expect(await numero("SELECT COUNT(*) AS n FROM financeiro_titulos WHERE venda_id = ?", [primeira.vendaId])).toBe(1);
    expect(await numero("SELECT COUNT(*) AS n FROM financeiro_movimentos")).toBe(0);
    expect(await numero("SELECT COUNT(*) AS n FROM animal_lote_movimentacoes")).toBe(1);
    await expect(confirmar(1, {
      fazendaId: 10, integrado: true, usuarioNome: "Administrador da conta",
      idempotencyKey: "ven-h4ad-idem-16", itens: [{ animalId: 23, precoUnitario: 1100 }],
    })).rejects.toMatchObject({ message: MSG_VENDA_CONFLITO_IDEMPOTENCIA });
    expect(await animal(23)).toMatchObject({ status: "ativo" });

    const antesBaixa = await numero("SELECT COUNT(*) AS n FROM vendas");
    await expect(confirmar(1, {
      fazendaId: 10, integrado: true, usuarioNome: "Administrador da conta",
      idempotencyKey: "ven-h4ad-falha-baixa", falha: "baixa",
      itens: [{ animalId: 23, precoUnitario: 700 }],
    })).rejects.toThrow("falha na baixa");
    await expect(confirmar(1, {
      fazendaId: 10, integrado: true, usuarioNome: "Administrador da conta",
      idempotencyKey: "ven-h4ad-falha-fin", falha: "financeiro",
      itens: [{ animalId: 24, precoUnitario: 700 }],
    })).rejects.toThrow("falha no financeiro");
    expect(await numero("SELECT COUNT(*) AS n FROM vendas")).toBe(antesBaixa);
    expect(await animal(23)).toMatchObject({ status: "ativo", loteId: 5, pastoId: 8 });
    expect(await animal(24)).toMatchObject({ status: "ativo", loteId: 5, pastoId: 8 });
    expect(await numero("SELECT COUNT(*) AS n FROM animal_baixas WHERE animalId IN (23, 24)")).toBe(0);
    expect(await numero(
      "SELECT COUNT(*) AS n FROM vendas WHERE idempotency_key IN ('ven-h4ad-falha-baixa', 'ven-h4ad-falha-fin')",
    )).toBe(0);
  });

  it("cancela só a baixa da venda e preserva morte, lote e título liquidado", async () => {
    const historicoAntes = await numero("SELECT COUNT(*) AS n FROM animal_lote_movimentacoes");
    const cancelada = await cancelar(2, 500);
    expect(cancelada).toMatchObject({ success: true, vendaId: 500, quantidade: 1 });
    expect(await animal(40)).toMatchObject({ status: "ativo", loteId: 5, pastoId: 8, fazendaId: 10, userId: 1 });
    expect(await numero("SELECT COUNT(*) AS n FROM animal_baixas WHERE animalId = 40 AND vendaId = 500 AND tipo = 'venda' AND status = 'estornada'")).toBe(1);
    expect(await numero("SELECT COUNT(*) AS n FROM animal_baixas WHERE animalId = 40 AND status = 'ativa'")).toBe(0);
    const [quem] = await pool.query<RowDataPacket[]>(
      "SELECT cancelado_por_user_id AS quem, status FROM vendas WHERE id = 500",
    );
    expect(quem[0]).toMatchObject({ quem: 2, status: "cancelado" });
    await expect(cancelar(1, 500)).rejects.toMatchObject({ message: MSG_JA_CANCELADA });
    expect(await numero("SELECT COUNT(*) AS n FROM animal_baixas WHERE animalId = 40 AND status = 'estornada'")).toBe(1);

    const comTitulo = await cancelar(1, 501);
    expect(comTitulo.tituloCancelado).toBe(true);
    expect(await animal(41)).toMatchObject({ status: "ativo", loteId: 5, pastoId: 8 });
    const [titulo] = await pool.query<RowDataPacket[]>("SELECT estado FROM financeiro_titulos WHERE id = 801");
    expect(String(titulo[0].estado)).toBe("cancelado");
    expect(await numero("SELECT COUNT(*) AS n FROM financeiro_parcelas WHERE titulo_id = 801")).toBe(2);
    expect(await numero("SELECT COUNT(*) AS n FROM financeiro_movimentos")).toBe(0);

    await expect(cancelar(1, 502)).rejects.toMatchObject({ message: MSG_COM_RECEBIMENTO });
    expect(await animal(42)).toMatchObject({ status: "vendido" });
    expect(await numero("SELECT COUNT(*) AS n FROM animal_baixas WHERE animalId = 42 AND status = 'ativa' AND tipo = 'venda'")).toBe(1);
    expect(String((await pool.query<RowDataPacket[]>("SELECT estado FROM financeiro_titulos WHERE id = 802"))[0][0].estado)).toBe("ativo");

    await expect(cancelar(1, 504)).rejects.toMatchObject({ message: MSG_ANIMAL_ALTERADO });
    expect(await animal(44)).toMatchObject({ status: "morto", loteId: 5 });
    expect(await numero("SELECT COUNT(*) AS n FROM animal_baixas WHERE animalId = 44 AND status = 'ativa'")).toBe(1);

    await expect(cancelar(1, 505)).rejects.toMatchObject({ message: "Venda não encontrada." });
    await expect(cancelar(2, 506)).rejects.toMatchObject({ message: MSG_SEM_FAZENDA_MANEJO });
    await expect(cancelar(3, 507)).rejects.toMatchObject({ message: MSG_SEM_PERMISSAO_CANCELAR_VENDA });
    await expect(cancelar(1, 509)).rejects.toMatchObject({ message: "Venda não encontrada." });
    expect(await animal(45)).toMatchObject({ status: "vendido", userId: 4 });
    expect(await animal(46)).toMatchObject({ status: "vendido", fazendaId: 20 });
    expect(await animal(47)).toMatchObject({ status: "vendido" });
    expect(await numero("SELECT COUNT(*) AS n FROM animal_baixas WHERE animalId = 49 AND tipo = 'morte' AND status = 'ativa'")).toBe(1);
    expect(await numero("SELECT COUNT(*) AS n FROM animal_lote_movimentacoes")).toBe(historicoAntes);
  });

  it("segura a concorrência sem duplicar baixa, título ou estorno", async () => {
    const corrida = await Promise.allSettled([
      confirmar(1, {
        fazendaId: 10, integrado: true, usuarioNome: "Administrador da conta",
        idempotencyKey: "ven-h4ad-corrida-a",
        itens: [{ animalId: 19, precoUnitario: 1000 }, { animalId: 18, precoUnitario: 1000 }],
      }),
      confirmar(2, {
        fazendaId: 10, integrado: true, usuarioNome: "Funcionario Curral",
        idempotencyKey: "ven-h4ad-corrida-b",
        itens: [{ animalId: 18, precoUnitario: 1000 }, { animalId: 19, precoUnitario: 1000 }],
      }),
    ]);
    expect(corrida.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(corrida.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect(await numero("SELECT COUNT(*) AS n FROM animal_baixas WHERE animalId IN (18, 19) AND tipo = 'venda' AND status = 'ativa'")).toBe(2);
    expect(await numero("SELECT COUNT(*) AS n FROM financeiro_titulos t JOIN vendas v ON v.id = t.venda_id WHERE v.idempotency_key IN ('ven-h4ad-corrida-a', 'ven-h4ad-corrida-b')")).toBe(1);

    let soltarMorte: () => void = () => undefined;
    let morteSegurou: () => void = () => undefined;
    const esperaMorte = new Promise<void>((resolver) => { soltarMorte = resolver; });
    const confirmaSegurou = new Promise<void>((resolver) => { morteSegurou = resolver; });
    const confirmando = confirmar(2, {
      fazendaId: 10, integrado: true, usuarioNome: "Funcionario Curral",
      idempotencyKey: "ven-h4ad-contra-morte",
      itens: [{ animalId: 20, precoUnitario: 1000 }],
      depoisDasTravas: async () => {
        morteSegurou();
        await esperaMorte;
      },
    });
    await confirmaSegurou;
    const morte = (async () => {
      const conn = await pool.getConnection();
      try {
        await conn.query("SET SESSION innodb_lock_wait_timeout = 8");
        await conn.beginTransaction();
        const [linhas] = await conn.query<RowDataPacket[]>("SELECT status FROM animais WHERE id = 20 FOR UPDATE");
        if (String(linhas[0]?.status) !== "ativo") {
          await conn.rollback();
          return "recusado";
        }
        await conn.query(
          "INSERT INTO animal_baixas (userId, animalId, fazendaId, tipo, dataBaixa, status) VALUES (1, 20, 10, 'morte', '2026-11-10', 'ativa')",
        );
        await conn.commit();
        return "morto";
      } finally {
        conn.release();
      }
    })();
    await new Promise((resolver) => setTimeout(resolver, 150));
    soltarMorte();
    const [vendaMorte, resultadoMorte] = await Promise.all([confirmando, morte]);
    expect(vendaMorte.idempotente).toBe(false);
    expect(resultadoMorte).toBe("recusado");
    expect(await animal(20)).toMatchObject({ status: "vendido", fazendaId: 10 });
    expect(await numero("SELECT COUNT(*) AS n FROM animal_baixas WHERE animalId = 20 AND tipo = 'morte'")).toBe(0);
    expect(await numero("SELECT COUNT(*) AS n FROM animal_baixas WHERE animalId = 20 AND tipo = 'venda' AND status = 'ativa'")).toBe(1);

    let soltarTransferencia: () => void = () => undefined;
    let transferenciaSegurou: () => void = () => undefined;
    const esperaTransferencia = new Promise<void>((resolver) => { soltarTransferencia = resolver; });
    const confirmaTransferenciaSegurou = new Promise<void>((resolver) => { transferenciaSegurou = resolver; });
    const confirmandoTransferencia = confirmar(1, {
      fazendaId: 10, integrado: true, usuarioNome: "Administrador da conta",
      idempotencyKey: "ven-h4ad-contra-transf",
      itens: [{ animalId: 21, precoUnitario: 1000 }],
      depoisDasTravas: async () => {
        transferenciaSegurou();
        await esperaTransferencia;
      },
    });
    await confirmaTransferenciaSegurou;
    const transferencia = (async () => {
      const conn = await pool.getConnection();
      try {
        await conn.query("SET SESSION innodb_lock_wait_timeout = 8");
        await conn.beginTransaction();
        const [linhas] = await conn.query<RowDataPacket[]>("SELECT status, fazendaId FROM animais WHERE id = 21 FOR UPDATE");
        if (String(linhas[0]?.status) !== "ativo") {
          await conn.rollback();
          return "recusado";
        }
        await conn.query("UPDATE animais SET fazendaId = 20, loteId = 9 WHERE id = 21");
        await conn.commit();
        return "transferido";
      } finally {
        conn.release();
      }
    })();
    await new Promise((resolver) => setTimeout(resolver, 150));
    soltarTransferencia();
    const resultadoTransferencia = (await Promise.all([confirmandoTransferencia, transferencia]))[1];
    expect(resultadoTransferencia).toBe("recusado");
    expect(await animal(21)).toMatchObject({ status: "vendido", fazendaId: 10, loteId: 5, pastoId: 8 });

    let soltarCancelamento: () => void = () => undefined;
    let cancelamentoSegurou: () => void = () => undefined;
    const esperaCancelamento = new Promise<void>((resolver) => { soltarCancelamento = resolver; });
    const primeiroSegurou = new Promise<void>((resolver) => { cancelamentoSegurou = resolver; });
    const primeiroCancelamento = cancelar(1, 507, async () => {
      cancelamentoSegurou();
      await esperaCancelamento;
    });
    await primeiroSegurou;
    const segundoCancelamento = cancelar(2, 507);
    await new Promise((resolver) => setTimeout(resolver, 150));
    soltarCancelamento();
    const cancelamentos = await Promise.allSettled([primeiroCancelamento, segundoCancelamento]);
    expect(cancelamentos.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(await animal(47)).toMatchObject({ status: "ativo", loteId: 5, pastoId: 8 });
    expect(await numero("SELECT COUNT(*) AS n FROM animal_baixas WHERE animalId = 47 AND status = 'estornada' AND tipo = 'venda'")).toBe(1);
    expect(await numero("SELECT COUNT(*) AS n FROM vendas WHERE id = 507 AND status = 'cancelado'")).toBe(1);

    let soltarMovimento: () => void = () => undefined;
    let movimentoSegurou: () => void = () => undefined;
    const esperaMovimento = new Promise<void>((resolver) => { soltarMovimento = resolver; });
    const cancelamentoMovimentoSegurou = new Promise<void>((resolver) => { movimentoSegurou = resolver; });
    const cancelando = cancelar(2, 508, async () => {
      movimentoSegurou();
      await esperaMovimento;
    });
    await cancelamentoMovimentoSegurou;
    const movimento = (async () => {
      const conn = await pool.getConnection();
      try {
        await conn.query("SET SESSION innodb_lock_wait_timeout = 8");
        await conn.beginTransaction();
        await conn.query("SELECT id FROM animais WHERE id = 48 FOR UPDATE");
        await conn.query(
          "INSERT INTO animal_lote_movimentacoes (userId, animalId, loteDestinoId) VALUES (1, 48, 9)",
        );
        await conn.query("UPDATE animais SET loteId = 9 WHERE id = 48");
        await conn.commit();
      } finally {
        conn.release();
      }
    })();
    await new Promise((resolver) => setTimeout(resolver, 150));
    soltarMovimento();
    await Promise.all([cancelando, movimento]);
    expect(await animal(48)).toMatchObject({ status: "ativo", loteId: 9, pastoId: 8, fazendaId: 10 });
    expect(await numero("SELECT COUNT(*) AS n FROM animal_lote_movimentacoes WHERE animalId = 48")).toBe(1);
    expect(await numero("SELECT COUNT(*) AS n FROM animal_baixas WHERE animalId = 48 AND tipo = 'venda' AND status = 'estornada'")).toBe(1);
  });
});
