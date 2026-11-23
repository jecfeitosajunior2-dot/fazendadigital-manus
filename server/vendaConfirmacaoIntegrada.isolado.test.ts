/**
 * Prova da confirmação que a tela Nova Venda usa de fato.
 * Chama confirmarVendaAutorizada e o adaptador MySQL real do título.
 * Não usa o efeito escrito à mão do teste antigo de autorização.
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fazendas, usuarioFazendas, usuarioPermissoes, users, vendas } from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { createCancelarVendaFinanceiroMysqlStore } from "./cancelarVendaFinanceiroMysql";
import { createCancelarVendaFinanceiroService, MSG_VENDA_CANCELAR_COM_RECEBIMENTO } from "./cancelarVendaFinanceiro";
import { createConfirmarVendaFinanceiroMysqlStore } from "./confirmarVendaFinanceiroMysql";
import type { ConfirmarVendaFinanceiroInput } from "./confirmarVendaFinanceiro";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { MSG_SEM_FAZENDA_MANEJO } from "./registrarManejoAutorizado";
import { MSG_VENDA_ANIMAL_OUTRA_FAZENDA } from "../shared/vendaComercial";
import {
  MSG_VENDA_CONFIRMACAO_JA_CANCELADA,
  MSG_VENDA_CONFLITO_IDEMPOTENCIA,
} from "../shared/vendaFinanceiro";
import { confirmarVendaIntegradaSeAtiva } from "./vendaConfirmacaoIntegrada";
import {
  MSG_SEM_PERMISSAO_CANCELAR_VENDA,
  MSG_SEM_PERMISSAO_CONFIRMAR_VENDA,
  cancelarVendaAutorizada,
  confirmarVendaAutorizada,
  type ConsultaVendaOperacao,
  type IoVendaOperacao,
} from "./vendaOperacaoAutorizado";

const urlAmbiente = process.env.DATABASE_URL ?? "";
if (urlAmbiente.includes(":3306") || urlAmbiente.toLowerCase().includes("fazenda_digital")) {
  throw new Error("Teste recusou o banco operacional.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bw-ven";
const PORTA = 3407;
const SENHA = "isolado-h4bw-ven";
const BANCO = "fd_h4bw_ven";

const ESQUEMA = `
CREATE TABLE users (
  id int NOT NULL AUTO_INCREMENT,
  openId varchar(255) NOT NULL,
  name varchar(255) NOT NULL,
  email varchar(255) NULL,
  role enum('admin','user') NULL DEFAULT 'user',
  papel enum('principal','secundario','comum') NOT NULL DEFAULT 'comum',
  titularUserId int NULL,
  situacao enum('convidado','ativo','inativo') NOT NULL DEFAULT 'ativo',
  sessionVersion int NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY users_openId_uq (openId)
) ENGINE=InnoDB;
CREATE TABLE fazendas (
  id int NOT NULL,
  userId int NOT NULL,
  nome varchar(200) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_fazendas (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  fazendaId int NOT NULL,
  concedidoPorUserId int NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_permissoes (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  titularUserId int NOT NULL,
  permissao varchar(80) NOT NULL,
  concedidoPorUserId int NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pessoas (
  id int NOT NULL,
  user_id int NOT NULL,
  nome varchar(255) NOT NULL,
  tipo enum('fornecedor','cliente','funcionario') NOT NULL,
  ativo tinyint NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE lotes (
  id int NOT NULL,
  userId int NOT NULL,
  nome varchar(100) NOT NULL,
  fazendaId int NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL,
  userId int NOT NULL,
  brinco varchar(50) NULL,
  status enum('ativo','vendido','morto','transferido') NULL DEFAULT 'ativo',
  fazendaId int NULL,
  loteId int NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_baixas (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  animalId int NOT NULL,
  fazendaId int NOT NULL,
  tipo enum('venda','morte','transferencia') NOT NULL,
  dataBaixa date NOT NULL,
  destino varchar(255) NULL,
  motivo varchar(255) NULL,
  observacoes text NULL,
  usuarioNome varchar(200) NULL,
  vendaId int NULL,
  status enum('ativa','estornada') NOT NULL DEFAULT 'ativa',
  createdAt timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE vendas (
  id int NOT NULL AUTO_INCREMENT,
  user_id int NOT NULL,
  comprador varchar(255) NULL,
  data varchar(20) NOT NULL,
  quantidade_animais int NULL,
  valor_total varchar(50) NULL,
  observacoes text NULL,
  status enum('pendente','concluido','cancelado') NULL DEFAULT 'pendente',
  fazenda_id int NULL,
  comprador_id int NULL,
  forma_precificacao enum('kg','cabeca') NULL,
  preco_padrao decimal(12,2) NULL,
  peso_total decimal(10,2) NULL,
  rendimento_carcaca decimal(5,2) NULL,
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  cancelado_em timestamp NULL,
  cancelado_por_user_id int NULL,
  cancelado_por_nome varchar(200) NULL,
  motivo_cancelamento varchar(255) NULL,
  idempotency_key varchar(80) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY vendas_idem_uq (user_id, idempotency_key)
) ENGINE=InnoDB;
CREATE TABLE venda_itens (
  id int NOT NULL AUTO_INCREMENT,
  user_id int NOT NULL,
  venda_id int NOT NULL,
  animal_id int NOT NULL,
  brinco_snapshot varchar(50) NULL,
  lote_nome_snapshot varchar(100) NULL,
  peso_venda decimal(8,2) NULL,
  forma_precificacao enum('kg','cabeca') NOT NULL,
  preco_unitario decimal(12,2) NOT NULL,
  valor_item decimal(12,2) NOT NULL,
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY venda_itens_venda_animal_uq (venda_id, animal_id)
) ENGINE=InnoDB;
CREATE TABLE financeiro_titulos (
  id int NOT NULL AUTO_INCREMENT,
  user_id int NOT NULL,
  tipo varchar(20) NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'ativo',
  condicao_status varchar(20) NOT NULL DEFAULT 'a_definir',
  pessoa_id int NOT NULL,
  contraparte_nome_snapshot varchar(255) NOT NULL,
  fazenda_origem_id int NULL,
  origem_tipo varchar(40) NOT NULL,
  origem_id int NULL,
  origem_item_chave varchar(80) NULL,
  descricao varchar(255) NOT NULL,
  data_competencia date NOT NULL,
  valor_original decimal(12,2) NOT NULL,
  documento_referencia varchar(80) NULL,
  observacoes text NULL,
  cancelado_em timestamp NULL,
  motivo_cancelamento varchar(255) NULL,
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY financeiro_titulos_origem_uq (user_id, origem_tipo, origem_id, origem_item_chave)
) ENGINE=InnoDB;
CREATE TABLE financeiro_parcelas (
  id int NOT NULL AUTO_INCREMENT,
  user_id int NOT NULL,
  titulo_id int NOT NULL,
  numero int NOT NULL,
  vencimento date NOT NULL,
  valor_original decimal(12,2) NOT NULL,
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY financeiro_parcelas_titulo_numero_uq (titulo_id, numero)
) ENGINE=InnoDB;
CREATE TABLE financeiro_liquidacoes (
  id int NOT NULL AUTO_INCREMENT,
  user_id int NOT NULL,
  tipo varchar(30) NOT NULL,
  conta_id int NOT NULL,
  data_liquidacao date NOT NULL,
  valor_movimentado decimal(12,2) NOT NULL,
  forma_pagamento varchar(40) NULL,
  referencia varchar(80) NULL,
  observacoes text NULL,
  liquidacao_original_id int NULL,
  idempotency_key varchar(80) NOT NULL,
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE financeiro_liquidacao_alocacoes (
  id int NOT NULL AUTO_INCREMENT,
  user_id int NOT NULL,
  liquidacao_id int NOT NULL,
  parcela_id int NOT NULL,
  principal_liquidado decimal(12,2) NOT NULL,
  desconto decimal(12,2) NOT NULL DEFAULT 0,
  juros decimal(12,2) NOT NULL DEFAULT 0,
  multa decimal(12,2) NOT NULL DEFAULT 0,
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

type Banco = ReturnType<typeof drizzle>;

function consultas(tx: { select: any }): ConsultaVendaOperacao {
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
      return linhas.map((linha: { permissao: string }) => linha.permissao);
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
    async espiarVenda(id) {
      const [linha] = await tx.select({
        id: vendas.id,
        userId: vendas.userId,
        fazendaId: vendas.fazendaId,
        status: vendas.status,
      }).from(vendas).where(eq(vendas.id, id)).limit(1);
      return linha ?? null;
    },
    transacaoAtual: tx,
  };
}

describe("tela Nova Venda", () => {
  it("chama a confirmação integrada e não o cadastro antigo", () => {
    const pagina = readFileSync(new URL("../client/src/pages/NovaVendaPage.tsx", import.meta.url), "utf8");
    const fluxo = readFileSync(new URL("../client/src/lib/novaVendaConfirmacao.ts", import.meta.url), "utf8");
    const roteador = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const vendas = roteador.slice(roteador.indexOf("const vendasRouter"), roteador.indexOf("const fazendasRouter"));
    const integrada = vendas.slice(vendas.indexOf("confirmarIntegrada:"), vendas.indexOf("create: protectedProcedure"));
    expect(pagina).toContain("executarConfirmacaoNovaVenda");
    expect(pagina).toContain("vendas.confirmarIntegrada");
    expect(pagina).not.toContain("vendas.create");
    expect(pagina.indexOf("if (!resultado.ok)")).toBeLessThan(pagina.indexOf('toast.success("Venda confirmada.")'));
    expect(fluxo).toContain("confirmarIntegrada");
    expect(integrada).toContain("confirmarVendaIntegradaSeAtiva");
    expect(integrada).toContain("createConfirmarVendaFinanceiroMysqlStore");
    expect(integrada).not.toContain("localFallback");
    expect(vendas).toContain("MSG_CADASTRO_VENDA_SEM_FAZENDA");
    expect(vendas).not.toContain("localFallback");
  });
});

describe("confirmação integrada no MySQL descartável", () => {
  let pool: mysql.Pool;
  let banco: Banco;

  function io(): IoVendaOperacao {
    return {
      emTransacao(fn) {
        return banco.transaction(
          (tx) => fn(consultas(tx)),
          { isolationLevel: "read committed" },
        );
      },
    };
  }

  async function confirmar(
    executorId: number,
    input: Partial<ConfirmarVendaFinanceiroInput> = {},
    sessao: { sessionVersion?: number; fazendaId?: number } = {},
  ) {
    const fazendaId = sessao.fazendaId ?? input.fazendaId ?? 10;
    const corpo: ConfirmarVendaFinanceiroInput = {
      idempotencyKey: input.idempotencyKey ?? "ven-teste-01",
      fazendaId,
      data: input.data ?? "2026-11-23",
      compradorId: input.compradorId ?? 7,
      formaPrecificacao: input.formaPrecificacao ?? "cabeca",
      itens: input.itens ?? [{ animalId: 101, precoUnitario: 1500 }],
      condicao: input.condicao ?? "a_vista",
      parcelas: input.parcelas,
      usuarioNome: input.usuarioNome ?? "Curral",
      observacoes: input.observacoes,
    };
    return confirmarVendaAutorizada(io(), {
      executorId,
      sessionVersionDaSessao: sessao.sessionVersion ?? 1,
      fazendaId,
      titularInformadoPeloCliente: 999,
      papelInformadoPeloCliente: "principal",
      permissoesInformadasPeloCliente: ["vendas.confirmar"],
      fazendasInformadasPeloCliente: [20, 30],
    }, (titular, tx) => {
      if (!tx.transacaoAtual) throw new Error("A venda precisa da mesma transação da autorização.");
      return confirmarVendaIntegradaSeAtiva(
        createConfirmarVendaFinanceiroMysqlStore(tx.transacaoAtual as never),
        titular,
        corpo,
      );
    });
  }

  async function cancelar(executorId: number, vendaId: number) {
    return cancelarVendaAutorizada(io(), {
      executorId,
      sessionVersionDaSessao: 1,
      vendaId,
      motivo: "Desistiu do negocio",
      titularInformadoPeloCliente: 999,
    }, (titular, tx) => {
      if (!tx.transacaoAtual) throw new Error("O cancelamento precisa da mesma transação da autorização.");
      return createCancelarVendaFinanceiroService(
        createCancelarVendaFinanceiroMysqlStore(tx.transacaoAtual as never),
      ).cancelar(titular, {
        vendaId,
        motivo: "Desistiu do negocio",
        canceladoPorUserId: executorId,
        canceladoPorNome: "Curral",
      });
    });
  }

  async function contar(tabela: string) {
    const [linhas] = await pool.query(`SELECT COUNT(*) AS n FROM \`${tabela}\``) as [Array<{ n: number }>, unknown];
    return Number(linhas[0]?.n ?? 0);
  }

  beforeAll(async () => {
    afirmarBancoDescartavel({ host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER });
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
    await exec("docker", [
      "run", "-d", "--name", CONTAINER,
      "-e", `MYSQL_ROOT_PASSWORD=${SENHA}`,
      "-e", `MYSQL_DATABASE=${BANCO}`,
      "-p", `127.0.0.1:${PORTA}:3306`,
      "mysql:8.4",
    ], { windowsHide: true });
    const prazo = Date.now() + 90_000;
    let ultimo = "";
    while (Date.now() < prazo) {
      try {
        const conn = await mysql.createConnection({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, multipleStatements: true,
        });
        const [bancoAtual] = await conn.query("SELECT DATABASE() AS nome") as [Array<{ nome: string }>, unknown];
        expect(bancoAtual[0]?.nome).toBe(BANCO);
        expect(PORTA).not.toBe(3306);
        await conn.query(ESQUEMA);
        await conn.end();
        pool = mysql.createPool({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
          connectionLimit: 6, multipleStatements: true,
        });
        banco = drizzle(pool);
        return;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    throw new Error(ultimo || "MySQL descartável não subiu.");
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  beforeEach(async () => {
    await pool.query("DROP TRIGGER IF EXISTS falha_titulo");
    for (const tabela of [
      "financeiro_liquidacao_alocacoes",
      "financeiro_liquidacoes",
      "financeiro_parcelas",
      "financeiro_titulos",
      "animal_baixas",
      "venda_itens",
      "vendas",
      "animais",
      "lotes",
      "pessoas",
      "usuario_fazendas",
      "usuario_permissoes",
      "fazendas",
      "users",
    ]) {
      await pool.query(`DELETE FROM \`${tabela}\``);
    }
    await pool.query(`
      INSERT INTO users (id, openId, name, role, papel, titularUserId, situacao, sessionVersion) VALUES
        (1, 'p1', 'Titular', 'user', 'principal', 1, 'ativo', 1),
        (2, 'f2', 'Curral', 'user', 'comum', 1, 'ativo', 1),
        (3, 'p3', 'Outro', 'user', 'principal', 3, 'ativo', 1),
        (5, 'f5', 'Sem acesso', 'user', 'comum', 1, 'ativo', 1);
      INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Norte'), (20, 1, 'Sul'), (30, 3, 'Alheia');
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'vendas.confirmar', 1),
        (2, 1, 'vendas.cancelar', 1);
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1);
      INSERT INTO pessoas (id, user_id, nome, tipo, ativo) VALUES (7, 1, 'Comprador Teste', 'cliente', 1);
      INSERT INTO lotes (id, userId, nome, fazendaId) VALUES (4, 1, 'Lote A', 10);
      INSERT INTO animais (id, userId, brinco, status, fazendaId, loteId) VALUES
        (101, 1, 'A', 'ativo', 10, 4),
        (102, 1, 'B', 'ativo', 10, 4),
        (103, 1, 'C', 'ativo', 20, NULL),
        (104, 3, 'D', 'ativo', 30, NULL);
    `);
  });

  it("funcionário vende um animal da fazenda concedida e o dono gravado é o titular", async () => {
    const resultado = await confirmar(2);
    expect(resultado.vendaId).toBeGreaterThan(0);
    expect(resultado.tituloId).toBeGreaterThan(0);
    expect(resultado.quantidade).toBe(1);
    expect(Number(resultado.valorTotal)).toBe(1500);
    expect(resultado.idempotente).toBe(false);

    const [venda] = await pool.query(
      "SELECT user_id, fazenda_id, comprador_id, data, status, valor_total, idempotency_key FROM vendas",
    ) as [Array<Record<string, unknown>>, unknown];
    expect(venda).toHaveLength(1);
    expect(Number(venda[0]?.user_id)).toBe(1);
    expect(Number(venda[0]?.fazenda_id)).toBe(10);
    expect(Number(venda[0]?.comprador_id)).toBe(7);
    expect(String(venda[0]?.data)).toBe("2026-11-23");
    expect(venda[0]?.status).toBe("concluido");
    expect(Number(venda[0]?.valor_total)).toBe(1500);
    expect(venda[0]?.idempotency_key).toBe("ven-teste-01");

    const [baixa] = await pool.query(
      "SELECT userId, animalId, fazendaId, tipo, status, usuarioNome, vendaId FROM animal_baixas",
    ) as [Array<Record<string, unknown>>, unknown];
    expect(baixa).toHaveLength(1);
    expect(Number(baixa[0]?.userId)).toBe(1);
    expect(Number(baixa[0]?.animalId)).toBe(101);
    expect(baixa[0]?.tipo).toBe("venda");
    expect(baixa[0]?.status).toBe("ativa");
    expect(baixa[0]?.usuarioNome).toBe("Curral");
    expect(Number(baixa[0]?.vendaId)).toBe(resultado.vendaId);

    const [titulo] = await pool.query(
      "SELECT user_id, tipo, estado, pessoa_id, fazenda_origem_id, valor_original, documento_referencia, origem_tipo, origem_id FROM financeiro_titulos",
    ) as [Array<Record<string, unknown>>, unknown];
    expect(titulo).toHaveLength(1);
    expect(Number(titulo[0]?.user_id)).toBe(1);
    expect(titulo[0]?.tipo).toBe("receber");
    expect(titulo[0]?.estado).toBe("ativo");
    expect(Number(titulo[0]?.pessoa_id)).toBe(7);
    expect(Number(titulo[0]?.fazenda_origem_id)).toBe(10);
    expect(Number(titulo[0]?.valor_original)).toBe(1500);
    expect(titulo[0]?.documento_referencia).toBe(`VENDA-${resultado.vendaId}`);
    expect(Number(titulo[0]?.origem_id)).toBe(resultado.vendaId);
    expect(await contar("financeiro_parcelas")).toBe(1);

    const [animal] = await pool.query("SELECT status, loteId, fazendaId FROM animais WHERE id = 101") as [Array<Record<string, unknown>>, unknown];
    expect(animal[0]?.status).toBe("vendido");
    expect(Number(animal[0]?.loteId)).toBe(4);
    expect(Number(animal[0]?.fazendaId)).toBe(10);
    const [item] = await pool.query("SELECT lote_nome_snapshot, animal_id FROM venda_itens") as [Array<Record<string, unknown>>, unknown];
    expect(item).toHaveLength(1);
    expect(item[0]?.lote_nome_snapshot).toBe("Lote A");
    expect(Number(item[0]?.animal_id)).toBe(101);
  });

  it("vende vários animais numa operação só, com um título e valores somados", async () => {
    const resultado = await confirmar(2, {
      idempotencyKey: "ven-varios-01",
      itens: [
        { animalId: 102, precoUnitario: 500 },
        { animalId: 101, precoUnitario: 1000 },
      ],
    });
    expect(resultado.quantidade).toBe(2);
    expect(Number(resultado.valorTotal)).toBe(1500);
    expect(await contar("vendas")).toBe(1);
    expect(await contar("venda_itens")).toBe(2);
    expect(await contar("animal_baixas")).toBe(2);
    expect(await contar("financeiro_titulos")).toBe(1);
    const [animais] = await pool.query(
      "SELECT id, status FROM animais WHERE id IN (101, 102) ORDER BY id",
    ) as [Array<{ id: number; status: string }>, unknown];
    expect(animais.map((linha) => linha.status)).toEqual(["vendido", "vendido"]);
    const [itens] = await pool.query(
      "SELECT animal_id FROM venda_itens ORDER BY animal_id",
    ) as [Array<{ animal_id: number }>, unknown];
    expect(itens.map((linha) => Number(linha.animal_id))).toEqual([101, 102]);
  });

  it("recusa animal de outra fazenda e não confirma ninguém", async () => {
    await expect(confirmar(2, {
      idempotencyKey: "ven-duas-fazendas",
      itens: [
        { animalId: 101, precoUnitario: 1000 },
        { animalId: 103, precoUnitario: 800 },
      ],
    })).rejects.toMatchObject({ message: MSG_VENDA_ANIMAL_OUTRA_FAZENDA });
    expect(await contar("vendas")).toBe(0);
    expect(await contar("financeiro_titulos")).toBe(0);
    expect(await contar("animal_baixas")).toBe(0);
    const [animais] = await pool.query(
      "SELECT id, status FROM animais WHERE id IN (101, 103) ORDER BY id",
    ) as [Array<{ status: string }>, unknown];
    expect(animais.map((linha) => linha.status)).toEqual(["ativo", "ativo"]);
  });

  it("recusa quem não pode vender, outra conta e sessão revogada, sem gravar nada", async () => {
    await expect(confirmar(5)).rejects.toMatchObject({ message: MSG_SEM_PERMISSAO_CONFIRMAR_VENDA });
    await expect(confirmar(2, {}, { fazendaId: 20 })).rejects.toMatchObject({ message: MSG_SEM_FAZENDA_MANEJO });
    await expect(confirmar(2, {
      idempotencyKey: "ven-alheio",
      itens: [{ animalId: 104, precoUnitario: 900 }],
    })).rejects.toMatchObject({ message: "O animal #104 não está mais disponível para Venda." });
    await expect(confirmar(2, {}, { sessionVersion: 9 })).rejects.toMatchObject({ message: "Sessão inválida." });
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = 'vendas.confirmar'");
    await expect(confirmar(2, { idempotencyKey: "ven-revogada" })).rejects.toMatchObject({
      message: MSG_SEM_PERMISSAO_CONFIRMAR_VENDA,
    });
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2");
    await pool.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId)
      VALUES (2, 1, 'vendas.confirmar', 1)
    `);
    await expect(confirmar(2, { idempotencyKey: "ven-sem-fazenda" })).rejects.toMatchObject({
      message: MSG_SEM_FAZENDA_MANEJO,
    });
    expect(await contar("vendas")).toBe(0);
    expect(await contar("financeiro_titulos")).toBe(0);
    const [alheio] = await pool.query("SELECT status, userId FROM animais WHERE id = 104") as [Array<Record<string, unknown>>, unknown];
    expect(alheio[0]?.status).toBe("ativo");
    expect(Number(alheio[0]?.userId)).toBe(3);
  });

  it("falha no título desfaz a venda, a baixa e a mudança do animal", async () => {
    await pool.query(`
      CREATE TRIGGER falha_titulo BEFORE INSERT ON financeiro_titulos
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'falhou no titulo'
    `);
    await expect(confirmar(2, { idempotencyKey: "ven-falha-titulo" })).rejects.toMatchObject({
      message: "Não foi possível confirmar a venda.",
    });
    expect(await contar("vendas")).toBe(0);
    expect(await contar("venda_itens")).toBe(0);
    expect(await contar("animal_baixas")).toBe(0);
    expect(await contar("financeiro_titulos")).toBe(0);
    expect(await contar("financeiro_parcelas")).toBe(0);
    const [animal] = await pool.query("SELECT status FROM animais WHERE id = 101") as [Array<{ status: string }>, unknown];
    expect(animal[0]?.status).toBe("ativo");
  });

  it("reenvio da mesma chave e duas conexões deixam uma venda e um título", async () => {
    const primeira = await confirmar(2, { idempotencyKey: "ven-reenvio-01" });
    const segunda = await confirmar(2, { idempotencyKey: "ven-reenvio-01" });
    expect(segunda.vendaId).toBe(primeira.vendaId);
    expect(segunda.tituloId).toBe(primeira.tituloId);
    expect(segunda.idempotente).toBe(true);
    expect(await contar("vendas")).toBe(1);
    expect(await contar("financeiro_titulos")).toBe(1);

    const [corridaA, corridaB] = await Promise.all([
      confirmar(2, { idempotencyKey: "ven-corrida-01", itens: [{ animalId: 102, precoUnitario: 700 }] }),
      confirmar(2, { idempotencyKey: "ven-corrida-01", itens: [{ animalId: 102, precoUnitario: 700 }] }),
    ]);
    expect(corridaA.vendaId).toBe(corridaB.vendaId);
    expect(corridaA.tituloId).toBe(corridaB.tituloId);
    expect(await contar("vendas")).toBe(2);
    expect(await contar("financeiro_titulos")).toBe(2);
    const [vendidos] = await pool.query(
      "SELECT status FROM animais WHERE id = 102",
    ) as [Array<{ status: string }>, unknown];
    expect(vendidos[0]?.status).toBe("vendido");
  });

  it("mesma chave com outro animal não cria a segunda venda", async () => {
    const primeira = await confirmar(2, { idempotencyKey: "ven-conteudo-01" });
    await expect(confirmar(2, {
      idempotencyKey: "ven-conteudo-01",
      itens: [{ animalId: 102, precoUnitario: 400 }],
    })).rejects.toMatchObject({ message: MSG_VENDA_CONFLITO_IDEMPOTENCIA });
    expect(await contar("vendas")).toBe(1);
    const [resto] = await pool.query("SELECT id, status FROM animais WHERE id IN (101, 102) ORDER BY id") as [Array<{ status: string }>, unknown];
    expect(resto.map((linha) => linha.status)).toEqual(["vendido", "ativo"]);
    const [venda] = await pool.query("SELECT id FROM vendas") as [Array<{ id: number }>, unknown];
    expect(Number(venda[0]?.id)).toBe(primeira.vendaId);
  });

  it("dois pedidos diferentes no mesmo animal deixam uma venda só", async () => {
    const [um, dois] = await Promise.allSettled([
      confirmar(2, { idempotencyKey: "ven-disputa-a", itens: [{ animalId: 101, precoUnitario: 1100 }] }),
      confirmar(2, { idempotencyKey: "ven-disputa-b", itens: [{ animalId: 101, precoUnitario: 1200 }] }),
    ]);
    const ok = [um, dois].filter((item) => item.status === "fulfilled");
    const falha = [um, dois].filter((item) => item.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(falha).toHaveLength(1);
    expect(await contar("vendas")).toBe(1);
    expect(await contar("financeiro_titulos")).toBe(1);
    const [animal] = await pool.query("SELECT status FROM animais WHERE id = 101") as [Array<{ status: string }>, unknown];
    expect(animal[0]?.status).toBe("vendido");
  });

  it("cancelamento devolve o animal, estorna a baixa e cancela o título sem apagar a venda", async () => {
    const venda = await confirmar(2, { idempotencyKey: "ven-cancela-01" });
    await cancelar(2, venda.vendaId);
    const [linha] = await pool.query(
      "SELECT status, user_id, motivo_cancelamento FROM vendas",
    ) as [Array<Record<string, unknown>>, unknown];
    expect(linha).toHaveLength(1);
    expect(linha[0]?.status).toBe("cancelado");
    expect(Number(linha[0]?.user_id)).toBe(1);
    expect(linha[0]?.motivo_cancelamento).toBe("Desistiu do negocio");
    const [animal] = await pool.query("SELECT status, loteId FROM animais WHERE id = 101") as [Array<Record<string, unknown>>, unknown];
    expect(animal[0]?.status).toBe("ativo");
    expect(Number(animal[0]?.loteId)).toBe(4);
    const [baixa] = await pool.query("SELECT status FROM animal_baixas") as [Array<{ status: string }>, unknown];
    expect(baixa[0]?.status).toBe("estornada");
    const [titulo] = await pool.query("SELECT id, estado FROM financeiro_titulos") as [Array<Record<string, unknown>>, unknown];
    expect(titulo).toHaveLength(1);
    expect(titulo[0]?.estado).toBe("cancelado");
    expect(Number(titulo[0]?.id)).toBe(venda.tituloId);
  });

  it("a mesma chave depois do cancelamento não confirma de novo", async () => {
    const venda = await confirmar(2, { idempotencyKey: "ven-depois-cancela" });
    await cancelar(2, venda.vendaId);
    await expect(confirmar(2, { idempotencyKey: "ven-depois-cancela" })).rejects.toMatchObject({
      message: MSG_VENDA_CONFIRMACAO_JA_CANCELADA,
    });
    expect(await contar("vendas")).toBe(1);
    expect(await contar("financeiro_titulos")).toBe(1);
    const [animal] = await pool.query("SELECT status FROM animais WHERE id = 101") as [Array<{ status: string }>, unknown];
    expect(animal[0]?.status).toBe("ativo");
  });

  it("título já recebido não é apagado e a venda permanece", async () => {
    const venda = await confirmar(2, { idempotencyKey: "ven-liquidada" });
    const [parcela] = await pool.query("SELECT id FROM financeiro_parcelas") as [Array<{ id: number }>, unknown];
    await pool.query(
      `INSERT INTO financeiro_liquidacoes
        (user_id, tipo, conta_id, data_liquidacao, valor_movimentado, idempotency_key)
       VALUES (1, 'recebimento', 1, '2026-11-23', 1500.00, 'liq-h4bw-1')`,
    );
    const [liq] = await pool.query("SELECT id FROM financeiro_liquidacoes") as [Array<{ id: number }>, unknown];
    await pool.query(
      `INSERT INTO financeiro_liquidacao_alocacoes
        (user_id, liquidacao_id, parcela_id, principal_liquidado)
       VALUES (1, ?, ?, 1500.00)`,
      [liq[0]?.id, parcela[0]?.id],
    );
    await expect(cancelar(2, venda.vendaId)).rejects.toMatchObject({
      message: MSG_VENDA_CANCELAR_COM_RECEBIMENTO,
    });
    const [linha] = await pool.query("SELECT status FROM vendas") as [Array<{ status: string }>, unknown];
    expect(linha[0]?.status).toBe("concluido");
    const [titulo] = await pool.query("SELECT estado FROM financeiro_titulos") as [Array<{ estado: string }>, unknown];
    expect(titulo[0]?.estado).toBe("ativo");
    expect(await contar("financeiro_titulos")).toBe(1);
    expect(await contar("financeiro_liquidacoes")).toBe(1);
    const [animal] = await pool.query("SELECT status FROM animais WHERE id = 101") as [Array<{ status: string }>, unknown];
    expect(animal[0]?.status).toBe("vendido");
  });

  it("outra conta não cancela a venda pelo identificador", async () => {
    const venda = await confirmar(2, { idempotencyKey: "ven-outra-conta" });
    await expect(cancelar(3, venda.vendaId)).rejects.toMatchObject({ message: "Venda não encontrada." });
    await pool.query("DELETE FROM usuario_permissoes WHERE permissao = 'vendas.cancelar'");
    await expect(cancelar(2, venda.vendaId)).rejects.toMatchObject({ message: MSG_SEM_PERMISSAO_CANCELAR_VENDA });
    const [linha] = await pool.query("SELECT status FROM vendas") as [Array<{ status: string }>, unknown];
    expect(linha[0]?.status).toBe("concluido");
    const [animal] = await pool.query("SELECT status FROM animais WHERE id = 101") as [Array<{ status: string }>, unknown];
    expect(animal[0]?.status).toBe("vendido");
  });

  it("banco fora do ar não confirma e não usa arquivo local", async () => {
    const poolFora = mysql.createPool({
      host: "127.0.0.1",
      port: 9,
      user: "root",
      password: "fechada",
      database: "fd_teste_nao_conectar",
      connectionLimit: 1,
    });
    const fora = drizzle(poolFora);
    const ioFora: IoVendaOperacao = {
      emTransacao(fn) {
        return fora.transaction((tx) => fn(consultas(tx)), { isolationLevel: "read committed" });
      },
    };
    await expect(confirmarVendaAutorizada(ioFora, {
      executorId: 2,
      sessionVersionDaSessao: 1,
      fazendaId: 10,
    }, async () => {
      throw new Error("não deveria gravar");
    })).rejects.toMatchObject({ message: "Banco de dados indisponível." });
    expect(await contar("vendas")).toBe(0);
    const fonte = readFileSync(new URL("./confirmarVendaFinanceiroMysql.ts", import.meta.url), "utf8");
    expect(fonte).not.toContain("localFallback");
    expect(fonte).not.toContain("estoque");
    await poolFora.end();
  });
});
