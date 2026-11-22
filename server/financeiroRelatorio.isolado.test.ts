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
import { acessoDaSessaoFinanceiro, type AcessoFinanceiro } from "./consultaFinanceiroAutorizada";
import { ensureFinanceiroNucleoSchema } from "./ensureFinanceiroNucleoSchema";
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "./financeiroNucleo";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import type { RelatorioFinanceiroV2 } from "../shared/financeiroRelatoriosV2";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bc-rel";
const PORTA = 3376;
const SENHA = "isolado-h4bc";
const BANCO = "fd_h4bc";
const PERIODO = { de: "2026-01-01", ate: "2099-12-31" };

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
`;

type Svc = ReturnType<typeof createFinanceiroNucleoService>;
type DbLocal = ReturnType<typeof drizzle>;

function mensagem(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

function numerosDoRelatorio(rel: RelatorioFinanceiroV2): number[] {
  const lista: Array<number | null | undefined> = [
    rel.visao.saldoCaixaBancos,
    rel.visao.totalAReceber,
    rel.visao.totalAPagar,
    rel.visao.recebimentosPeriodo,
    rel.visao.pagamentosPeriodo,
    rel.visao.resultadoRealizado,
    rel.fluxoPrevisto.saldoProjetado,
    rel.fluxoPrevisto.recebimentos,
    rel.fluxoPrevisto.pagamentos,
    rel.fluxoPrevisto.resultado,
    rel.fluxoRealizado.entradas,
    rel.fluxoRealizado.saidas,
    rel.fluxoRealizado.resultado,
    rel.receber.totalPendente,
    rel.receber.totalVencido,
    rel.receber.aVencer,
    rel.receber.semVencimento,
    rel.receber.recebidoPeriodo,
    rel.pagar.totalPendente,
    rel.pagar.totalVencido,
    rel.pagar.aVencer,
    rel.pagar.semVencimento,
    rel.pagar.pagoPeriodo,
    ...rel.pagar.linhas.flatMap((l) => [l.valorOriginal, l.valorLiquidado, l.saldoPendente]),
    ...rel.receber.linhas.flatMap((l) => [l.valorOriginal, l.valorLiquidado, l.saldoPendente]),
    ...rel.fluxoRealizado.linhas.map((l) => l.valor),
    ...rel.fluxoPrevisto.linhas.map((l) => l.saldo),
  ];
  return lista.filter((v) => v != null).map((v) => Number(v));
}

function naoRevela(rel: RelatorioFinanceiroV2, proibidos: number[]) {
  const vazou = numerosDoRelatorio(rel).filter((v) => proibidos.includes(v));
  expect(vazou).toEqual([]);
}

describe.sequential("relatório financeiro no mysql descartável", () => {
  let pool: mysql.Pool;
  let dbLocal: DbLocal;
  let svc: Svc;
  let contaId = 0;
  let mixAberto = 0;
  let mixPago = 0;

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
      connectionLimit: 4, waitForConnections: true,
    });
    await ensureFinanceiroNucleoSchema(pool);
    await pool.query(
      `INSERT INTO users (id, openId, name, role, papel, titularUserId, situacao, sessionVersion) VALUES
       (1, 'titular-h4bc', 'Titular', 'user', 'principal', 1, 'ativo', 0),
       (2, 'ambas-h4bc', 'Ambas', 'user', 'comum', 1, 'ativo', 0),
       (3, 'outra-h4bc', 'Outra', 'user', 'principal', 3, 'ativo', 0),
       (4, 'so10-h4bc', 'So10', 'user', 'comum', 1, 'ativo', 0),
       (5, 'so20-h4bc', 'So20', 'user', 'comum', 1, 'ativo', 0),
       (6, 'semver-h4bc', 'Semver', 'user', 'comum', 1, 'ativo', 0)`,
    );
    await pool.query(
      "INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (20, 1, 'Retiro'), (30, 3, 'Alheia')",
    );
    await pool.query(
      `INSERT INTO pessoas (id, user_id, nome, tipo, ativo) VALUES
       (1, 1, 'Fornecedor', 'fornecedor', 1),
       (2, 3, 'Cliente alheio', 'cliente', 1)`,
    );
    await pool.query(
      `INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
       (2, 1, 'financeiro.visualizar', 1),
       (4, 1, 'financeiro.visualizar', 1),
       (5, 1, 'financeiro.visualizar', 1)`,
    );
    await pool.query(
      `INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
       (2, 10, 1), (2, 20, 1), (4, 10, 1), (5, 20, 1), (6, 10, 1)`,
    );
    dbLocal = drizzle(pool, { mode: "default" });
    svc = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(dbLocal as never));
    const conta = await svc.criarContaFinanceira(1, {
      nome: "Caixa", tipo: "caixa", saldoAbertura: 100000, dataSaldoAbertura: "2026-01-01",
    });
    contaId = conta.id;
    mixAberto = await titulo(1, "pagar", 10000, 10);
    await svc.apropriar(1, mixAberto, [
      { valor: 6000, fazendaId: 10 },
      { valor: 4000, fazendaId: 20 },
    ]);
    mixPago = await titulo(1, "pagar", 10000, 10);
    await svc.apropriar(1, mixPago, [
      { valor: 6000, fazendaId: 10 },
      { valor: 4000, fazendaId: 20 },
    ]);
    const pago = await svc.detalheTitulo(1, mixPago);
    await svc.criarPagamento(1, {
      contaId, dataLiquidacao: "2026-06-02", valorMovimentado: 10000, idempotencyKey: "pag-mix",
      alocacoes: [{ parcelaId: pago.parcelas[0]!.id, principalLiquidado: 10000 }],
    });
    const so10 = await titulo(1, "pagar", 250, 10);
    const det10 = await svc.detalheTitulo(1, so10);
    await svc.criarPagamento(1, {
      contaId, dataLiquidacao: "2026-06-02", valorMovimentado: 50, idempotencyKey: "pag-10",
      alocacoes: [{ parcelaId: det10.parcelas[0]!.id, principalLiquidado: 50 }],
    });
    const so20 = await titulo(1, "receber", 300, 20);
    const det20 = await svc.detalheTitulo(1, so20);
    const receb = await svc.criarRecebimento(1, {
      contaId, dataLiquidacao: "2026-06-02", valorMovimentado: 300, idempotencyKey: "rec-20",
      alocacoes: [{ parcelaId: det20.parcelas[0]!.id, principalLiquidado: 300 }],
    });
    await svc.estornarLiquidacao(1, {
      liquidacaoId: receb.id, idempotencyKey: "est-20", dataLiquidacao: "2026-06-03",
    });
    await titulo(1, "pagar", 15, null);
    const semApr = await titulo(1, "pagar", 40, 10);
    await svc.apropriar(1, semApr, [{ valor: 40, fazendaId: null }]);
    const invalido = await titulo(1, "pagar", 70, 10);
    await pool.query(
      "INSERT INTO financeiro_apropriacoes (user_id, titulo_id, fazenda_id, valor) VALUES (1, ?, 30, 70)",
      [invalido],
    );
    await titulo(3, "pagar", 999, 30, 2);
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function titulo(userId: number, tipo: "pagar" | "receber", valor: number, fazendaId: number | null, pessoaId = 1) {
    const criado = await svc.criarTitulo(userId, {
      tipo, pessoaId, descricao: `${tipo}-${valor}`, dataCompetencia: "2026-06-01",
      valorOriginal: valor, fazendaOrigemId: fazendaId,
      parcelas: [{ numero: 1, vencimento: "2099-01-15", valorOriginal: valor }],
    });
    return criado.id;
  }

  async function acesso(executorId: number, versao = 0): Promise<AcessoFinanceiro> {
    return dbLocal.transaction(async (tx) => acessoDaSessaoFinanceiro(consultas(tx as never), {
      executorId,
      sessionVersionDaSessao: versao,
      permissaoId: "financeiro.visualizar",
    }));
  }

  async function relatorio(executorId: number, fazendaId?: number) {
    const escopo = await acesso(executorId);
    return svc.relatorioFinanceiro(escopo.titularUserId, { ...PERIODO, fazendaId: fazendaId ?? null }, escopo);
  }

  it("o administrador vê o título de 10000, o pagamento, o recebimento e o estorno", async () => {
    const rel = await relatorio(1);
    expect(rel.visao.totalAPagar).toBe(10325);
    expect(rel.visao.totalAReceber).toBe(300);
    expect(rel.visao.pagamentosPeriodo).toBe(10350);
    expect(rel.pagar.pagoPeriodo).toBe(10050);
    expect(rel.visao.recebimentosPeriodo).toBe(300);
    expect(rel.receber.recebidoPeriodo).toBe(300);
    expect(rel.visao.saldoCaixaBancos).toBe(89950);
    expect(rel.fluxoPrevisto.saldoProjetado).toBe(79925);
    expect(rel.pagar.quantidadeTitulos).toBe(6);
    expect(rel.pagar.linhas.some((l) => l.tituloId === mixAberto && l.valorOriginal === 10000 && l.saldoPendente === 10000)).toBe(true);
    expect(rel.pagar.linhas.some((l) => l.tituloId === mixPago && l.valorOriginal === 10000 && l.saldoPendente === 0)).toBe(true);
    expect(rel.pagar.linhas.some((l) => l.valorOriginal === 999)).toBe(false);
  });

  it("o funcionário das duas fazendas vê o documento inteiro e não vê o que está fora delas", async () => {
    const rel = await relatorio(2);
    expect(rel.visao.totalAPagar).toBe(10200);
    expect(rel.visao.totalAReceber).toBe(300);
    expect(rel.visao.pagamentosPeriodo).toBe(10350);
    expect(rel.pagar.pagoPeriodo).toBe(10050);
    expect(rel.visao.recebimentosPeriodo).toBe(300);
    expect(rel.fluxoPrevisto.saldoProjetado).toBe(-9900);
    expect(rel.visao.saldoCaixaBancos).toBe(0);
    expect(rel.pagar.quantidadeTitulos).toBe(3);
    expect(rel.pagar.linhas.some((l) => l.tituloId === mixAberto && l.saldoPendente === 10000)).toBe(true);
    naoRevela(rel, [15, 40, 70, 999, 89950, 10325]);
  });

  it("o funcionário só da fazenda 10 não vê os 10000 nem o pagamento desse título", async () => {
    const rel = await relatorio(4);
    expect(rel.visao.totalAPagar).toBe(200);
    expect(rel.visao.totalAReceber).toBe(0);
    expect(rel.visao.pagamentosPeriodo).toBe(50);
    expect(rel.pagar.pagoPeriodo).toBe(50);
    expect(rel.visao.recebimentosPeriodo).toBe(0);
    expect(rel.receber.recebidoPeriodo).toBe(0);
    expect(rel.fluxoPrevisto.saldoProjetado).toBe(-200);
    expect(rel.pagar.quantidadeTitulos).toBe(1);
    expect(rel.receber.quantidadeTitulos).toBe(0);
    expect(rel.fluxoRealizado.linhas).toHaveLength(1);
    naoRevela(rel, [10000, 6000, 4000, 300, 15, 40, 70, 999, 10200, 10325, 10350, 10050, 89950]);
  });

  it("o funcionário só da fazenda 20 vê o recebimento e o estorno, sem o título das duas fazendas", async () => {
    const rel = await relatorio(5);
    expect(rel.visao.totalAPagar).toBe(0);
    expect(rel.visao.totalAReceber).toBe(300);
    expect(rel.visao.recebimentosPeriodo).toBe(300);
    expect(rel.receber.recebidoPeriodo).toBe(300);
    expect(rel.visao.pagamentosPeriodo).toBe(300);
    expect(rel.pagar.pagoPeriodo).toBe(0);
    expect(rel.fluxoPrevisto.saldoProjetado).toBe(300);
    expect(rel.receber.quantidadeTitulos).toBe(1);
    expect(rel.pagar.quantidadeTitulos).toBe(0);
    naoRevela(rel, [10000, 6000, 4000, 250, 200, 50, 15, 40, 70, 999]);
  });

  it("filtrar uma fazenda não traz o pedaço nem o total do título dividido", async () => {
    const so10 = await relatorio(4, 10);
    expect(so10.visao.totalAPagar).toBe(200);
    naoRevela(so10, [10000, 6000, 4000]);
    const so20 = await relatorio(5, 20);
    expect(so20.visao.totalAReceber).toBe(300);
    expect(so20.visao.totalAPagar).toBe(0);
    naoRevela(so20, [10000, 6000, 4000]);
    const ambasNa10 = await relatorio(2, 10);
    expect(ambasNa10.pagar.linhas.some((l) => l.tituloId === mixAberto && l.valorOriginal === 10000)).toBe(true);
    expect(ambasNa10.pagar.linhas.some((l) => l.valorOriginal === 6000 || l.valorOriginal === 4000)).toBe(false);
  });

  it("sem a permissão de ver o financeiro a consulta é recusada", async () => {
    await expect(acesso(6)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("outra conta não vê o título nem os totais", async () => {
    const rel = await relatorio(3);
    expect(rel.visao.totalAPagar).toBe(999);
    expect(rel.pagar.quantidadeTitulos).toBe(1);
    naoRevela(rel, [10000, 6000, 4000, 250, 200, 50, 300, 15, 40, 70, 89950]);
  });

  it("uma apropriação nova em fazenda de fora esconde o título inteiro na leitura seguinte", async () => {
    await pool.query(
      "INSERT INTO financeiro_apropriacoes (user_id, titulo_id, fazenda_id, valor) VALUES (1, ?, 30, 1)",
      [mixAberto],
    );
    const escondido = await relatorio(2);
    expect(escondido.pagar.linhas.some((l) => l.tituloId === mixAberto)).toBe(false);
    expect(escondido.visao.totalAPagar).toBe(200);
    expect(escondido.pagar.pagoPeriodo).toBe(10050);
    expect(escondido.pagar.linhas.some((l) => l.tituloId === mixPago && l.valorOriginal === 10000)).toBe(true);
    await pool.query(
      "DELETE FROM financeiro_apropriacoes WHERE user_id = 1 AND titulo_id = ? AND fazenda_id = 30 AND valor = 1",
      [mixAberto],
    );
    const deVolta = await relatorio(2);
    expect(deVolta.visao.totalAPagar).toBe(10200);
    expect(deVolta.pagar.linhas.some((l) => l.tituloId === mixAberto && l.saldoPendente === 10000)).toBe(true);
  });

  it("depois de revogar a fazenda 20 o relatório seguinte não mostra mais o título dividido", async () => {
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 20");
    const rel = await relatorio(2);
    expect(rel.visao.totalAPagar).toBe(200);
    expect(rel.visao.pagamentosPeriodo).toBe(50);
    expect(rel.pagar.linhas.some((l) => l.tituloId === mixAberto || l.tituloId === mixPago)).toBe(false);
    naoRevela(rel, [10000, 6000, 4000, 300]);
  });

  it("sessão revogada não abre o relatório", async () => {
    await pool.query("UPDATE users SET sessionVersion = 1 WHERE id = 4");
    await expect(acesso(4, 0)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const deNovo = await acesso(4, 1);
    const rel = await svc.relatorioFinanceiro(deNovo.titularUserId, PERIODO, deNovo);
    expect(rel.visao.totalAPagar).toBe(200);
    naoRevela(rel, [10000, 6000, 4000]);
  });

  it("mysql fechado não devolve um relatório vazio no lugar do erro", async () => {
    const morto = mysql.createPool({
      host: "127.0.0.1", port: 3391, user: "root", password: "fechada", database: "fd_teste_nao_conectar",
      connectionLimit: 1, connectTimeout: 1500,
    });
    const svcMorto = createFinanceiroNucleoService(
      createFinanceiroNucleoMysqlStore(drizzle(morto, { mode: "default" }) as never),
    );
    await expect(svcMorto.relatorioFinanceiro(1, PERIODO, {
      titularUserId: 1, papel: "principal", fazendaIds: [],
    })).rejects.toBeTruthy();
    await morto.end().catch(() => undefined);
  });
});

function consultas(tx: {
  select: DbLocal["select"];
}): Parameters<typeof acessoDaSessaoFinanceiro>[0] {
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
  };
}
