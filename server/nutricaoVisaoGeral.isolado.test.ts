import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { env } from "./_core/env";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import {
  definirBancoBatidasAntigas,
  listarBatidasAntigas,
  recusarCadastroBatidaAntiga,
  recusarExclusaoBatidaAntiga,
} from "./nutricaoBatidasAntigas";
import { definirBancoNutricaoBatidas } from "./nutricaoBatidas";
import { definirBancoNutricaoCochoLeituras, nutricaoCochoLeiturasService } from "./nutricaoCochoLeituras";
import { definirBancoNutricaoCochos } from "./nutricaoCochos";
import { definirBancoNutricaoDietas } from "./nutricaoDietas";
import { definirBancoNutricaoFornecimentos, nutricaoFornecimentosService } from "./nutricaoFornecimentos";
import {
  definirGanchoTravaLeitura,
  definirGanchoTravaPlano,
  MSG_NUTRICAO_FAZENDA,
  MSG_NUTRICAO_SEM_MYSQL,
  MSG_NUTRICAO_SEM_PERMISSAO,
  type SessaoNutricao,
} from "./nutricaoOperacaoAutorizada";
import { definirBancoNutricaoPlanejamento, nutricaoPlanejamentoService } from "./nutricaoPlanejamento";
import { definirBancoNutricaoVisaoGeral, nutricaoVisaoGeralService } from "./nutricaoVisaoGeral";
import { MSG_LEITURA_HORA, type NutricaoLeituraInput } from "../shared/nutricaoCochoLeituras";
import {
  MSG_BATIDA_ANTIGA_CADASTRO,
  MSG_BATIDA_ANTIGA_EXCLUSAO,
  MSG_BATIDA_ANTIGA_LISTA,
} from "../shared/nutricaoIdempotencia";
import type { NutricaoPlanInput } from "../shared/nutricaoPlanejamento";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bl-visao";
const PORTA = 3391;
const SENHA = "isolado-h4bl";
const BANCO = "fd_h4bl";
const HOJE = "2026-11-22";

const ESQUEMA = readFileSync(new URL("./nutricaoCochoLeituras.isolado.test.ts", import.meta.url), "utf8")
  .split("const ESQUEMA = `")[1]
  .split("`;")[0] + `
CREATE TABLE pesagens (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  peso decimal(8,2) NOT NULL, data date NOT NULL, observacoes text NULL,
  createdAt timestamp NULL, compraRecebimentoId int NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE batidas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, cochoId int NULL, dietaId int NULL,
  data date NOT NULL, quantidade decimal(8,2) NULL, responsavel varchar(200) NULL,
  observacoes text NULL, createdAt timestamp NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

type Banco = ReturnType<typeof drizzle<typeof schema>>;

function sessao(executorId: number, permissaoId: SessaoNutricao["permissaoId"], versao: number | null = 1): SessaoNutricao {
  return { executorId, sessionVersionDaSessao: versao, permissaoId };
}

function leitura(extra: Partial<NutricaoLeituraInput> = {}): NutricaoLeituraInput {
  return {
    fazendaId: 10, cochoId: 1, loteId: 1, data: HOJE, hora: "17:00", sobraKg: 20,
    chaveOperacao: `lei-${randomUUID()}`, ...extra,
  };
}

function periodo(fazendaId = 10) {
  return { fazendaId, de: HOJE, ate: HOJE, loteId: null as number | null };
}

function plano(extra: Partial<NutricaoPlanInput> = {}): NutricaoPlanInput {
  return {
    fazendaId: 10, loteId: 1, tipoOrigem: "produto", produtoId: 101,
    modalidadeMeta: "g_cab_dia", valorMeta: 100, frequencia: "diaria",
    dataInicio: "2026-11-01", nome: "Trato firme", ...extra,
  };
}

const pausa = (ms = 450) => new Promise((resolver) => setTimeout(resolver, ms));

async function texto(trabalho: Promise<unknown>) {
  try {
    await trabalho;
    return "ok";
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro);
  }
}

describe.sequential("visão geral e identidade da leitura no mysql descartável", () => {
  let pool: mysql.Pool;
  let banco: Banco;

  async function saldo(id = 1) {
    const [linhas] = await pool.query("SELECT quantidade FROM estoque WHERE id = ?", [id]);
    return Number((linhas as Array<{ quantidade: string }>)[0]?.quantidade);
  }

  async function contar(tabela: string) {
    const [linhas] = await pool.query(`SELECT COUNT(*) AS n FROM ${tabela}`);
    return Number((linhas as Array<{ n: number }>)[0]?.n);
  }

  async function donoLeitura(id: number) {
    const [linhas] = await pool.query(
      "SELECT userId, sobraKg, escore, observacoes, status FROM nutricao_cocho_leituras WHERE id = ?",
      [id],
    );
    return (linhas as Array<{ userId: number; sobraKg: string | null; escore: string | null; observacoes: string | null; status: string }>)[0];
  }

  async function inserirForn(extra: Record<string, string | number | null> = {}) {
    const v = {
      userId: 1, fazendaId: 10, loteId: 1, cochoId: 1, tipoOrigem: "produto", produtoId: 101,
      origemOperacional: "direta", batidaId: null as number | null, data: HOJE, hora: "12:00",
      quantidadeFornecidaKg: 10, populacaoSnapshot: 1, origemNomeSnapshot: "Milho",
      custoUnitarioSnapshot: 5, custoTotalSnapshot: 50, custoPorKgSnapshot: 5, custoCompleto: 1,
      status: "confirmado", ...extra,
    };
    const [res] = await pool.query(
      `INSERT INTO nutricao_fornecimentos
        (userId, fazendaId, loteId, cochoId, tipoOrigem, produtoId, origemOperacional, batidaId, data, hora,
         quantidadeFornecidaKg, populacaoSnapshot, origemNomeSnapshot, custoUnitarioSnapshot,
         custoTotalSnapshot, custoPorKgSnapshot, custoCompleto, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        v.userId, v.fazendaId, v.loteId, v.cochoId, v.tipoOrigem, v.produtoId, v.origemOperacional, v.batidaId,
        v.data, v.hora, v.quantidadeFornecidaKg, v.populacaoSnapshot, v.origemNomeSnapshot, v.custoUnitarioSnapshot,
        v.custoTotalSnapshot, v.custoPorKgSnapshot, v.custoCompleto, v.status,
      ],
    );
    return Number((res as { insertId: number }).insertId);
  }

  async function limpar() {
    definirGanchoTravaLeitura(null);
    definirGanchoTravaPlano(null);
    await pool.query("DELETE FROM nutricao_cocho_leituras");
    await pool.query("DELETE FROM nutricao_batida_ingredientes");
    await pool.query("DELETE FROM nutricao_batidas");
    await pool.query("DELETE FROM nutricao_fornecimento_ingredientes");
    await pool.query("DELETE FROM nutricao_fornecimentos");
    await pool.query("DELETE FROM estoque_movimentacoes");
    await pool.query("DELETE FROM nutricao_planejamentos");
    await pool.query("DELETE FROM nutricao_cochos");
    await pool.query("DELETE FROM batidas");
    await pool.query("UPDATE estoque SET quantidade = 100, valor_unitario = 5 WHERE id = 1");
    await pool.query("UPDATE users SET sessionVersion = 1");
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'nutricao.visualizar', 1), (2, 1, 'nutricao.criar', 1), (2, 1, 'nutricao.editar', 1),
        (2, 1, 'nutricao.cancelar', 1), (2, 1, 'nutricao.confirmar', 1), (2, 1, 'nutricao.estornar', 1),
        (2, 1, 'nutricao.inativar', 1), (4, 1, 'nutricao.visualizar', 1),
        (5, 1, 'nutricao.visualizar', 1), (5, 1, 'nutricao.criar', 1)
    `);
    await pool.query("DELETE FROM usuario_fazendas");
    await pool.query(`
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
        (2, 10, 1), (2, 20, 1), (4, 10, 1), (5, 10, 1), (6, 10, 1)
    `);
    await pool.query(`
      INSERT INTO nutricao_cochos (id, userId, fazendaId, nome, codigo, tipo, pastoId, coberto, status) VALUES
        (1, 1, 10, 'Cocho Norte', 'CN-1', 'racao_dieta', 1, 0, 'ativo'),
        (2, 1, 20, 'Cocho Sul', 'CS-1', 'racao_dieta', NULL, 0, 'ativo'),
        (3, 3, 30, 'Cocho Alheio', 'CA-1', 'racao_dieta', 3, 0, 'ativo')
    `);
  }

  function usar(alvo: Banco | null) {
    definirBancoNutricaoVisaoGeral(alvo);
    definirBancoNutricaoCochoLeituras(alvo);
    definirBancoNutricaoCochos(alvo);
    definirBancoNutricaoFornecimentos(alvo);
    definirBancoNutricaoPlanejamento(alvo);
    definirBancoNutricaoDietas(alvo);
    definirBancoNutricaoBatidas(alvo);
    definirBancoBatidasAntigas(alvo);
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
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
          multipleStatements: true,
        });
        await conn.query("SELECT 1 AS ok");
        await conn.query(ESQUEMA);
        await conn.query(`
          INSERT INTO users (id, openId, name, role, papel, titularUserId, situacao, sessionVersion) VALUES
            (1, 'p1', 'Principal', 'user', 'principal', 1, 'ativo', 1),
            (2, 'f2', 'Ambos', 'user', 'comum', 1, 'ativo', 1),
            (3, 'p3', 'Outro', 'user', 'principal', 3, 'ativo', 1),
            (4, 'f4', 'Olho', 'user', 'comum', 1, 'ativo', 1),
            (5, 'f5', 'Uma', 'user', 'comum', 1, 'ativo', 1),
            (6, 'f6', 'Nada', 'user', 'comum', 1, 'ativo', 1);
          INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Norte'), (20, 1, 'Sul'), (30, 3, 'Alheia');
          INSERT INTO pastos (id, userId, fazendaId, nome) VALUES
            (1, 1, 10, 'Pasto Norte'), (2, 1, 10, 'Pasto Fundo'), (3, 3, 30, 'Pasto Alheio');
          INSERT INTO lotes (id, userId, nome, fazendaId, ativo) VALUES
            (1, 1, 'Lote Norte', 10, 1), (2, 1, 'Lote Sul', 20, 1), (3, 3, 'Lote Alheio', 30, 1);
          INSERT INTO animais (id, userId, sexo, status, loteId) VALUES (1, 1, 'femea', 'ativo', 1);
          INSERT INTO estoque (id, produto_id, fazenda_id, nome, unidade, quantidade, controlar_saldo, situacao, valor_unitario) VALUES
            (1, 101, 10, 'Milho', 'kg', 100, 1, 'ativo', 5),
            (2, 202, 20, 'Soja Sul', 'kg', 40, 1, 'ativo', 3),
            (3, 303, 30, 'Soja Alheia', 'kg', 7, 1, 'ativo', 9);
        `);
        await conn.end();
        pool = mysql.createPool({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, connectionLimit: 8,
        });
        banco = drizzle(pool, { schema, mode: "default" });
        usar(banco);
        return;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await pausa(1500);
      }
    }
    throw new Error(ultimo || "MySQL descartável não subiu.");
  }, 120_000);

  afterAll(async () => {
    definirGanchoTravaLeitura(null);
    definirGanchoTravaPlano(null);
    usar(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  it("contrato da visão geral separa erro, zero e tela antiga", () => {
    const page = readFileSync(new URL("../client/src/pages/NutricaoVisaoGeralPage.tsx", import.meta.url), "utf8");
    const router = readFileSync(new URL("./nutricaoVisaoGeralRouter.ts", import.meta.url), "utf8");
    const src = readFileSync(new URL("./nutricaoVisaoGeral.ts", import.meta.url), "utf8");
    const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    const antiga = readFileSync(new URL("../client/src/pages/SuppliesManagementPage.tsx", import.meta.url), "utf8");
    const rotas = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    expect(page).toContain("isError");
    expect(page).toContain("A Visão Geral não pôde ser carregada.");
    expect(page).toContain("Quantidade fornecida");
    expect(page).toContain("Consumo aparente");
    expect(page).not.toMatch(/GMD|consumo real/i);
    expect(router).toContain('sessaoDe(ctx.user, "nutricao.visualizar")');
    expect(src).toContain("resolverDonoNutricao");
    expect(src).not.toMatch(/insert\(|update\(|delete\(|debitarEstoque|creditarEstoque/);
    expect(app).not.toContain("SuppliesManagementPage");
    expect(antiga).toContain("nutricao.listBatidas");
    expect(antiga).toContain("nutricao.createBatida");
    expect(antiga).toContain("nutricao.deleteBatida");
    expect(rotas).toContain("recusarCadastroBatidaAntiga");
    expect(rotas).toContain("recusarExclusaoBatidaAntiga");
    expect(rotas).toContain("listarBatidasAntigas");
  });

  it("escore diferente abre outra leitura", async () => {
    await limpar();
    const baixa = await nutricaoCochoLeiturasService.criar(2, leitura({ escore: "baixo" }), HOJE, sessao(2, "nutricao.criar"));
    const alta = await nutricaoCochoLeiturasService.criar(2, leitura({ escore: "alto" }), HOJE, sessao(2, "nutricao.criar"));
    expect(baixa.repetido).toBe(false);
    expect(alta.repetido).toBe(false);
    expect(alta.id).not.toBe(baixa.id);
    expect(await contar("nutricao_cocho_leituras")).toBe(2);
    expect((await donoLeitura(baixa.id)).userId).toBe(1);
    expect((await donoLeitura(alta.id)).escore).toBe("alto");
  });

  it("sobra e observação diferentes abrem outra leitura", async () => {
    await limpar();
    const primeira = await nutricaoCochoLeiturasService.criar(
      2, leitura({ observacoes: "chuva" }), HOJE, sessao(2, "nutricao.criar"),
    );
    const outraSobra = await nutricaoCochoLeiturasService.criar(
      2, leitura({ observacoes: "chuva", sobraKg: 21 }), HOJE, sessao(2, "nutricao.criar"),
    );
    const outraNota = await nutricaoCochoLeiturasService.criar(
      2, leitura({ observacoes: "sol", hora: "18:00" }), HOJE, sessao(2, "nutricao.criar"),
    );
    expect(outraSobra.id).not.toBe(primeira.id);
    expect(outraNota.id).not.toBe(primeira.id);
    expect(await contar("nutricao_cocho_leituras")).toBe(3);
  });

  it("espaço, vazio, hora e decimal igual não abrem outra linha", async () => {
    await limpar();
    const chave = `lei-${randomUUID()}`;
    const primeira = await nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: chave, observacoes: "  chuva  ", escore: "  baixo  ", sobraKg: 20 }), HOJE, sessao(2, "nutricao.criar"),
    );
    const igual = await nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: chave, observacoes: "chuva", escore: "baixo", sobraKg: 20.0, hora: " 17:00 " }), HOJE, sessao(2, "nutricao.criar"),
    );
    expect(igual.id).toBe(primeira.id);
    expect(igual.repetido).toBe(true);
    expect(await texto(nutricaoCochoLeiturasService.criar(
      2, leitura({ observacoes: "chuva", escore: "baixo", hora: "17:00:00" }), HOJE, sessao(2, "nutricao.criar"),
    ))).toBe(MSG_LEITURA_HORA);
    const chaveTarde = `lei-${randomUUID()}`;
    const vazia = await nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: chaveTarde, hora: "19:00", observacoes: "   " }), HOJE, sessao(2, "nutricao.criar"),
    );
    const nula = await nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: chaveTarde, hora: "19:00" }), HOJE, sessao(2, "nutricao.criar"),
    );
    expect(nula.id).toBe(vazia.id);
    expect(await contar("nutricao_cocho_leituras")).toBe(2);
  });

  it("dois reenvios iguais ao mesmo tempo ficam numa leitura só", async () => {
    await limpar();
    const chave = `lei-${randomUUID()}`;
    let segunda: Promise<{ id: number; repetido?: boolean }> = Promise.resolve({ id: 0 });
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      segunda = nutricaoCochoLeiturasService.criar(2, leitura({ chaveOperacao: chave }), HOJE, sessao(2, "nutricao.criar"));
      await pausa();
      expect(await contar("nutricao_cocho_leituras")).toBe(0);
    });
    const primeira = await nutricaoCochoLeiturasService.criar(2, leitura({ chaveOperacao: chave }), HOJE, sessao(2, "nutricao.criar"));
    const outra = await segunda;
    definirGanchoTravaLeitura(null);
    expect(outra.id).toBe(primeira.id);
    expect(outra.repetido).toBe(true);
    expect(await contar("nutricao_cocho_leituras")).toBe(1);
    expect((await donoLeitura(primeira.id)).userId).toBe(1);
  }, 20_000);

  it("dois escores diferentes ao mesmo tempo abrem duas leituras", async () => {
    await limpar();
    let segunda: Promise<{ id: number }> = Promise.resolve({ id: 0 });
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      segunda = nutricaoCochoLeiturasService.criar(2, leitura({ escore: "alto" }), HOJE, sessao(2, "nutricao.criar"));
      await pausa();
      expect(await contar("nutricao_cocho_leituras")).toBe(0);
    });
    const primeira = await nutricaoCochoLeiturasService.criar(
      2, leitura({ escore: "baixo" }), HOJE, sessao(2, "nutricao.criar"),
    );
    const outra = await segunda;
    definirGanchoTravaLeitura(null);
    expect(outra.id).not.toBe(primeira.id);
    expect(await contar("nutricao_cocho_leituras")).toBe(2);
  }, 20_000);

  it("duas leituras iguais com chaves diferentes ficam separadas", async () => {
    await limpar();
    const primeira = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    const segunda = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    expect(segunda.id).not.toBe(primeira.id);
    expect(segunda.repetido).toBe(false);
    expect(await contar("nutricao_cocho_leituras")).toBe(2);
  });

  it("leitura cancelada não impede outra igual", async () => {
    await limpar();
    const primeira = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    await nutricaoCochoLeiturasService.cancelar(2, primeira.id, sessao(2, "nutricao.cancelar"));
    const nova = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    expect(nova.id).not.toBe(primeira.id);
    expect((await donoLeitura(primeira.id)).status).toBe("cancelada");
    expect((await donoLeitura(nova.id)).status).toBe("ativa");
    expect(await contar("nutricao_cocho_leituras")).toBe(2);
  });

  it("reenvio da mesma chave depois da edição não abre outra linha", async () => {
    await limpar();
    const chave = `lei-${randomUUID()}`;
    const primeira = await nutricaoCochoLeiturasService.criar(
      2, leitura({ sobraKg: 20, chaveOperacao: chave }), HOJE, sessao(2, "nutricao.criar"),
    );
    let reenvio: Promise<{ id: number; repetido?: boolean }> = Promise.resolve({ id: 0 });
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      reenvio = nutricaoCochoLeiturasService.criar(
        2, leitura({ sobraKg: 20, chaveOperacao: chave }), HOJE, sessao(2, "nutricao.criar"),
      );
      await pausa();
      expect(Number((await donoLeitura(primeira.id)).sobraKg)).toBe(20);
      expect(await contar("nutricao_cocho_leituras")).toBe(1);
    });
    await nutricaoCochoLeiturasService.editar(2, primeira.id, leitura({ sobraKg: 5 }), HOJE, sessao(2, "nutricao.editar"));
    const deNovo = await reenvio;
    definirGanchoTravaLeitura(null);
    expect(deNovo.id).toBe(primeira.id);
    expect(deNovo.repetido).toBe(true);
    expect(Number((await donoLeitura(primeira.id)).sobraKg)).toBe(5);
    expect(await contar("nutricao_cocho_leituras")).toBe(1);
  }, 20_000);

  it("funcionário vê o total do titular na fazenda concedida", async () => {
    await limpar();
    await inserirForn();
    const painel = await nutricaoVisaoGeralService.carregar(2, periodo(), HOJE, sessao(2, "nutricao.visualizar"));
    expect(painel.vazio).toBe(false);
    expect(painel.cards.kgFornecido).toBe(10);
    expect(painel.cards.custoConhecido).toBe(50);
    const [linhas] = await pool.query("SELECT userId FROM nutricao_fornecimentos");
    expect((linhas as Array<{ userId: number }>)[0].userId).toBe(1);
  });

  it("funcionário sem permissão não vê a visão geral", async () => {
    await limpar();
    await inserirForn();
    expect(await texto(nutricaoVisaoGeralService.carregar(6, periodo(), HOJE, sessao(6, "nutricao.visualizar"))))
      .toBe(MSG_NUTRICAO_SEM_PERMISSAO);
    expect(await texto(nutricaoVisaoGeralService.carregar(4, periodo(20), HOJE, sessao(4, "nutricao.visualizar"))))
      .toBe(MSG_NUTRICAO_FAZENDA);
  });

  it("fazenda não concedida não vira zero", async () => {
    await limpar();
    await inserirForn({ fazendaId: 20, loteId: 2, cochoId: 2, quantidadeFornecidaKg: 80, custoTotalSnapshot: 400 });
    const recusa = await texto(nutricaoVisaoGeralService.carregar(5, periodo(20), HOJE, sessao(5, "nutricao.visualizar")));
    expect(recusa).toBe(MSG_NUTRICAO_FAZENDA);
    expect(recusa).not.toBe("ok");
  });

  it("outra conta não entra no total", async () => {
    await limpar();
    await inserirForn();
    await inserirForn({
      userId: 3, fazendaId: 30, loteId: 3, cochoId: 3, quantidadeFornecidaKg: 999, custoTotalSnapshot: 999,
    });
    expect(await texto(nutricaoVisaoGeralService.carregar(3, periodo(), HOJE, sessao(3, "nutricao.visualizar"))))
      .toBe("Registro não encontrado.");
    const painel = await nutricaoVisaoGeralService.carregar(2, periodo(), HOJE, sessao(2, "nutricao.visualizar"));
    expect(painel.cards.kgFornecido).toBe(10);
    expect(painel.cards.custoConhecido).toBe(50);
    expect(JSON.stringify(painel)).not.toContain("999");
  });

  it("estorno, fazenda vizinha e histórico do funcionário ficam fora da soma", async () => {
    await limpar();
    await inserirForn({ quantidadeFornecidaKg: 10, custoTotalSnapshot: 50 });
    await inserirForn({ quantidadeFornecidaKg: 30, custoTotalSnapshot: 99, status: "estornado" });
    await inserirForn({ fazendaId: 20, loteId: 2, cochoId: 2, quantidadeFornecidaKg: 80, custoTotalSnapshot: 400 });
    await inserirForn({ userId: 2, quantidadeFornecidaKg: 70, custoTotalSnapshot: 700 });
    const painel = await nutricaoVisaoGeralService.carregar(2, periodo(), HOJE, sessao(2, "nutricao.visualizar"));
    expect(painel.cards.kgFornecido).toBe(10);
    expect(painel.cards.custoConhecido).toBe(50);
    const [historico] = await pool.query("SELECT userId, quantidadeFornecidaKg FROM nutricao_fornecimentos WHERE userId = 2");
    expect(Number((historico as Array<{ quantidadeFornecidaKg: string }>)[0].quantidadeFornecidaKg)).toBe(70);
    const sul = await nutricaoVisaoGeralService.carregar(2, periodo(20), HOJE, sessao(2, "nutricao.visualizar"));
    expect(sul.cards.kgFornecido).toBe(80);
    expect(sul.cards.custoConhecido).toBe(400);
  });

  it("batida e trato da batida não viram duas despesas", async () => {
    await limpar();
    const [bat] = await pool.query(
      `INSERT INTO nutricao_batidas
        (userId, fazendaId, dietaId, data, quantidadePreparadaKg, dietaNomeSnapshot, custoTotalSnapshot, custoCompleto, status)
       VALUES (1, 10, 1, ?, 10, 'Ração', 80, 1, 'confirmado')`,
      [HOJE],
    );
    const batidaId = Number((bat as { insertId: number }).insertId);
    await pool.query(
      `INSERT INTO nutricao_batidas
        (userId, fazendaId, dietaId, data, quantidadePreparadaKg, dietaNomeSnapshot, custoTotalSnapshot, custoCompleto, status)
       VALUES (1, 10, 1, ?, 50, 'Ração velha', 200, 1, 'estornado')`,
      [HOJE],
    );
    await inserirForn({
      origemOperacional: "batida", batidaId, quantidadeFornecidaKg: 4, custoTotalSnapshot: 20, custoPorKgSnapshot: 5,
    });
    const painel = await nutricaoVisaoGeralService.carregar(2, periodo(), HOJE, sessao(2, "nutricao.visualizar"));
    expect(painel.cards.kgFornecido).toBe(4);
    expect(painel.cards.custoConhecido).toBe(20);
    expect(painel.batidasSaldo).toHaveLength(1);
    expect(painel.batidasSaldo[0]).toMatchObject({ preparadaKg: 10, distribuidaKg: 4, saldoKg: 6 });
    expect(await saldo()).toBe(100);
    expect(await contar("estoque_movimentacoes")).toBe(0);
  });

  it("leitura cancelada não entra no consumo aparente", async () => {
    await limpar();
    await inserirForn({ quantidadeFornecidaKg: 10, hora: "12:00" });
    await nutricaoCochoLeiturasService.criar(2, leitura({ hora: "08:00", sobraKg: 30 }), HOJE, sessao(2, "nutricao.criar"));
    const tarde = await nutricaoCochoLeiturasService.criar(2, leitura({ hora: "17:00", sobraKg: 10 }), HOJE, sessao(2, "nutricao.criar"));
    const cancelada = await nutricaoCochoLeiturasService.criar(
      2, leitura({ hora: "18:00", sobraKg: 0 }), HOJE, sessao(2, "nutricao.criar"),
    );
    await nutricaoCochoLeiturasService.cancelar(2, cancelada.id, sessao(2, "nutricao.cancelar"));
    const painel = await nutricaoVisaoGeralService.carregar(2, periodo(), HOJE, sessao(2, "nutricao.visualizar"));
    expect(painel.consumo.totalAparenteKg).toBe(30);
    expect(painel.consumo.linhas.some(l => l.leituraId === cancelada.id)).toBe(false);
    expect(painel.consumo.linhas.some(l => l.leituraId === tarde.id && l.consumoAparenteKg === 30)).toBe(true);
    expect((await donoLeitura(cancelada.id)).status).toBe("cancelada");
  });

  it("fazenda autorizada sem movimento fica vazia de verdade", async () => {
    await limpar();
    const vazia = await nutricaoVisaoGeralService.carregar(2, periodo(20), HOJE, sessao(2, "nutricao.visualizar"));
    expect(vazia.vazio).toBe(true);
    expect(vazia.cards.kgFornecido).toBe(0);
    expect(vazia.cards.custoConhecido).toBe(0);
    expect(vazia.mensagemVazio).toBeTruthy();
  });

  it("consulta espera a confirmação do trato e depois mostra o quilo", async () => {
    await limpar();
    const prescricao = await nutricaoPlanejamentoService.criar(1, plano(), HOJE, sessao(1, "nutricao.criar"));
    let consulta: Promise<{ cards: { kgFornecido: number; custoConhecido: number | null } }> = Promise.resolve({
      cards: { kgFornecido: -1, custoConhecido: null },
    });
    definirGanchoTravaPlano(async () => {
      definirGanchoTravaPlano(null);
      consulta = nutricaoVisaoGeralService.carregar(2, periodo(), HOJE, sessao(2, "nutricao.visualizar"));
      await pausa(500);
      expect(await saldo()).toBe(100);
      expect(await contar("nutricao_fornecimentos")).toBe(0);
    });
    await nutricaoFornecimentosService.confirmar(2, "Ambos", {
      fazendaId: 10, loteId: 1, planejamentoId: prescricao.id, tipoOrigem: "produto", produtoId: 101,
      data: HOJE, quantidadeFornecidaKg: 10, chaveOperacao: `forn-${randomUUID()}`,
    }, HOJE, sessao(2, "nutricao.confirmar"));
    const painel = await consulta;
    definirGanchoTravaPlano(null);
    expect(await saldo()).toBe(90);
    expect(painel.cards.kgFornecido).toBe(10);
    expect(painel.cards.custoConhecido).toBe(50);
  }, 20_000);

  it("consulta espera o estorno e o quilo some do total", async () => {
    await limpar();
    const prescricao = await nutricaoPlanejamentoService.criar(1, plano(), HOJE, sessao(1, "nutricao.criar"));
    const confirmado = await nutricaoFornecimentosService.confirmar(2, "Ambos", {
      fazendaId: 10, loteId: 1, planejamentoId: prescricao.id, tipoOrigem: "produto", produtoId: 101,
      data: HOJE, quantidadeFornecidaKg: 10, chaveOperacao: `forn-${randomUUID()}`,
    }, HOJE, sessao(2, "nutricao.confirmar"));
    let consulta: Promise<{ cards: { kgFornecido: number; custoConhecido: number | null } }> = Promise.resolve({
      cards: { kgFornecido: -1, custoConhecido: null },
    });
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      consulta = nutricaoVisaoGeralService.carregar(2, periodo(), HOJE, sessao(2, "nutricao.visualizar"));
      await pausa(500);
      expect(await saldo()).toBe(90);
      const [status] = await pool.query("SELECT status FROM nutricao_fornecimentos WHERE id = ?", [confirmado.id]);
      expect((status as Array<{ status: string }>)[0].status).toBe("confirmado");
    });
    await nutricaoFornecimentosService.estornar(
      2, "Ambos", { id: confirmado.id, motivo: "erro de campo" }, HOJE, sessao(2, "nutricao.estornar"),
    );
    const painel = await consulta;
    definirGanchoTravaLeitura(null);
    expect(painel.cards.kgFornecido).toBe(0);
    expect(painel.cards.custoConhecido).toBe(0);
    expect(await saldo()).toBe(100);
    const [status] = await pool.query("SELECT status, quantidadeFornecidaKg FROM nutricao_fornecimentos WHERE id = ?", [confirmado.id]);
    expect((status as Array<{ status: string; quantidadeFornecidaKg: string }>)[0]).toMatchObject({
      status: "estornado", quantidadeFornecidaKg: "10.000",
    });
  }, 20_000);

  it("consulta espera o encerramento do planejamento", async () => {
    await limpar();
    const prescricao = await nutricaoPlanejamentoService.criar(1, plano(), HOJE, sessao(1, "nutricao.criar"));
    let consulta: Promise<{ vazio: boolean }> = Promise.resolve({ vazio: true });
    definirGanchoTravaPlano(async () => {
      definirGanchoTravaPlano(null);
      consulta = nutricaoVisaoGeralService.carregar(2, periodo(), HOJE, sessao(2, "nutricao.visualizar"));
      await pausa();
      const [status] = await pool.query("SELECT status FROM nutricao_planejamentos WHERE id = ?", [prescricao.id]);
      expect((status as Array<{ status: string }>)[0].status).toBe("ativo");
    });
    await nutricaoPlanejamentoService.encerrar(2, prescricao.id, HOJE, sessao(2, "nutricao.inativar"));
    const painel = await consulta;
    definirGanchoTravaPlano(null);
    expect(painel.vazio).toBe(false);
    const [status] = await pool.query("SELECT status, userId FROM nutricao_planejamentos WHERE id = ?", [prescricao.id]);
    expect((status as Array<{ status: string; userId: number }>)[0]).toMatchObject({ status: "encerrado", userId: 1 });
  }, 20_000);

  it("permissão, fazenda e sessão revogadas fecham a consulta seguinte", async () => {
    await limpar();
    await inserirForn();
    const antes = await nutricaoVisaoGeralService.carregar(2, periodo(), HOJE, sessao(2, "nutricao.visualizar"));
    expect(antes.cards.kgFornecido).toBe(10);
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = 'nutricao.visualizar'");
    expect(await texto(nutricaoVisaoGeralService.carregar(2, periodo(), HOJE, sessao(2, "nutricao.visualizar"))))
      .toBe(MSG_NUTRICAO_SEM_PERMISSAO);
    await limpar();
    await inserirForn();
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 10");
    expect(await texto(nutricaoVisaoGeralService.carregar(2, periodo(), HOJE, sessao(2, "nutricao.visualizar"))))
      .toBe(MSG_NUTRICAO_FAZENDA);
    await limpar();
    await inserirForn();
    await pool.query("UPDATE users SET sessionVersion = 2 WHERE id = 2");
    expect(await texto(nutricaoVisaoGeralService.carregar(2, periodo(), HOJE, sessao(2, "nutricao.visualizar"))))
      .toBe("Sessão inválida.");
    const [linhas] = await pool.query("SELECT quantidadeFornecidaKg FROM nutricao_fornecimentos");
    expect(Number((linhas as Array<{ quantidadeFornecidaKg: string }>)[0].quantidadeFornecidaKg)).toBe(10);
  });

  it("mysql indisponível não devolve arquivo local", async () => {
    await limpar();
    await inserirForn();
    const fechado = mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada",
      database: "fd_teste_nao_conectar", connectionLimit: 1,
    });
    const falso = drizzle(fechado, { schema, mode: "default" });
    usar(falso);
    try {
      expect(await texto(nutricaoVisaoGeralService.carregar(2, periodo(), HOJE, sessao(2, "nutricao.visualizar"))))
        .toBe(MSG_NUTRICAO_SEM_MYSQL);
      expect(await texto(listarBatidasAntigas(sessao(1, "nutricao.visualizar"))))
        .toBe(MSG_NUTRICAO_SEM_MYSQL);
    } finally {
      usar(banco);
      await fechado.end();
    }
    const painel = await nutricaoVisaoGeralService.carregar(2, periodo(), HOJE, sessao(2, "nutricao.visualizar"));
    expect(painel.cards.kgFornecido).toBe(10);
  });

  it("lista antiga só o titular vê a própria conta", async () => {
    await limpar();
    await pool.query(
      "INSERT INTO batidas (userId, data, quantidade, responsavel, observacoes) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)",
      [1, HOJE, 12.5, "Titular", "antiga", 2, HOJE, 8, "Funcionário", "não transferir", 3, HOJE, 99, "Outro", "alheia"],
    );
    const lista = await listarBatidasAntigas(sessao(1, "nutricao.visualizar"));
    expect(lista).toHaveLength(1);
    expect(lista[0]?.userId).toBe(1);
    expect(Number(lista[0]?.quantidade)).toBe(12.5);
    expect(await texto(listarBatidasAntigas(sessao(2, "nutricao.visualizar")))).toBe(MSG_BATIDA_ANTIGA_LISTA);
    const doOutro = await listarBatidasAntigas(sessao(3, "nutricao.visualizar"));
    expect(doOutro).toHaveLength(1);
    expect(doOutro[0]?.userId).toBe(3);
    await pool.query("UPDATE users SET sessionVersion = 9 WHERE id = 1");
    expect(await texto(listarBatidasAntigas(sessao(1, "nutricao.visualizar")))).toBe("Sessão inválida.");
    const [todas] = await pool.query("SELECT COUNT(*) AS n FROM batidas");
    expect(Number((todas as Array<{ n: number }>)[0].n)).toBe(3);
  });

  it("cadastro e exclusão antigos continuam bloqueados", async () => {
    await limpar();
    await pool.query("INSERT INTO batidas (userId, data, quantidade) VALUES (1, ?, 3)", [HOJE]);
    expect(await texto(Promise.resolve().then(() => recusarCadastroBatidaAntiga()))).toBe(MSG_BATIDA_ANTIGA_CADASTRO);
    expect(await texto(Promise.resolve().then(() => recusarExclusaoBatidaAntiga()))).toBe(MSG_BATIDA_ANTIGA_EXCLUSAO);
    expect(await contar("batidas")).toBe(1);
    expect(await contar("estoque_movimentacoes")).toBe(0);
    expect(await saldo()).toBe(100);
  });
});
