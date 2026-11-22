import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fazendas, users, usuarioFazendas, usuarioPermissoes } from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import { env } from "./_core/env";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { acessoDaSessaoFinanceiro } from "./consultaFinanceiroAutorizada";
import { ensureFinanceiroNucleoSchema } from "./ensureFinanceiroNucleoSchema";
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "./financeiroNucleo";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { financeiroDoPainel, type IoFinanceiroPainel } from "./painelControle";
import type { PainelFinanceiro } from "../shared/painelControle";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bd-painel";
const PORTA = 3378;
const SENHA = "isolado-h4bd";
const BANCO = "fd_h4bd";
const REFERENCIA = new Date(2026, 10, 21);

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

function naoRevela(fin: PainelFinanceiro, proibidos: number[]) {
  const valores = [fin.saldoCaixaBancos, fin.totalAPagar, fin.totalAReceber, fin.resultadoRealizado];
  expect(valores.filter((v) => proibidos.includes(v))).toEqual([]);
}

describe.sequential("painel financeiro no mysql descartável", () => {
  let pool: mysql.Pool;
  let dbLocal: DbLocal;
  let svc: Svc;
  let mixAberto = 0;
  const donos: number[] = [];

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
      connectionLimit: 4,
    });
    await ensureFinanceiroNucleoSchema(pool);
    await pool.query(
      `INSERT INTO users (id, openId, name, role, papel, titularUserId, situacao, sessionVersion) VALUES
       (1, 'titular-h4bd', 'Titular', 'user', 'principal', 1, 'ativo', 0),
       (2, 'ambas-h4bd', 'Ambas', 'user', 'comum', 1, 'ativo', 0),
       (3, 'outra-h4bd', 'Outra', 'user', 'principal', 3, 'ativo', 0),
       (4, 'so10-h4bd', 'So10', 'user', 'comum', 1, 'ativo', 0),
       (5, 'so20-h4bd', 'So20', 'user', 'comum', 1, 'ativo', 0),
       (6, 'semver-h4bd', 'Semver', 'user', 'comum', 1, 'ativo', 0),
       (7, 'zero-h4bd', 'Zero', 'user', 'principal', 7, 'ativo', 0),
       (8, 'semfaz-h4bd', 'Semfaz', 'user', 'comum', 1, 'ativo', 0)`,
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
       (5, 1, 'financeiro.visualizar', 1),
       (8, 1, 'financeiro.visualizar', 1)`,
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
    mixAberto = await titulo(1, "pagar", 10000, 10);
    await svc.apropriar(1, mixAberto, [
      { valor: 6000, fazendaId: 10 },
      { valor: 4000, fazendaId: 20 },
    ]);
    const mixPago = await titulo(1, "pagar", 10000, 10);
    await svc.apropriar(1, mixPago, [
      { valor: 6000, fazendaId: 10 },
      { valor: 4000, fazendaId: 20 },
    ]);
    const pago = await svc.detalheTitulo(1, mixPago, { titularUserId: 1, papel: "principal", fazendaIds: [] });
    await svc.criarPagamento(1, {
      contaId: conta.id, dataLiquidacao: "2026-11-10", valorMovimentado: 10000, idempotencyKey: "pag-mix",
      alocacoes: [{ parcelaId: pago.parcelas[0]!.id, principalLiquidado: 10000 }],
    });
    const so10 = await titulo(1, "pagar", 250, 10);
    const det10 = await svc.detalheTitulo(1, so10, { titularUserId: 1, papel: "principal", fazendaIds: [] });
    await svc.criarPagamento(1, {
      contaId: conta.id, dataLiquidacao: "2026-11-10", valorMovimentado: 50, idempotencyKey: "pag-10",
      alocacoes: [{ parcelaId: det10.parcelas[0]!.id, principalLiquidado: 50 }],
    });
    const so20 = await titulo(1, "receber", 300, 20);
    const det20 = await svc.detalheTitulo(1, so20, { titularUserId: 1, papel: "principal", fazendaIds: [] });
    const receb = await svc.criarRecebimento(1, {
      contaId: conta.id, dataLiquidacao: "2026-11-10", valorMovimentado: 300, idempotencyKey: "rec-20",
      alocacoes: [{ parcelaId: det20.parcelas[0]!.id, principalLiquidado: 300 }],
    });
    await svc.estornarLiquidacao(1, {
      liquidacaoId: receb.id, idempotencyKey: "est-20", dataLiquidacao: "2026-11-11",
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
    await svc.criarContaFinanceira(7, {
      nome: "Caixa zerado", tipo: "caixa", saldoAbertura: 0, dataSaldoAbertura: "2026-11-01",
    });
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function titulo(userId: number, tipo: "pagar" | "receber", valor: number, fazendaId: number | null, pessoaId = 1) {
    const criado = await svc.criarTitulo(userId, {
      tipo, pessoaId, descricao: `${tipo}-${valor}`, dataCompetencia: "2026-11-01",
      valorOriginal: valor, fazendaOrigemId: fazendaId,
      parcelas: [{ numero: 1, vencimento: "2099-01-15", valorOriginal: valor }],
    });
    return criado.id;
  }

  function io(): IoFinanceiroPainel {
    return {
      async autorizar(pedido) {
        return dbLocal.transaction(async (tx) => acessoDaSessaoFinanceiro(consultas(tx as never), {
          executorId: pedido.executorId,
          sessionVersionDaSessao: pedido.sessionVersionDaSessao,
          permissaoId: "financeiro.visualizar",
        }));
      },
      relatorio(titularUserId, input, escopo) {
        donos.push(titularUserId);
        return svc.relatorioFinanceiro(titularUserId, input, escopo);
      },
    };
  }

  function painel(executorId: number, versao = 0, fazendaId: number | null = null) {
    donos.length = 0;
    return financeiroDoPainel(io(), {
      executorId,
      sessionVersionDaSessao: versao,
      fazendaSelecionadaId: fazendaId,
      referencia: REFERENCIA,
    });
  }

  it("o administrador vê os totais da conta e o saldo verdadeiro do caixa", async () => {
    const fin = await painel(1);
    expect(donos).toEqual([1]);
    expect(fin.disponivel).toBe(true);
    expect(fin.motivoFinanceiro).toBe("autorizado");
    expect(fin.saldoCaixaAutorizado).toBe(true);
    expect(fin.saldoCaixaBancos).toBe(89950);
    expect(fin.totalAPagar).toBe(10325);
    expect(fin.totalAReceber).toBe(300);
    expect(fin.resultadoRealizado).toBe(-10050);
  });

  it("o funcionário das duas fazendas vê o título inteiro e não vê o caixa", async () => {
    const fin = await painel(2);
    expect(donos.every((id) => id === 1)).toBe(true);
    expect(fin.disponivel).toBe(true);
    expect(fin.saldoCaixaAutorizado).toBe(false);
    expect(fin.saldoCaixaBancos).toBe(0);
    expect(fin.totalAPagar).toBe(10200);
    expect(fin.totalAReceber).toBe(300);
    expect(fin.resultadoRealizado).toBe(-10050);
    naoRevela(fin, [15, 40, 70, 999, 89950, 10325]);
  });

  it("o funcionário só da fazenda 10 não vê os 10000 nem o pagamento desse título", async () => {
    const fin = await painel(4);
    expect(donos).toEqual([1]);
    expect(fin.totalAPagar).toBe(200);
    expect(fin.totalAReceber).toBe(0);
    expect(fin.resultadoRealizado).toBe(-50);
    expect(fin.saldoCaixaAutorizado).toBe(false);
    naoRevela(fin, [10000, 6000, 4000, 300, 15, 40, 70, 999, 89950, 10200, 10325, -10050]);
  });

  it("o funcionário só da fazenda 20 vê o recebimento e o estorno, sem o título dividido", async () => {
    const fin = await painel(5);
    expect(fin.totalAPagar).toBe(0);
    expect(fin.totalAReceber).toBe(300);
    expect(fin.resultadoRealizado).toBe(0);
    naoRevela(fin, [10000, 6000, 4000, 250, 200, 50, 15, 40, 70, 999, 89950]);
  });

  it("sem permissão de ver o financeiro o painel não entrega os valores", async () => {
    const fin = await painel(6);
    expect(donos).toEqual([]);
    expect(fin.disponivel).toBe(false);
    expect(fin.motivoFinanceiro).toBe("sem_permissao");
    expect(fin.saldoCaixaAutorizado).toBe(false);
    naoRevela(fin, [10000, 6000, 4000, 300, 200, 50, 89950, 10325]);
  });

  it("permissão sem fazenda concedida também fecha o financeiro", async () => {
    const fin = await painel(8);
    expect(fin.disponivel).toBe(false);
    expect(fin.motivoFinanceiro).toBe("sem_permissao");
    expect(donos).toEqual([]);
  });

  it("outra conta não vê os títulos do titular", async () => {
    const fin = await painel(3);
    expect(donos).toEqual([3]);
    expect(fin.totalAPagar).toBe(999);
    expect(fin.saldoCaixaAutorizado).toBe(true);
    naoRevela(fin, [10000, 6000, 4000, 250, 200, 50, 300, 15, 40, 70, 89950]);
  });

  it("saldo realmente zero continua zero e autorizado para o responsável", async () => {
    const fin = await painel(7);
    expect(fin.disponivel).toBe(true);
    expect(fin.motivoFinanceiro).toBe("autorizado");
    expect(fin.saldoCaixaAutorizado).toBe(true);
    expect(fin.saldoCaixaBancos).toBe(0);
    expect(fin.totalAPagar).toBe(0);
    expect(fin.totalAReceber).toBe(0);
  });

  it("apropriação nova em fazenda de fora sai do total na consulta seguinte", async () => {
    await pool.query(
      "INSERT INTO financeiro_apropriacoes (user_id, titulo_id, fazenda_id, valor) VALUES (1, ?, 30, 1)",
      [mixAberto],
    );
    const escondido = await painel(2);
    expect(escondido.totalAPagar).toBe(200);
    naoRevela(escondido, [10000, 6000, 4000]);
    await pool.query(
      "DELETE FROM financeiro_apropriacoes WHERE user_id = 1 AND titulo_id = ? AND fazenda_id = 30 AND valor = 1",
      [mixAberto],
    );
    const deVolta = await painel(2);
    expect(deVolta.totalAPagar).toBe(10200);
  });

  it("fazenda revogada some na consulta seguinte", async () => {
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 20");
    const fin = await painel(2);
    expect(fin.totalAPagar).toBe(200);
    expect(fin.resultadoRealizado).toBe(-50);
    naoRevela(fin, [10000, 6000, 4000, 300]);
  });

  it("permissão revogada fecha o financeiro na consulta seguinte", async () => {
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 5 AND permissao = 'financeiro.visualizar'");
    const fin = await painel(5);
    expect(fin.disponivel).toBe(false);
    expect(fin.motivoFinanceiro).toBe("sem_permissao");
    expect(donos).toEqual([]);
    naoRevela(fin, [10000, 300, 89950]);
  });

  it("sessão revogada não abre o financeiro", async () => {
    await pool.query("UPDATE users SET sessionVersion = 1 WHERE id = 4");
    await expect(painel(4, 0)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const fin = await painel(4, 1);
    expect(fin.totalAPagar).toBe(200);
    naoRevela(fin, [10000, 6000, 4000]);
  });

  it("o serviço compartilhado recusa consulta sem escopo e escopo de outro titular", async () => {
    await expect(svc.relatorioFinanceiro(1, { de: "2026-11-01", ate: "2026-11-30" }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(svc.relatorioFinanceiro(1, { de: "2026-11-01", ate: "2026-11-30" }, {
      titularUserId: 3, papel: "principal", fazendaIds: [],
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("falha do mysql não completa o painel com número antigo nem com json", async () => {
    const fonte = readFileSync(new URL("./painelControle.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const corpo = fonte.slice(fonte.indexOf("export async function financeiroDoPainel"), fonte.indexOf("async function carregarComercialPainel"));
    expect(corpo).not.toContain("listLocal");
    expect(corpo).not.toContain("getLocal");
    expect(corpo).not.toContain("devLocalStore");
    const fin = await financeiroDoPainel({
      async autorizar() {
        return { titularUserId: 1, papel: "principal", fazendaIds: [10, 20] };
      },
      async relatorio() {
        throw new Error("connect ECONNREFUSED 127.0.0.1:3391");
      },
    }, {
      executorId: 1,
      sessionVersionDaSessao: 0,
      fazendaSelecionadaId: null,
      referencia: REFERENCIA,
    });
    expect(fin.disponivel).toBe(false);
    expect(fin.motivoFinanceiro).toBe("indisponivel");
    expect(fin.saldoCaixaAutorizado).toBe(false);
    naoRevela(fin, [10000, 89950, 10325]);
  });
});

function consultas(tx: { select: DbLocal["select"] }): Parameters<typeof acessoDaSessaoFinanceiro>[0] {
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
