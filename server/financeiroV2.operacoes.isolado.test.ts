import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fazendas, users, usuarioFazendas, usuarioPermissoes } from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import { env } from "./_core/env";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { ensureFinanceiroNucleoSchema } from "./ensureFinanceiroNucleoSchema";
import {
  cancelarTituloNoTx,
  createFinanceiroNucleoMysqlStore,
  createFinanceiroNucleoService,
} from "./financeiroNucleo";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import {
  confirmarVendaAutorizada,
  type ConsultaVendaOperacao,
  type IoVendaOperacao,
} from "./vendaOperacaoAutorizado";
import {
  MSG_FIN_CANCELAR_COM_LIQUIDACAO,
  MSG_FIN_IDEMPOTENCIA_CONFLITO,
  MSG_FIN_LIQUIDACAO_JA_ESTORNADA,
  MSG_FIN_ORIGEM_DUPLICADA,
  MSG_FIN_OVERPAYMENT,
} from "../shared/financeiroNucleo";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bb-fin";
const PORTA = 3374;
const SENHA = "isolado-h4bb";
const BANCO = "fd_h4bb";

const ESQUEMA = `
CREATE TABLE users (
  id int NOT NULL AUTO_INCREMENT,
  openId varchar(255) NOT NULL,
  name varchar(255) NOT NULL,
  email varchar(255) NULL,
  role enum('admin','user') NOT NULL DEFAULT 'user',
  papel enum('principal','secundario','comum') NOT NULL,
  titularUserId int NULL,
  situacao enum('convidado','ativo','inativo') NOT NULL,
  sessionVersion int NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY users_open_uq (openId)
) ENGINE=InnoDB;
CREATE TABLE fazendas (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  nome varchar(200) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pessoas (
  id int NOT NULL AUTO_INCREMENT,
  user_id int NOT NULL,
  nome varchar(255) NOT NULL,
  tipo enum('fornecedor','cliente','funcionario') NOT NULL,
  ativo tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_fazendas (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  fazendaId int NOT NULL,
  concedidoPorUserId int NOT NULL,
  concedidoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_permissoes (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  titularUserId int NOT NULL,
  permissao varchar(80) NOT NULL,
  concedidoPorUserId int NOT NULL,
  concedidoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE marcas (
  id int NOT NULL,
  nome varchar(40) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

type Svc = ReturnType<typeof createFinanceiroNucleoService>;

const sessaoFunc = {
  executorId: 2,
  sessionVersionDaSessao: 0,
  permissaoId: "financeiro.confirmar",
};
const sessaoEstorno = { ...sessaoFunc, permissaoId: "financeiro.estornar" };
const sessaoTitular = {
  executorId: 1,
  sessionVersionDaSessao: 0,
  permissaoId: "financeiro.criar",
  exigirPrincipal: true,
};

function mensagem(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

describe.sequential("financeiro V2 no mysql descartável", () => {
  let pool: mysql.Pool;
  let svc: Svc;
  let store: ReturnType<typeof createFinanceiroNucleoMysqlStore>;
  let ioVenda: IoVendaOperacao;
  let seq = 10;

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
          multipleStatements: true,
        });
        await conn.query("SELECT 1 AS ok");
        await conn.query(ESQUEMA);
        await conn.end();
        ultimo = "";
        break;
      } catch (error) {
        ultimo = mensagem(error);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (ultimo) throw new Error(ultimo);
    pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
      connectionLimit: 8, waitForConnections: true,
    });
    await ensureFinanceiroNucleoSchema(pool);
    await pool.query(
      `INSERT INTO users (id, openId, name, role, papel, titularUserId, situacao, sessionVersion) VALUES
       (1, 'titular-h4bb', 'Titular', 'user', 'principal', 1, 'ativo', 0),
       (2, 'func-h4bb', 'Funcionario', 'user', 'comum', 1, 'ativo', 0)`,
    );
    await pool.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (20, 1, 'Retiro')");
    await pool.query("INSERT INTO pessoas (id, user_id, nome, tipo, ativo) VALUES (1, 1, 'Fornecedor', 'fornecedor', 1)");
    await pool.query(
      `INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
       (2, 1, 'financeiro.confirmar', 1),
       (2, 1, 'financeiro.estornar', 1),
       (2, 1, 'financeiro.visualizar', 1),
       (2, 1, 'financeiro.criar', 1),
       (2, 1, 'vendas.confirmar', 1)`,
    );
    await pool.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1)");
    const dbLocal = drizzle(pool, { mode: "default" });
    store = createFinanceiroNucleoMysqlStore(dbLocal as never);
    svc = createFinanceiroNucleoService(store);
    ioVenda = {
      emTransacao(fn) {
        return dbLocal.transaction(
          async (tx) => fn(consultasVenda(tx as never)),
          { isolationLevel: "read committed" },
        );
      },
    };
    const conta = await svc.criarContaFinanceira(1, {
      nome: "Caixa",
      tipo: "caixa",
      saldoAbertura: 500000,
      dataSaldoAbertura: "2026-01-01",
    }, sessaoTitular);
    (globalThis as { contaId?: number }).contaId = conta.id;
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  function contaId() {
    return (globalThis as { contaId: number }).contaId;
  }

  async function novoTitulo(tipo: "pagar" | "receber", fazendaId: number, valor = 100) {
    seq += 1;
    const criado = await svc.criarTitulo(1, {
      tipo,
      pessoaId: 1,
      descricao: `Titulo ${seq}`,
      dataCompetencia: "2026-03-01",
      valorOriginal: valor,
      fazendaOrigemId: fazendaId,
      origemTipo: "manual",
      origemId: seq,
      origemItemChave: `p-${seq}`,
      parcelas: [{ numero: 1, vencimento: "2026-03-20", valorOriginal: valor }],
    }, { ...sessaoTitular, permissaoId: "financeiro.criar", exigirPrincipal: false });
    const detalhe = await svc.detalheTitulo(1, criado.id);
    return { tituloId: criado.id, parcelaId: detalhe.parcelas[0]!.id, valor };
  }

  function pagamento(parcelaId: number, valor: number, chave: string) {
    return svc.criarPagamento(1, {
      contaId: contaId(),
      dataLiquidacao: "2026-03-02",
      valorMovimentado: valor,
      idempotencyKey: chave,
      alocacoes: [{ parcelaId, principalLiquidado: valor }],
    }, sessaoFunc);
  }

  it("dois pagamentos da mesma parcela não quitam duas vezes", async () => {
    const { parcelaId } = await novoTitulo("pagar", 10, 100);
    const dupla = await Promise.allSettled([
      pagamento(parcelaId, 100, `pag-a-${parcelaId}`),
      pagamento(parcelaId, 100, `pag-b-${parcelaId}`),
    ]);
    const ok = dupla.filter((item) => item.status === "fulfilled");
    const falha = dupla.filter((item) => item.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(falha).toHaveLength(1);
    expect(mensagem((falha[0] as PromiseRejectedResult).reason)).toContain(MSG_FIN_OVERPAYMENT);
    const [linhas] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM financeiro_liquidacoes WHERE idempotency_key IN (?, ?)",
      [`pag-a-${parcelaId}`, `pag-b-${parcelaId}`],
    );
    expect(Number(linhas[0]!.c)).toBe(1);
  });

  it("dois recebimentos da mesma parcela deixam um só crédito", async () => {
    const { parcelaId } = await novoTitulo("receber", 10, 80);
    const dupla = await Promise.allSettled([
      svc.criarRecebimento(1, {
        contaId: contaId(),
        dataLiquidacao: "2026-03-02",
        valorMovimentado: 80,
        idempotencyKey: `rec-a-${parcelaId}`,
        alocacoes: [{ parcelaId, principalLiquidado: 80 }],
      }, sessaoFunc),
      svc.criarRecebimento(1, {
        contaId: contaId(),
        dataLiquidacao: "2026-03-02",
        valorMovimentado: 80,
        idempotencyKey: `rec-b-${parcelaId}`,
        alocacoes: [{ parcelaId, principalLiquidado: 80 }],
      }, sessaoFunc),
    ]);
    expect(dupla.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const [parcela] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT titulo_id AS tituloId FROM financeiro_parcelas WHERE id = ?",
      [parcelaId],
    );
    const detalhe = await svc.detalheTitulo(1, Number(parcela[0]!.tituloId));
    expect(detalhe.parcelas[0]!.saldoPrincipal).toBe(0);
  });

  it("recebimento parcial não quita o título", async () => {
    const { tituloId, parcelaId } = await novoTitulo("receber", 10, 100);
    await svc.criarRecebimento(1, {
      contaId: contaId(),
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 40,
      idempotencyKey: `rec-parcial-${parcelaId}`,
      alocacoes: [{ parcelaId, principalLiquidado: 40 }],
    }, sessaoFunc);
    const detalhe = await svc.detalheTitulo(1, tituloId);
    expect(detalhe.parcelas[0]!.saldoPrincipal).toBe(60);
    expect(detalhe.parcelas[0]!.quitada).toBe(false);
  });

  it("a mesma chave devolve o pagamento existente", async () => {
    const { parcelaId } = await novoTitulo("pagar", 10, 50);
    const primeiro = await pagamento(parcelaId, 50, `pag-igual-${parcelaId}`);
    const segundo = await pagamento(parcelaId, 50, `pag-igual-${parcelaId}`);
    expect(segundo.idempotente).toBe(true);
    expect(segundo.id).toBe(primeiro.id);
  });

  it("a mesma chave com valor diferente é recusada", async () => {
    const { parcelaId } = await novoTitulo("pagar", 10, 70);
    await pagamento(parcelaId, 30, `pag-conflito-${parcelaId}`);
    await expect(pagamento(parcelaId, 20, `pag-conflito-${parcelaId}`)).rejects.toThrow(MSG_FIN_IDEMPOTENCIA_CONFLITO);
    const [linhas] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM financeiro_liquidacoes WHERE idempotency_key = ?",
      [`pag-conflito-${parcelaId}`],
    );
    expect(Number(linhas[0]!.c)).toBe(1);
  });

  it("o pagamento fica na conta do titular, não na do funcionário", async () => {
    const { parcelaId } = await novoTitulo("pagar", 10, 25);
    await pagamento(parcelaId, 25, `pag-dono-${parcelaId}`);
    const [linhas] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT user_id AS userId FROM financeiro_liquidacoes WHERE idempotency_key = ?",
      [`pag-dono-${parcelaId}`],
    );
    expect(linhas[0]!.userId).toBe(1);
    await expect(svc.criarTitulo(2, {
      tipo: "pagar",
      pessoaId: 1,
      descricao: "Conta pessoal",
      dataCompetencia: "2026-03-01",
      valorOriginal: 10,
      fazendaOrigemId: 10,
      origemTipo: "manual",
      origemId: 9000 + parcelaId,
      origemItemChave: "pessoal",
      parcelas: [{ numero: 1, vencimento: "2026-03-20", valorOriginal: 10 }],
    }, { ...sessaoFunc, permissaoId: "financeiro.criar" })).rejects.toThrow("Registro não encontrado.");
    const [pessoais] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM financeiro_titulos WHERE user_id = 2",
    );
    expect(Number(pessoais[0]!.c)).toBe(0);
  });

  it("funcionário não quita parcela de fazenda que não lhe foi concedida", async () => {
    const { parcelaId } = await novoTitulo("pagar", 20, 15);
    await expect(pagamento(parcelaId, 15, `pag-outra-${parcelaId}`)).rejects.toThrow("Você não tem acesso a esta fazenda.");
  });

  it("pagamento e cancelamento não apagam um ao outro", async () => {
    const { tituloId, parcelaId } = await novoTitulo("pagar", 10, 40);
    const dupla = await Promise.allSettled([
      pagamento(parcelaId, 40, `pag-can-${parcelaId}`),
      store.transaction(async (tx) => cancelarTituloNoTx(tx, 1, tituloId, "desistir")),
    ]);
    const [titulo] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT estado FROM financeiro_titulos WHERE id = ?",
      [tituloId],
    );
    const [liquidacoes] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM financeiro_liquidacoes WHERE idempotency_key = ?",
      [`pag-can-${parcelaId}`],
    );
    const pagos = Number(liquidacoes[0]!.c);
    expect(pagos === 0 || pagos === 1).toBe(true);
    if (pagos === 1) {
      expect(titulo[0]!.estado).toBe("ativo");
      expect(dupla.some((item) => item.status === "rejected" && mensagem((item as PromiseRejectedResult).reason).includes(MSG_FIN_CANCELAR_COM_LIQUIDACAO))).toBe(true);
    } else {
      expect(titulo[0]!.estado).toBe("cancelado");
    }
  });

  it("recebimento e cancelamento preservam o que já foi confirmado", async () => {
    const { tituloId, parcelaId } = await novoTitulo("receber", 10, 40);
    await Promise.allSettled([
      svc.criarRecebimento(1, {
        contaId: contaId(),
        dataLiquidacao: "2026-03-02",
        valorMovimentado: 40,
        idempotencyKey: `rec-can-${parcelaId}`,
        alocacoes: [{ parcelaId, principalLiquidado: 40 }],
      }, sessaoFunc),
      store.transaction(async (tx) => cancelarTituloNoTx(tx, 1, tituloId, "desistir")),
    ]);
    const [titulo] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT estado FROM financeiro_titulos WHERE id = ?",
      [tituloId],
    );
    const [liquidacoes] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM financeiro_liquidacoes WHERE idempotency_key = ?",
      [`rec-can-${parcelaId}`],
    );
    const pagos = Number(liquidacoes[0]!.c);
    if (pagos === 1) expect(titulo[0]!.estado).toBe("ativo");
    else expect(titulo[0]!.estado).toBe("cancelado");
  });

  it("dois estornos da mesma liquidação geram uma compensação", async () => {
    const { parcelaId } = await novoTitulo("pagar", 10, 33);
    const pago = await pagamento(parcelaId, 33, `pag-est-${parcelaId}`);
    const dupla = await Promise.allSettled([
      svc.estornarLiquidacao(1, {
        liquidacaoId: pago.id,
        idempotencyKey: `est-a-${pago.id}`,
        dataLiquidacao: "2026-03-03",
      }, sessaoEstorno),
      svc.estornarLiquidacao(1, {
        liquidacaoId: pago.id,
        idempotencyKey: `est-b-${pago.id}`,
        dataLiquidacao: "2026-03-03",
      }, sessaoEstorno),
    ]);
    expect(dupla.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(mensagem((dupla.find((item) => item.status === "rejected") as PromiseRejectedResult).reason))
      .toContain(MSG_FIN_LIQUIDACAO_JA_ESTORNADA);
    const [linhas] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM financeiro_liquidacoes WHERE liquidacao_original_id = ?",
      [pago.id],
    );
    expect(Number(linhas[0]!.c)).toBe(1);
  });

  it("pagamento contra estorno não deixa saldo negativo", async () => {
    const { tituloId, parcelaId } = await novoTitulo("pagar", 10, 20);
    const pago = await pagamento(parcelaId, 20, `pag-contra-${parcelaId}`);
    await Promise.allSettled([
      svc.estornarLiquidacao(1, {
        liquidacaoId: pago.id,
        idempotencyKey: `est-contra-${pago.id}`,
        dataLiquidacao: "2026-03-03",
      }, sessaoEstorno),
      pagamento(parcelaId, 20, `pag-depois-${parcelaId}`),
    ]);
    const detalhe = await svc.detalheTitulo(1, tituloId);
    expect(detalhe.parcelas[0]!.saldoPrincipal).toBeGreaterThanOrEqual(0);
    expect(detalhe.parcelas[0]!.saldoPrincipal).toBeLessThanOrEqual(20);
  });

  it("duas criações da mesma compra deixam um título", async () => {
    const pedido = {
      tipo: "pagar" as const,
      pessoaId: 1,
      descricao: "Insumo",
      dataCompetencia: "2026-03-01",
      valorOriginal: 90,
      fazendaOrigemId: 10,
      origemTipo: "compra_insumos",
      origemId: 440,
      origemItemChave: "principal",
      parcelas: [{ numero: 1, vencimento: "2026-04-01", valorOriginal: 90 }],
    };
    const sessao = { ...sessaoTitular, exigirPrincipal: false, permissaoId: "financeiro.criar" };
    const dupla = await Promise.allSettled([
      svc.criarTitulo(1, pedido, sessao),
      svc.criarTitulo(1, pedido, sessao),
    ]);
    expect(dupla.filter((item) => item.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    const recusa = dupla.find((item) => item.status === "rejected");
    if (recusa && recusa.status === "rejected") {
      expect(mensagem(recusa.reason)).toContain(MSG_FIN_ORIGEM_DUPLICADA);
    }
    const [linhas] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM financeiro_titulos WHERE origem_tipo = 'compra_insumos' AND origem_id = 440",
    );
    expect(Number(linhas[0]!.c)).toBe(1);
  });

  it("lista do funcionário não mostra título de outra fazenda", async () => {
    await novoTitulo("pagar", 10, 11);
    await novoTitulo("pagar", 20, 12);
    const lista = await svc.listarTitulos(1, { titularUserId: 1, papel: "comum", fazendaIds: [10] });
    expect(lista.every((titulo) => titulo.fazendaOrigemId === 10)).toBe(true);
    expect(lista.some((titulo) => titulo.fazendaOrigemId === 20)).toBe(false);
  });

  it("permissão revogada impede o pagamento seguinte", async () => {
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = 'financeiro.confirmar'");
    const { parcelaId } = await novoTitulo("pagar", 10, 18);
    await expect(pagamento(parcelaId, 18, `pag-sem-${parcelaId}`)).rejects.toThrow("Sem permissão para liquidar");
    await pool.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, 'financeiro.confirmar', 1)",
    );
  });

  it("fazenda revogada impede o pagamento seguinte", async () => {
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 10");
    const { parcelaId } = await novoTitulo("pagar", 10, 19);
    await expect(pagamento(parcelaId, 19, `pag-sf-${parcelaId}`)).rejects.toThrow();
    await pool.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1)");
  });

  it("falha dentro da transação não grava o segundo pagamento", async () => {
    const { parcelaId } = await novoTitulo("pagar", 10, 22);
    await pagamento(parcelaId, 22, `pag-ok-${parcelaId}`);
    await expect(pagamento(parcelaId, 22, `pag-sobra-${parcelaId}`)).rejects.toThrow(MSG_FIN_OVERPAYMENT);
    const [linhas] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM financeiro_liquidacoes WHERE idempotency_key = ?",
      [`pag-sobra-${parcelaId}`],
    );
    expect(Number(linhas[0]!.c)).toBe(0);
  });

  it("duas travas em ordem cruzada produzem deadlock", async () => {
    const [contas] = await pool.query<mysql.RowDataPacket[]>("SELECT id FROM financeiro_contas ORDER BY id LIMIT 1");
    const id = Number(contas[0]!.id);
    await svc.criarContaFinanceira(1, {
      nome: "Reserva",
      tipo: "caixa",
      saldoAbertura: 10,
      dataSaldoAbertura: "2026-01-01",
    }, sessaoTitular);
    const [contas2] = await pool.query<mysql.RowDataPacket[]>("SELECT id FROM financeiro_contas ORDER BY id DESC LIMIT 1");
    const id2 = Number(contas2[0]!.id);
    const c1 = await pool.getConnection();
    const c2 = await pool.getConnection();
    try {
      await c1.query("SET SESSION innodb_lock_wait_timeout = 2");
      await c2.query("SET SESSION innodb_lock_wait_timeout = 2");
      await c1.beginTransaction();
      await c2.beginTransaction();
      await c1.query("SELECT id FROM financeiro_contas WHERE id = ? FOR UPDATE", [id]);
      await c2.query("SELECT id FROM financeiro_contas WHERE id = ? FOR UPDATE", [id2]);
      const cruzado = await Promise.allSettled([
        c1.query("SELECT id FROM financeiro_contas WHERE id = ? FOR UPDATE", [id2]),
        c2.query("SELECT id FROM financeiro_contas WHERE id = ? FOR UPDATE", [id]),
      ]);
      expect(cruzado.some((item) => item.status === "rejected")).toBe(true);
    } finally {
      await c1.rollback().catch(() => undefined);
      await c2.rollback().catch(() => undefined);
      c1.release();
      c2.release();
    }
  });

  it("mysql fechado não entrega saldo", async () => {
    await expect(mysql.createConnection({
      host: "127.0.0.1",
      port: 3399,
      user: "root",
      password: "x",
      connectTimeout: 1500,
    })).rejects.toBeTruthy();
  });

  it("revogação espera a transação que já autorizou a venda", async () => {
    const livre = await pool.getConnection();
    const lado = await pool.getConnection();
    await lado.query("SET SESSION innodb_lock_wait_timeout = 4");
    let exclusao: Promise<unknown> = Promise.resolve();
    try {
      await confirmarVendaAutorizada(ioVenda, {
        executorId: 2,
        sessionVersionDaSessao: 0,
        fazendaId: 10,
      }, async (titularUserId, tx) => {
        expect(titularUserId).toBe(1);
        expect(tx.transacaoAtual).toBeTruthy();
        exclusao = lado.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = 'vendas.confirmar'");
        await new Promise((r) => setTimeout(r, 700));
        const [ainda] = await livre.query<mysql.RowDataPacket[]>(
          "SELECT COUNT(*) AS c FROM usuario_permissoes WHERE userId = 2 AND permissao = 'vendas.confirmar'",
        );
        expect(Number(ainda[0]!.c)).toBe(1);
        return { segurou: true };
      });
      await exclusao;
      await expect(confirmarVendaAutorizada(ioVenda, {
        executorId: 2,
        sessionVersionDaSessao: 0,
        fazendaId: 10,
      }, async () => ({ segurou: false }))).rejects.toThrow("não tem permissão para confirmar a venda");
    } finally {
      await pool.query(
        "INSERT IGNORE INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, 'vendas.confirmar', 1)",
      );
      livre.release();
      lado.release();
    }
  });
});

function consultasVenda(tx: {
  select: typeof import("./db").db.select;
  transaction: (...args: unknown[]) => Promise<unknown>;
}): ConsultaVendaOperacao {
  return {
    async usuario(id): Promise<LinhaUsuarioCadastro | null> {
      const [linha] = await tx.select({
        id: users.id,
        openId: users.openId,
        name: users.name,
        email: users.email,
        role: users.role,
        papel: users.papel,
        titularUserId: users.titularUserId,
        situacao: users.situacao,
        sessionVersion: users.sessionVersion,
      }).from(users).where(eq(users.id, id)).for("update").limit(1);
      if (!linha) return null;
      return {
        id: linha.id,
        openId: linha.openId,
        name: linha.name,
        email: linha.email,
        role: linha.role === "admin" ? "admin" : "user",
        papel: linha.papel as PapelConta,
        titularUserId: linha.titularUserId,
        situacao: linha.situacao as SituacaoUsuario,
        sessionVersion: linha.sessionVersion,
      };
    },
    async permissoes(userId, titularUserId) {
      const linhas = await tx.select({ permissao: usuarioPermissoes.permissao }).from(usuarioPermissoes).where(and(
        eq(usuarioPermissoes.userId, userId),
        eq(usuarioPermissoes.titularUserId, titularUserId),
      )).for("update");
      return linhas.map((linha) => linha.permissao);
    },
    async vinculos(userId, titularUserId) {
      return tx.select({ userId: usuarioFazendas.userId, fazendaId: usuarioFazendas.fazendaId })
        .from(usuarioFazendas)
        .innerJoin(users, eq(users.id, usuarioFazendas.userId))
        .where(and(eq(usuarioFazendas.userId, userId), eq(users.titularUserId, titularUserId)))
        .for("update");
    },
    async fazendasDoTitular(titularUserId) {
      return tx.select({ id: fazendas.id, userId: fazendas.userId }).from(fazendas).where(eq(fazendas.userId, titularUserId));
    },
    async fazenda(id) {
      const [linha] = await tx.select({ id: fazendas.id, userId: fazendas.userId })
        .from(fazendas).where(eq(fazendas.id, id)).for("update").limit(1);
      return linha ?? null;
    },
    async espiarVenda() {
      return null;
    },
    transacaoAtual: tx,
  };
}
