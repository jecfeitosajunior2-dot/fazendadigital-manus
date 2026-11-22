import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { chaveLeituraPendente, concluirLeituraPendente } from "../client/src/lib/operacaoLeituraCocho";
import {
  conteudoCanonicoLeitura,
  decidirChaveNutricao,
  MSG_NUTRICAO_CHAVE_DIFERENTE,
  MSG_NUTRICAO_CHAVE_INVALIDA,
  MSG_NUTRICAO_SEM_IDEMPOTENCIA,
} from "../shared/nutricaoIdempotencia";
import { MSG_LEITURA_COCHO_INATIVO, MSG_LEITURA_FORN_ESTORNADO, MSG_LEITURA_HORA, type NutricaoLeituraInput } from "../shared/nutricaoCochoLeituras";
import { env } from "./_core/env";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { definirBancoNutricaoCochoLeituras, nutricaoCochoLeiturasService } from "./nutricaoCochoLeituras";
import { definirBancoNutricaoCochos, nutricaoCochosService } from "./nutricaoCochos";
import { definirBancoNutricaoFornecimentos, nutricaoFornecimentosService } from "./nutricaoFornecimentos";
import {
  definirGanchoTravaLeitura,
  MSG_NUTRICAO_FAZENDA,
  MSG_NUTRICAO_SEM_MYSQL,
  MSG_NUTRICAO_SEM_PERMISSAO,
  type SessaoNutricao,
} from "./nutricaoOperacaoAutorizada";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bm-leitura";
const PORTA = 3392;
const SENHA = "isolado-h4bm";
const BANCO = "fd_h4bm";
const HOJE = "2026-11-22";
const ESQUEMA = readFileSync(new URL("./nutricaoCochoLeituras.isolado.test.ts", import.meta.url), "utf8")
  .split("const ESQUEMA = `")[1]
  .split("`;")[0];
const PROPOSTA = readFileSync(new URL("../drizzle/propostas/0074_nutricao_leitura_idempotencia.sql", import.meta.url), "utf8")
  .split("\n")
  .filter((linha) => !linha.trim().startsWith("--"))
  .join("\n");

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

const pausa = (ms = 450) => new Promise((resolver) => setTimeout(resolver, ms));

async function texto(trabalho: Promise<unknown>) {
  try {
    await trabalho;
    return "ok";
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro);
  }
}

describe.sequential("idempotência da leitura de cocho", () => {
  let pool: mysql.Pool;
  let banco: Banco;

  async function saldo() {
    const [linhas] = await pool.query("SELECT quantidade FROM estoque WHERE id = 1");
    return Number((linhas as Array<{ quantidade: string }>)[0]?.quantidade);
  }

  async function contar() {
    const [linhas] = await pool.query("SELECT COUNT(*) AS n FROM nutricao_cocho_leituras");
    return Number((linhas as Array<{ n: number }>)[0]?.n);
  }

  async function porChave(chave: string) {
    const [linhas] = await pool.query(
      "SELECT id, userId, fazendaId, sobraKg, escore, status, conteudoHash, chaveOperacao FROM nutricao_cocho_leituras WHERE chaveOperacao = ?",
      [chave],
    );
    return linhas as Array<{
      id: number; userId: number; fazendaId: number; sobraKg: string | null;
      escore: string | null; status: string; conteudoHash: string; chaveOperacao: string;
    }>;
  }

  async function limpar() {
    definirGanchoTravaLeitura(null);
    await pool.query("DELETE FROM nutricao_cocho_leituras");
    await pool.query("DELETE FROM nutricao_fornecimentos");
    await pool.query("DELETE FROM estoque_movimentacoes");
    await pool.query("DELETE FROM nutricao_cochos");
    await pool.query("UPDATE estoque SET quantidade = 100 WHERE id = 1");
    await pool.query("UPDATE users SET sessionVersion = 1");
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'nutricao.visualizar', 1), (2, 1, 'nutricao.criar', 1), (2, 1, 'nutricao.editar', 1),
        (2, 1, 'nutricao.cancelar', 1), (2, 1, 'nutricao.inativar', 1), (2, 1, 'nutricao.estornar', 1),
        (4, 1, 'nutricao.visualizar', 1),
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
        (4, 1, 10, 'Cocho Extra', 'CE', 'racao_dieta', NULL, 0, 'ativo'),
        (3, 3, 30, 'Cocho Alheio', 'CA-1', 'racao_dieta', 3, 0, 'ativo')
    `);
  }

  async function restaurarColunas() {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME AS nome FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nutricao_cocho_leituras'
         AND COLUMN_NAME IN ('chaveOperacao', 'conteudoHash')`,
    );
    const nomes = new Set((cols as Array<{ nome: string }>).map((c) => c.nome));
    if (!nomes.has("chaveOperacao")) {
      await pool.query("ALTER TABLE nutricao_cocho_leituras ADD COLUMN chaveOperacao varchar(80) NULL");
    } else {
      await pool.query("ALTER TABLE nutricao_cocho_leituras MODIFY chaveOperacao varchar(80) NULL");
    }
    if (!nomes.has("conteudoHash")) {
      await pool.query("ALTER TABLE nutricao_cocho_leituras ADD COLUMN conteudoHash varchar(64) NULL");
    }
    const [idx] = await pool.query(
      `SELECT INDEX_NAME AS nome FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nutricao_cocho_leituras'
         AND INDEX_NAME = 'nutricao_cocho_leituras_user_chave_uq'`,
    );
    if ((idx as unknown[]).length === 0) {
      await pool.query(
        "CREATE UNIQUE INDEX nutricao_cocho_leituras_user_chave_uq ON nutricao_cocho_leituras (userId, chaveOperacao)",
      );
    }
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
            (1, 1, 10, 'Pasto Norte'), (3, 3, 30, 'Pasto Alheio');
          INSERT INTO lotes (id, userId, nome, fazendaId, ativo) VALUES
            (1, 1, 'Lote Norte', 10, 1), (2, 1, 'Lote Sul', 20, 1), (3, 3, 'Lote Alheio', 30, 1);
          INSERT INTO estoque (id, produto_id, fazenda_id, nome, unidade, quantidade, controlar_saldo, situacao, valor_unitario) VALUES
            (1, 101, 10, 'Milho', 'kg', 100, 1, 'ativo', 5);
        `);
        await conn.end();
        pool = mysql.createPool({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, connectionLimit: 8,
        });
        banco = drizzle(pool, { schema, mode: "default" });
        definirBancoNutricaoCochoLeituras(banco);
        definirBancoNutricaoCochos(banco);
        definirBancoNutricaoFornecimentos(banco);
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
    definirBancoNutricaoCochoLeituras(null);
    definirBancoNutricaoCochos(null);
    definirBancoNutricaoFornecimentos(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  it("a tela guarda a tentativa e o erro de rede não troca a chave", () => {
    const memoria = new Map<string, string>();
    const original = globalThis.sessionStorage;
    globalThis.sessionStorage = {
      getItem: (chave: string) => memoria.get(chave) ?? null,
      setItem: (chave: string, valor: string) => { memoria.set(chave, valor); },
      removeItem: (chave: string) => { memoria.delete(chave); },
      clear: () => memoria.clear(),
      key: () => null,
      length: 0,
    } as Storage;
    try {
      concluirLeituraPendente();
      const conteudo = conteudoCanonicoLeitura({
        fazendaId: 10, cochoId: 1, data: HOJE, sobraKg: 20, observacoes: "  chuva  ",
      });
      const igual = conteudoCanonicoLeitura({
        fazendaId: 10, cochoId: 1, data: HOJE, sobraKg: 20.0, observacoes: "chuva",
      });
      expect(conteudo).toBe(igual);
      const primeira = chaveLeituraPendente(conteudo);
      const reenvio = chaveLeituraPendente(conteudo);
      expect(reenvio.chave).toBe(primeira.chave);
      const mudou = chaveLeituraPendente(conteudoCanonicoLeitura({
        fazendaId: 10, cochoId: 1, data: HOJE, sobraKg: 5, observacoes: "chuva",
      }));
      expect(mudou.chave).not.toBe(primeira.chave);
      const deNovo = decidirChaveNutricao(
        { chave: primeira.chave, conteudo }, conteudo, "lei", () => "lei-22222222-2222-2222-2222-222222222222",
      );
      expect(deNovo.chave).toBe(primeira.chave);
      concluirLeituraPendente();
      const outra = chaveLeituraPendente(conteudo);
      expect(outra.chave).not.toBe(primeira.chave);
    } finally {
      concluirLeituraPendente();
      globalThis.sessionStorage = original;
    }
    const form = readFileSync(new URL("../client/src/pages/NutricaoCochoLeituraFormPage.tsx", import.meta.url), "utf8");
    const router = readFileSync(new URL("./nutricaoCochoLeiturasRouter.ts", import.meta.url), "utf8");
    expect(form).toContain("chaveLeituraPendente");
    expect(form).toContain("concluirLeituraPendente");
    expect(form).toContain("Esta leitura já estava registrada.");
    expect(form).toContain("Esta leitura já foi cancelada. Nada foi gravado de novo.");
    expect(form).toContain("Leitura registrada. Estoque não foi movimentado.");
    expect(form).toContain("onError: e => toast.error(e.message)");
    expect(router).toContain("chaveOperacao");
    expect(readFileSync(new URL("../drizzle/propostas/0074_nutricao_leitura_idempotencia.sql", import.meta.url), "utf8"))
      .toContain("nutricao_cocho_leituras_user_chave_uq");
  });

  it("hora inválida não vira ausência nem reaproveita a leitura sem hora", async () => {
    await limpar();
    const chave = `lei-${randomUUID()}`;
    const criada = await nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: chave, hora: null }), HOJE, sessao(2, "nutricao.criar"),
    );
    expect(await texto(nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: chave, hora: "17:00:00" }), HOJE, sessao(2, "nutricao.criar"),
    ))).toBe(MSG_LEITURA_HORA);
    expect(await texto(nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: chave, hora: "25:99" }), HOJE, sessao(2, "nutricao.criar"),
    ))).toBe(MSG_LEITURA_HORA);
    const deNovo = await nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: chave, hora: "   " }), HOJE, sessao(2, "nutricao.criar"),
    );
    expect(deNovo).toMatchObject({ id: criada.id, repetido: true });
    expect(await contar()).toBe(1);
    const [linha] = await pool.query("SELECT hora FROM nutricao_cocho_leituras WHERE id = ?", [criada.id]);
    expect((linha as Array<{ hora: string | null }>)[0].hora).toBeNull();
    expect(await texto(nutricaoCochoLeiturasService.criar(
      2, leitura({ hora: "25:99" }), HOJE, sessao(2, "nutricao.criar"),
    ))).toBe(MSG_LEITURA_HORA);
    expect(await contar()).toBe(1);
    expect(await saldo()).toBe(100);
  });

  it("duas leituras iguais com chaves diferentes ficam separadas", async () => {
    await limpar();
    const primeira = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    const segunda = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    expect(segunda.id).not.toBe(primeira.id);
    expect(segunda.repetido).toBe(false);
    expect(await contar()).toBe(2);
    expect(await saldo()).toBe(100);
  });

  it("a mesma chave ao mesmo tempo deixa uma leitura só", async () => {
    await limpar();
    const chave = `lei-${randomUUID()}`;
    let segunda: Promise<{ id: number; repetido: boolean }> = Promise.resolve({ id: 0, repetido: false });
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      segunda = nutricaoCochoLeiturasService.criar(2, leitura({ chaveOperacao: chave }), HOJE, sessao(2, "nutricao.criar"));
      await pausa();
      expect(await contar()).toBe(0);
    });
    const primeira = await nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: chave }), HOJE, sessao(2, "nutricao.criar"),
    );
    const outra = await segunda;
    definirGanchoTravaLeitura(null);
    expect(outra.id).toBe(primeira.id);
    expect(outra.repetido).toBe(true);
    expect(await contar()).toBe(1);
    expect((await porChave(chave))).toHaveLength(1);
    expect(await saldo()).toBe(100);
  }, 20_000);

  it("duas chaves diferentes e o mesmo conteúdo passam juntas", async () => {
    await limpar();
    let segunda: Promise<{ id: number }> = Promise.resolve({ id: 0 });
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      segunda = nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
      await pausa();
      expect(await contar()).toBe(0);
    });
    const primeira = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    const outra = await segunda;
    definirGanchoTravaLeitura(null);
    expect(outra.id).not.toBe(primeira.id);
    expect(await contar()).toBe(2);
  }, 20_000);

  it("a mesma chave com outro conteúdo é recusada e o índice impede a segunda gravação", async () => {
    await limpar();
    const chave = `lei-${randomUUID()}`;
    const primeira = await nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: chave, sobraKg: 20 }), HOJE, sessao(2, "nutricao.criar"),
    );
    const hash = (await porChave(chave))[0]?.conteudoHash;
    for (const extra of [
      { sobraKg: 21 },
      { escore: "alto" },
      { data: "2026-11-21" },
      { hora: "18:00" },
      { cochoId: 4 },
      { fazendaId: 20, cochoId: 2, loteId: 2 },
      { fornecimentoId: 1 },
    ]) {
      expect(await texto(nutricaoCochoLeiturasService.criar(
        2, leitura({ chaveOperacao: chave, ...extra }), HOJE, sessao(2, "nutricao.criar"),
      ))).toBe(MSG_NUTRICAO_CHAVE_DIFERENTE);
    }
    expect(await contar()).toBe(1);
    expect((await porChave(chave))[0]?.conteudoHash).toBe(hash);
    expect(Number((await porChave(chave))[0]?.sobraKg)).toBe(20);
    const a = await pool.getConnection();
    const b = await pool.getConnection();
    try {
      await a.beginTransaction();
      await b.beginTransaction();
      const [ia] = await a.query(
        "INSERT INTO nutricao_cocho_leituras (userId, fazendaId, cochoId, data, status) VALUES (1, 10, 1, ?, 'ativa')",
        [HOJE],
      );
      const [ib] = await b.query(
        "INSERT INTO nutricao_cocho_leituras (userId, fazendaId, cochoId, data, status) VALUES (1, 10, 1, ?, 'ativa')",
        [HOJE],
      );
      await a.query(
        "UPDATE nutricao_cocho_leituras SET chaveOperacao = ?, conteudoHash = ? WHERE id = ?",
        ["lei-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "a".repeat(64), (ia as { insertId: number }).insertId],
      );
      const segundaChave = b.query(
        "UPDATE nutricao_cocho_leituras SET chaveOperacao = ?, conteudoHash = ? WHERE id = ?",
        ["lei-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "b".repeat(64), (ib as { insertId: number }).insertId],
      );
      await a.commit();
      await expect(segundaChave).rejects.toMatchObject({ errno: 1062 });
      await b.rollback();
    } finally {
      a.release();
      b.release();
    }
    expect(await contar()).toBe(2);
    expect(primeira.id).toBeGreaterThan(0);
  }, 20_000);

  it("reenvio depois da edição conserva a sobra nova e o resumo original", async () => {
    await limpar();
    const chave = `lei-${randomUUID()}`;
    const criada = await nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: chave, sobraKg: 20 }), HOJE, sessao(2, "nutricao.criar"),
    );
    const hash = (await porChave(chave))[0]?.conteudoHash;
    await nutricaoCochoLeiturasService.editar(
      2, criada.id, leitura({ sobraKg: 5, observacoes: "corrigido" }), HOJE, sessao(2, "nutricao.editar"),
    );
    const reenvio = await nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: chave, sobraKg: 20 }), HOJE, sessao(2, "nutricao.criar"),
    );
    expect(reenvio).toMatchObject({ id: criada.id, repetido: true, status: "ativa" });
    expect(await contar()).toBe(1);
    const [linha] = await pool.query(
      "SELECT sobraKg, observacoes, conteudoHash, chaveOperacao FROM nutricao_cocho_leituras WHERE id = ?",
      [criada.id],
    );
    expect((linha as Array<{ sobraKg: string; observacoes: string; conteudoHash: string; chaveOperacao: string }>)[0])
      .toMatchObject({ sobraKg: "5.000", observacoes: "corrigido", conteudoHash: hash, chaveOperacao: chave });
  });

  it("reenvio depois do cancelamento não reativa nem abre outra linha", async () => {
    await limpar();
    const chave = `lei-${randomUUID()}`;
    const criada = await nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: chave }), HOJE, sessao(2, "nutricao.criar"),
    );
    await nutricaoCochoLeiturasService.cancelar(2, criada.id, sessao(2, "nutricao.cancelar"));
    const reenvio = await nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: chave }), HOJE, sessao(2, "nutricao.criar"),
    );
    expect(reenvio).toMatchObject({ id: criada.id, repetido: true, status: "cancelada" });
    expect(await contar()).toBe(1);
    const nova = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    expect(nova.id).not.toBe(criada.id);
    expect(nova.status).toBe("ativa");
    const [status] = await pool.query("SELECT status FROM nutricao_cocho_leituras WHERE id = ?", [criada.id]);
    expect((status as Array<{ status: string }>)[0].status).toBe("cancelada");
    expect(await saldo()).toBe(100);
  });

  it("a chave não autoriza quem perdeu fazenda, permissão ou sessão", async () => {
    await limpar();
    const chave = `lei-${randomUUID()}`;
    const criada = await nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: chave }), HOJE, sessao(2, "nutricao.criar"),
    );
    expect(await texto(nutricaoCochoLeiturasService.criar(
      5, leitura({ fazendaId: 20, cochoId: 2, loteId: 2, chaveOperacao: chave }), HOJE, sessao(5, "nutricao.criar"),
    ))).toBe(MSG_NUTRICAO_FAZENDA);
    expect(await texto(nutricaoCochoLeiturasService.criar(
      6, leitura({ chaveOperacao: chave }), HOJE, sessao(6, "nutricao.visualizar"),
    ))).toBe(MSG_NUTRICAO_SEM_PERMISSAO);
    expect(await texto(nutricaoCochoLeiturasService.criar(
      3, leitura({ chaveOperacao: chave }), HOJE, sessao(3, "nutricao.criar"),
    ))).toBe("Registro não encontrado.");
    const doOutro = await nutricaoCochoLeiturasService.criar(
      3, leitura({ fazendaId: 30, cochoId: 3, loteId: 3, chaveOperacao: chave }), HOJE, sessao(3, "nutricao.criar"),
    );
    expect(doOutro.id).not.toBe(criada.id);
    expect((await porChave(chave)).map((r) => r.userId).sort()).toEqual([1, 3]);
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = 'nutricao.criar'");
    expect(await texto(nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: chave }), HOJE, sessao(2, "nutricao.criar"),
    ))).toBe(MSG_NUTRICAO_SEM_PERMISSAO);
    await limpar();
    const deNovo = `lei-${randomUUID()}`;
    await nutricaoCochoLeiturasService.criar(2, leitura({ chaveOperacao: deNovo }), HOJE, sessao(2, "nutricao.criar"));
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 10");
    expect(await texto(nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: deNovo }), HOJE, sessao(2, "nutricao.criar"),
    ))).toBe(MSG_NUTRICAO_FAZENDA);
    await limpar();
    const sessaoChave = `lei-${randomUUID()}`;
    await nutricaoCochoLeiturasService.criar(2, leitura({ chaveOperacao: sessaoChave }), HOJE, sessao(2, "nutricao.criar"));
    await pool.query("UPDATE users SET sessionVersion = 4 WHERE id = 2");
    expect(await texto(nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: sessaoChave }), HOJE, sessao(2, "nutricao.criar"),
    ))).toBe("Sessão inválida.");
    expect(await contar()).toBe(1);
  });

  it("sem chave válida, sem mysql ou sem a estrutura nada é gravado", async () => {
    await limpar();
    expect(await texto(nutricaoCochoLeiturasService.criar(
      2, leitura({ chaveOperacao: "solta" }), HOJE, sessao(2, "nutricao.criar"),
    ))).toBe(MSG_NUTRICAO_CHAVE_INVALIDA);
    expect(await contar()).toBe(0);
    const fechado = mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada",
      database: "fd_teste_nao_conectar", connectionLimit: 1,
    });
    definirBancoNutricaoCochoLeituras(drizzle(fechado, { schema, mode: "default" }));
    try {
      expect(await texto(nutricaoCochoLeiturasService.criar(
        2, leitura(), HOJE, sessao(2, "nutricao.criar"),
      ))).toBe(MSG_NUTRICAO_SEM_MYSQL);
    } finally {
      definirBancoNutricaoCochoLeituras(banco);
      await fechado.end();
    }
    await pool.query("ALTER TABLE nutricao_cocho_leituras DROP INDEX nutricao_cocho_leituras_user_chave_uq");
    await pool.query("ALTER TABLE nutricao_cocho_leituras DROP COLUMN conteudoHash");
    try {
      expect(await texto(nutricaoCochoLeiturasService.criar(
        2, leitura(), HOJE, sessao(2, "nutricao.criar"),
      ))).toBe(MSG_NUTRICAO_SEM_IDEMPOTENCIA);
      expect(await contar()).toBe(0);
      expect(await saldo()).toBe(100);
    } finally {
      await restaurarColunas();
    }
    await pool.query("ALTER TABLE nutricao_cocho_leituras MODIFY chaveOperacao int NULL");
    try {
      expect(await texto(nutricaoCochoLeiturasService.criar(
        2, leitura(), HOJE, sessao(2, "nutricao.criar"),
      ))).toBe(MSG_NUTRICAO_SEM_IDEMPOTENCIA);
      expect(await contar()).toBe(0);
    } finally {
      await restaurarColunas();
    }
    await pool.query("ALTER TABLE nutricao_cocho_leituras DROP INDEX nutricao_cocho_leituras_user_chave_uq");
    try {
      expect(await texto(nutricaoCochoLeiturasService.criar(
        2, leitura(), HOJE, sessao(2, "nutricao.criar"),
      ))).toBe(MSG_NUTRICAO_SEM_IDEMPOTENCIA);
      expect(await contar()).toBe(0);
      expect(await saldo()).toBe(100);
    } finally {
      await restaurarColunas();
    }
  });

  it("a proposta cria a estrutura uma vez e a segunda aplicação é recusada", async () => {
    await pool.query("DELETE FROM nutricao_cocho_leituras");
    await pool.query("ALTER TABLE nutricao_cocho_leituras DROP INDEX nutricao_cocho_leituras_user_chave_uq");
    await pool.query("ALTER TABLE nutricao_cocho_leituras DROP COLUMN chaveOperacao, DROP COLUMN conteudoHash");
    const conn = await mysql.createConnection({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
      multipleStatements: true,
    });
    try {
      await conn.query(PROPOSTA);
      const [cols] = await conn.query(
        `SELECT COLUMN_NAME AS nome, DATA_TYPE AS tipo, CHARACTER_MAXIMUM_LENGTH AS tamanho, IS_NULLABLE AS nulo
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nutricao_cocho_leituras'
           AND COLUMN_NAME IN ('chaveOperacao', 'conteudoHash')`,
      );
      const mapa = new Map((cols as Array<{ nome: string; tipo: string; tamanho: number; nulo: string }>).map((c) => [c.nome, c]));
      expect(mapa.get("chaveOperacao")).toMatchObject({ tipo: "varchar", tamanho: 80, nulo: "YES" });
      expect(mapa.get("conteudoHash")).toMatchObject({ tipo: "varchar", tamanho: 64, nulo: "YES" });
      await conn.query(
        `INSERT INTO nutricao_cocho_leituras (userId, fazendaId, cochoId, data, sobraKg, status) VALUES
         (1, 10, 1, ?, 3, 'ativa'), (1, 10, 1, ?, 4, 'ativa')`,
        [HOJE, HOJE],
      );
      const [nulas] = await conn.query(
        "SELECT COUNT(*) AS n FROM nutricao_cocho_leituras WHERE userId = 1 AND chaveOperacao IS NULL",
      );
      expect(Number((nulas as Array<{ n: number }>)[0].n)).toBe(2);
      await expect(conn.query(PROPOSTA)).rejects.toThrow();
      const [ainda] = await conn.query(
        "SELECT COUNT(*) AS n FROM nutricao_cocho_leituras WHERE chaveOperacao IS NULL",
      );
      expect(Number((ainda as Array<{ n: number }>)[0].n)).toBe(2);
    } finally {
      await conn.end();
      await restaurarColunas();
    }
    await limpar();
    const criada = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    expect(criada.repetido).toBe(false);
  });

  it("falha antes do commit não deixa chave nem leitura", async () => {
    await limpar();
    definirGanchoTravaLeitura(async () => {
      throw new Error("parar antes de gravar");
    });
    expect(await texto(nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"))))
      .toBe("parar antes de gravar");
    definirGanchoTravaLeitura(null);
    expect(await contar()).toBe(0);
    const [chaves] = await pool.query(
      "SELECT COUNT(*) AS n FROM nutricao_cocho_leituras WHERE chaveOperacao IS NOT NULL",
    );
    expect(Number((chaves as Array<{ n: number }>)[0].n)).toBe(0);
    const criada = await nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar"));
    expect(criada.repetido).toBe(false);
    expect(await saldo()).toBe(100);
  });

  it("inativar o cocho e estornar o trato continuam valendo na criação", async () => {
    await limpar();
    let nova: Promise<string> = Promise.resolve("");
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      nova = texto(nutricaoCochoLeiturasService.criar(2, leitura(), HOJE, sessao(2, "nutricao.criar")));
      await pausa();
      const [cocho] = await pool.query("SELECT status FROM nutricao_cochos WHERE id = 1");
      expect((cocho as Array<{ status: string }>)[0].status).toBe("ativo");
    });
    await nutricaoCochosService.inativar(2, 1, sessao(2, "nutricao.inativar"));
    expect(await nova).toBe(MSG_LEITURA_COCHO_INATIVO);
    definirGanchoTravaLeitura(null);
    expect(await contar()).toBe(0);
    await pool.query("UPDATE nutricao_cochos SET status = 'ativo' WHERE id = 1");
    const [res] = await pool.query(
      `INSERT INTO nutricao_fornecimentos
        (userId, fazendaId, loteId, cochoId, tipoOrigem, produtoId, origemOperacional, data, hora,
         quantidadeFornecidaKg, populacaoSnapshot, origemNomeSnapshot, custoUnitarioSnapshot,
         custoTotalSnapshot, custoPorKgSnapshot, custoCompleto, status)
       VALUES (1, 10, 1, 1, 'produto', 101, 'batida', ?, '08:00', 100, 1, 'Milho', 5, 50, 5, 1, 'confirmado')`,
      [HOJE],
    );
    const forn = Number((res as { insertId: number }).insertId);
    let bloqueada: Promise<string> = Promise.resolve("");
    definirGanchoTravaLeitura(async () => {
      definirGanchoTravaLeitura(null);
      bloqueada = texto(nutricaoCochoLeiturasService.criar(
        2, leitura({ fornecimentoId: forn }), HOJE, sessao(2, "nutricao.criar"),
      ));
      await pausa();
    });
    await nutricaoFornecimentosService.estornar(
      2, "Ambos", { id: forn, motivo: "erro de campo" }, HOJE, sessao(2, "nutricao.estornar"),
    );
    expect(await bloqueada).toBe(MSG_LEITURA_FORN_ESTORNADO);
    definirGanchoTravaLeitura(null);
    expect(await contar()).toBe(0);
    expect(await saldo()).toBe(100);
  }, 20_000);
});
