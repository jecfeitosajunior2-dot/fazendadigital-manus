/**
 * Homologação transacional 3B.2A.3 — banco MySQL descartável.
 * Não aponta para fazenda_digital. Não altera dados operacionais.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { existsSync, readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { persistirCapital } from "../shared/estoqueCapital";
import {
  isDuplicateChaveOperacaoManutencao,
  MANUT_A_PAGAR_OPERACIONAL,
  MSG_MANUT_FIN_CHAVE_DIVERGENTE,
  MSG_MANUT_FIN_COM_PAGAMENTO,
  MSG_MANUT_FIN_NAO_ATIVA,
} from "../shared/manutencaoFinanceiroAPagar";
import { MANUT_PECA_ORIGEM_OFICINA } from "../shared/manutencaoPecasOrigem";
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "../server/financeiroNucleo";
import {
  criarPortasManutencaoAPagar,
  emitirManutencaoAPagarMysql,
  persistirManutencaoComFinanceiroAPagarEmTxIsolada,
} from "../server/manutencaoFinanceiroAPagarMysql";
import {
  persistirManutencaoComFinanceiroAPagarNoTx,
  estornarManutencaoComFinanceiroAPagarNoTx,
  type EmitirManutencaoAPagarInput,
  type PortasManutencaoAPagar,
} from "../server/manutencaoFinanceiroAPagar";
import { ensureFinanceiroNucleoSchema } from "../server/ensureFinanceiroNucleoSchema";
import { ensureEstoqueOperacoesSchema } from "../server/ensureEstoqueOperacoesSchema";
import { ensureEstoqueCapitalSchema } from "../server/ensureEstoqueCapitalSchema";
import { ensureManutencaoEstoqueSchema } from "../server/ensureManutencaoEstoqueSchema";

const HOMOLOG = "fazenda_digital_homolog_3b2a3";
const OPERACIONAL = "fazenda_digital";
const USER = 910001;
const TABELAS = [
  "fazendas",
  "pessoas",
  "maquinas",
  "estoque",
  "estoque_operacoes",
  "estoque_movimentacoes",
  "manutencoes",
  "manutencao_pecas",
  "financeiro_contas",
  "financeiro_categorias",
  "financeiro_centros_custo",
  "financeiro_titulos",
  "financeiro_parcelas",
  "financeiro_apropriacoes",
  "financeiro_liquidacoes",
  "financeiro_liquidacao_alocacoes",
  "financeiro_movimentos",
  "financeiro_transferencias",
] as const;

type Cenario = {
  id: string;
  nome: string;
  ok: boolean;
  os: number;
  titulos: number;
  parcelas: number;
  apropriacoes: number;
  pagamentos: number;
  movimentosCaixa: number;
  detalhe: Record<string, unknown>;
  erro?: string;
};

function parseEnv(file: string) {
  if (!existsSync(file)) return {} as Record<string, string>;
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i)] = t.slice(i + 1);
  }
  return out;
}

function credenciaisSemBanco() {
  const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };
  const raw = env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL ausente");
  const u = new URL(raw);
  const host = u.hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("ABORT: host não é MySQL local");
  }
  if ((u.pathname || "").replace(/^\//, "").split("?")[0] !== OPERACIONAL) {
    throw new Error("ABORT: URL operacional inesperada");
  }
  return {
    host,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}

async function q<T extends mysql.RowDataPacket[]>(conn: mysql.Connection | mysql.Pool, sqlText: string, params: unknown[] = []) {
  const [rows] = await conn.query(sqlText, params);
  return rows as T;
}

function assertHomolog(nome: string) {
  if (nome !== HOMOLOG) throw new Error(`ABORT: conexão em ${nome}, esperado ${HOMOLOG}`);
}

async function snapshotOperacional(admin: mysql.Connection) {
  const os = await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.manutencoes`);
  const ids = await q<{ id: number; status: string; chaveOperacao: string | null }[]>(
    admin,
    `SELECT id, status, chaveOperacao FROM \`${OPERACIONAL}\`.manutencoes ORDER BY id`,
  );
  const [chk] = await admin.query(
    `CHECKSUM TABLE \`${OPERACIONAL}\`.manutencoes, \`${OPERACIONAL}\`.estoque, \`${OPERACIONAL}\`.financeiro_titulos, \`${OPERACIONAL}\`.estoque_movimentacoes`,
  );
  return {
    os: Number(os[0]?.n),
    ids,
    checksums: Object.fromEntries((chk as Array<{ Table: string; Checksum: number }>).map(r => [String(r.Table).split(".").pop(), r.Checksum])),
  };
}

async function prepararBanco(admin: mysql.Connection, cred: ReturnType<typeof credenciaisSemBanco>) {
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${HOMOLOG}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await admin.query(`DROP DATABASE IF EXISTS \`${HOMOLOG}\``);
  await admin.query(`CREATE DATABASE \`${HOMOLOG}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);

  for (const tabela of TABELAS) {
    const existe = await q<{ n: number }[]>(
      admin,
      `SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [OPERACIONAL, tabela],
    );
    if (Number(existe[0]?.n) !== 1) {
      throw new Error(`Tabela operacional ${tabela} ausente — interrompido sem improvisar`);
    }
    await admin.query(`CREATE TABLE \`${HOMOLOG}\`.\`${tabela}\` LIKE \`${OPERACIONAL}\`.\`${tabela}\``);
    const linhas = await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${HOMOLOG}\`.\`${tabela}\``);
    if (Number(linhas[0]?.n) !== 0) {
      throw new Error(`Tabela ${tabela} no homolog não está vazia`);
    }
  }

  const pool = mysql.createPool({ ...cred, database: HOMOLOG, connectionLimit: 8 });
  const [db] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
  assertHomolog(db.db);
  await ensureFinanceiroNucleoSchema(pool);
  await ensureEstoqueOperacoesSchema(pool);
  await ensureEstoqueCapitalSchema(pool);
  await ensureManutencaoEstoqueSchema(pool);

  const col = await q<{ Field: string; Type: string; Null: string }[]>(
    pool,
    "SHOW COLUMNS FROM manutencoes LIKE 'chaveOperacao'",
  );
  const idx = await q<{ Column_name: string; Non_unique: number; Seq_in_index: number }[]>(
    pool,
    "SHOW INDEX FROM manutencoes WHERE Key_name = 'manutencoes_chave_operacao_uq'",
  );
  if (!col[0] || !/^varchar\(80\)$/i.test(col[0].Type) || col[0].Null !== "YES") {
    throw new Error("Homolog sem chaveOperacao VARCHAR(80) NULL — interrompido");
  }
  const cols = idx.sort((a, b) => a.Seq_in_index - b.Seq_in_index).map(i => i.Column_name);
  if (cols.join(",") !== "userId,chaveOperacao" || idx.some(i => i.Non_unique !== 0)) {
    throw new Error("Homolog sem UNIQUE (userId, chaveOperacao) — interrompido");
  }
  return pool;
}

async function limparHomolog(pool: mysql.Pool) {
  const [db] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
  assertHomolog(db.db);
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const tabela of [...TABELAS].reverse()) {
    await pool.query(`DELETE FROM \`${tabela}\``);
  }
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");
}

async function semear(pool: mysql.Pool) {
  await pool.query(
    `INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Oficina Homolog', 'fornecedor', 1)`,
    [USER],
  );
  await pool.query(`INSERT INTO fazendas (userId, nome) VALUES (?, 'Fazenda Homolog')`, [USER]);
  const pessoa = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? LIMIT 1", [USER]))[0]?.id);
  const fazenda = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? LIMIT 1", [USER]))[0]?.id);
  await pool.query(
    `INSERT INTO maquinas (userId, fazendaId, nome, status) VALUES (?, ?, 'Trator Homolog', 'ativo')`,
    [USER, fazenda],
  );
  const maquina = Number((await q<{ id: number }[]>(pool, "SELECT id FROM maquinas WHERE userId = ? LIMIT 1", [USER]))[0]?.id);
  await pool.query(
    `INSERT INTO estoque
      (nome, fazenda_id, quantidade, controlar_saldo, unidade, categoria, valor_unitario, valor_total_estoque, capital_inicializado_em)
     VALUES (?, ?, '10.00', 1, 'un', 'Peças', '10.000000', '100.00', NOW())`,
    ["Filtro Homolog", fazenda],
  );
  const estoqueId = Number((await q<{ id: number }[]>(
    pool,
    "SELECT id FROM estoque WHERE fazenda_id = ? AND nome = ? ORDER BY id DESC LIMIT 1",
    [fazenda, "Filtro Homolog"],
  ))[0]?.id);
  return { pessoa, fazenda, maquina, estoqueId };
}

function pecaOficina() {
  return {
    origem: MANUT_PECA_ORIGEM_OFICINA,
    nome: "Retentor Homolog",
    quantidade: 1,
    valorUnitario: 150,
    valorTotal: 150,
  };
}

function inputEmitir(
  ids: Awaited<ReturnType<typeof semear>>,
  key: string,
  extras: { pecas?: Array<{ estoqueId: number; nome: string; quantidade: number; valorUnitario: number }>; valorMaoObra?: number } = {},
): EmitirManutencaoAPagarInput {
  return {
    userId: USER,
    idempotencyKey: key,
    os: {
      userId: USER,
      registradoPor: "Homolog 3B.2A.3",
      maquinaId: ids.maquina,
      fazendaId: ids.fazenda,
      tipo: "Corretiva",
      descricao: "OS homologação descartável",
      data: "2026-10-14",
      valorMaoObra: extras.valorMaoObra ?? 350,
      pecas: extras.pecas ?? [],
      pecasOficina: [pecaOficina()],
      tipoExecucao: "externa",
      prestadorPessoaId: ids.pessoa,
      prestadorNome: "Oficina Homolog",
    },
    pessoa: { id: ids.pessoa, userId: USER, tipo: "fornecedor", ativo: true },
    maquina: { id: ids.maquina, userId: USER, fazendaId: ids.fazenda },
    fazenda: { id: ids.fazenda, userId: USER },
    dataVencimento: "2026-11-14",
  };
}

async function emitir(pool: mysql.Pool, input: EmitirManutencaoAPagarInput) {
  const [db] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
  assertHomolog(db.db);
  const dbx = drizzle(pool, { schema, mode: "default" });
  return persistirManutencaoComFinanceiroAPagarEmTxIsolada(dbx, input);
}

async function estornar(pool: mysql.Pool, osId: number) {
  const dbx = drizzle(pool, { schema, mode: "default" });
  return dbx.transaction(async tx =>
    estornarManutencaoComFinanceiroAPagarNoTx(criarPortasManutencaoAPagar(tx), {
      userId: USER,
      registradoPor: "Homolog 3B.2A.3",
      id: osId,
      hojeISO: "2026-10-16",
      motivo: "Estorno homologação",
    }),
  );
}

async function contagens(pool: mysql.Pool) {
  const [db] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
  assertHomolog(db.db);
  const one = async (sqlText: string) => Number((await q<{ n: number }[]>(pool, sqlText))[0]?.n);
  return {
    os: await one("SELECT COUNT(*) n FROM manutencoes"),
    titulos: await one("SELECT COUNT(*) n FROM financeiro_titulos"),
    parcelas: await one("SELECT COUNT(*) n FROM financeiro_parcelas"),
    apropriacoes: await one("SELECT COUNT(*) n FROM financeiro_apropriacoes"),
    pagamentos: await one("SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE tipo = 'pagamento'"),
    movimentosCaixa: await one("SELECT COUNT(*) n FROM financeiro_movimentos"),
    movEstoque: await one("SELECT COUNT(*) n FROM estoque_movimentacoes"),
  };
}

function baseCenario(id: string, nome: string, c: Awaited<ReturnType<typeof contagens>>, ok: boolean, detalhe: Record<string, unknown>, erro?: string): Cenario {
  return {
    id,
    nome,
    ok,
    os: c.os,
    titulos: c.titulos,
    parcelas: c.parcelas,
    apropriacoes: c.apropriacoes,
    pagamentos: c.pagamentos,
    movimentosCaixa: c.movimentosCaixa,
    detalhe,
    erro,
  };
}

async function pagarParcial(pool: mysql.Pool, tituloId: number, valor: number, key: string) {
  const dbx = drizzle(pool, { schema, mode: "default" });
  const svc = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(dbx));
  const conta = await svc.criarContaFinanceira(USER, {
    nome: "Caixa Homolog",
    tipo: "caixa",
    saldoAbertura: 50000,
    dataSaldoAbertura: "2026-10-01",
  });
  const parcelas = await q<{ id: number }[]>(pool, "SELECT id FROM financeiro_parcelas WHERE titulo_id = ? LIMIT 1", [tituloId]);
  return svc.criarPagamento(USER, {
    contaId: conta.id,
    dataLiquidacao: "2026-10-15",
    valorMovimentado: valor,
    idempotencyKey: key,
    alocacoes: [{ parcelaId: Number(parcelas[0]?.id), principalLiquidado: valor }],
  });
}

async function main() {
  const cenarios: Cenario[] = [];
  const problemas: string[] = [];
  const cred = credenciaisSemBanco();
  const admin = await mysql.createConnection(cred);
  let pool: mysql.Pool | null = null;
  let pool2: mysql.Pool | null = null;

  try {
    if (MANUT_A_PAGAR_OPERACIONAL !== false) {
      throw new Error("A pagar operacional está ativo — interrompido");
    }
    await emitirManutencaoAPagarMysql().then(
      () => { throw new Error("emitirManutencaoAPagarMysql não recusou"); },
      (e: Error) => {
        if (!String(e.message).includes(MSG_MANUT_FIN_NAO_ATIVA)) throw e;
      },
    );

    const antes = await snapshotOperacional(admin);
    if (antes.os !== 6) {
      throw new Error(`Isolamento abortado: operacional tem ${antes.os} OS, esperado 6`);
    }

    pool = await prepararBanco(admin, cred);
    pool2 = mysql.createPool({ ...cred, database: HOMOLOG, connectionLimit: 4 });
    const [db2] = await q<{ db: string }[]>(pool2, "SELECT DATABASE() db");
    assertHomolog(db2.db);

    const isolamento = {
      banco: HOMOLOG,
      naoEOperacional: HOMOLOG !== OPERACIONAL,
      operacionalOsAntes: antes.os,
      homologVazio: (await contagens(pool)).os === 0,
    };
    if (!isolamento.naoEOperacional || !isolamento.homologVazio) {
      throw new Error("Isolamento não verificável — testes interrompidos");
    }

    // A
    await limparHomolog(pool);
    let ids = await semear(pool);
    const a = await emitir(pool, inputEmitir(ids, "homolog-a-os-01"));
    const ca = await contagens(pool);
    const tituloA = (await q<{ valor_original: string; tipo: string; origem_item_chave: string }[]>(
      pool,
      "SELECT valor_original, tipo, origem_item_chave FROM financeiro_titulos",
    ))[0];
    const okA = a.ok && a.tituloId != null && ca.os === 1 && ca.titulos === 1 && ca.parcelas === 1
      && ca.apropriacoes === 1 && ca.pagamentos === 0 && ca.movimentosCaixa === 0
      && persistirCapital(tituloA?.valor_original) === persistirCapital(500);
    cenarios.push(baseCenario("A", "Terceirizada A pagar", ca, okA, { resultado: a, titulo: tituloA }));
    if (!okA) problemas.push("A: OS/título/parcela/apropriação ou valor divergente");

    // B mista
    await limparHomolog(pool);
    ids = await semear(pool);
    const b = await emitir(pool, inputEmitir(ids, "homolog-b-os-01", {
      pecas: [{ estoqueId: ids.estoqueId, nome: "Filtro Homolog", quantidade: 2, valorUnitario: 10 }],
    }));
    const cb = await contagens(pool);
    const estoqueB = (await q<{ quantidade: string; valor_total_estoque: string }[]>(
      pool,
      "SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?",
      [ids.estoqueId],
    ))[0];
    const pecasB = await q<{ origem: string | null; estoqueId: number | null }[]>(
      pool,
      "SELECT origem, estoqueId FROM manutencao_pecas ORDER BY id",
    );
    const tituloB = (await q<{ valor_original: string }[]>(pool, "SELECT valor_original FROM financeiro_titulos"))[0];
    const okB = b.ok && cb.os === 1 && cb.titulos === 1 && cb.movEstoque === 1
      && Number(estoqueB?.quantidade) === 8
      && persistirCapital(estoqueB?.valor_total_estoque) === persistirCapital(80)
      && persistirCapital(tituloB?.valor_original) === persistirCapital(500)
      && pecasB.some(p => p.origem === "estoque")
      && pecasB.some(p => p.origem === "oficina");
    cenarios.push(baseCenario("B", "Manutenção mista", cb, okB, {
      resultado: b,
      estoque: estoqueB,
      pecas: pecasB,
      valorTitulo: tituloB?.valor_original,
    }));
    if (!okB) problemas.push("B: consumo, oficina ou valor do título divergente");

    // C concorrência real
    await limparHomolog(pool);
    ids = await semear(pool);
    const inputC = inputEmitir(ids, "homolog-c-os-01", {
      pecas: [{ estoqueId: ids.estoqueId, nome: "Filtro Homolog", quantidade: 2, valorUnitario: 10 }],
    });
    const [r1, r2] = await Promise.allSettled([
      emitir(pool, inputC),
      emitir(pool2, inputC),
    ]);
    const cc = await contagens(pool);
    const estoqueC = (await q<{ quantidade: string }[]>(pool, "SELECT quantidade FROM estoque WHERE id = ?", [ids.estoqueId]))[0];
    const vencedor = r1.status === "fulfilled" ? r1.value : r2.status === "fulfilled" ? r2.value : null;
    const outro = r1.status === "fulfilled" && r2.status === "fulfilled"
      ? r2.value
      : r1.status === "rejected" ? r1 : r2.status === "rejected" ? r2 : null;
    const mesmoResultado = r1.status === "fulfilled" && r2.status === "fulfilled"
      && r1.value.osId === r2.value.osId
      && r1.value.tituloId === r2.value.tituloId;
    const umGanhouOutroReusou = mesmoResultado
      && ((r1.value.idempotente === true) !== (r2.value.idempotente === true) || (r1.value.idempotente && r2.value.idempotente));
    const okC = cc.os === 1 && cc.titulos === 1 && cc.movEstoque === 1
      && Number(estoqueC?.quantidade) === 8
      && (mesmoResultado || (vencedor != null && outro != null))
      && (mesmoResultado ? umGanhouOutroReusou || mesmoResultado : false);
    const okCfinal = cc.os === 1 && cc.titulos === 1 && cc.movEstoque === 1 && Number(estoqueC?.quantidade) === 8 && (
      (r1.status === "fulfilled" && r2.status === "fulfilled" && r1.value.osId === r2.value.osId && r1.value.tituloId === r2.value.tituloId)
      || (r1.status === "fulfilled" && r2.status === "rejected")
      || (r2.status === "fulfilled" && r1.status === "rejected")
    );
    if (r1.status === "fulfilled" && r2.status === "rejected") problemas.push("C: segunda conexão rejeitou em vez de reutilizar");
    if (r2.status === "fulfilled" && r1.status === "rejected") problemas.push("C: primeira conexão rejeitou em vez de reutilizar");
    cenarios.push(baseCenario("C", "Duplo clique concorrente", cc, okCfinal && r1.status === "fulfilled" && r2.status === "fulfilled", {
      conexao1: r1.status === "fulfilled" ? r1.value : { rejeitado: String(r1.reason?.message ?? r1.reason) },
      conexao2: r2.status === "fulfilled" ? r2.value : { rejeitado: String(r2.reason?.message ?? r2.reason) },
      estoque: estoqueC,
      mesmoOsTitulo: r1.status === "fulfilled" && r2.status === "fulfilled" && r1.value.osId === r2.value.osId,
    }));
    if (!(okCfinal && r1.status === "fulfilled" && r2.status === "fulfilled")) {
      problemas.push("C: concorrência real não devolveu a mesma OS/título nas duas conexões");
    }

    // D payload diferente
    await limparHomolog(pool);
    ids = await semear(pool);
    await emitir(pool, inputEmitir(ids, "homolog-d-os-01"));
    let recusouD = false;
    let msgD = "";
    try {
      await emitir(pool, inputEmitir(ids, "homolog-d-os-01", { valorMaoObra: 200 }));
    } catch (e) {
      recusouD = String((e as Error).message).includes(MSG_MANUT_FIN_CHAVE_DIVERGENTE);
      msgD = String((e as Error).message);
    }
    const cd = await contagens(pool);
    const okD = recusouD && cd.os === 1 && cd.titulos === 1;
    cenarios.push(baseCenario("D", "Mesma chave payload diferente", cd, okD, { mensagem: msgD }));
    if (!okD) problemas.push("D: não recusou ou criou OS/título extra");

    // Reenvio após concluída
    await limparHomolog(pool);
    ids = await semear(pool);
    const re1 = await emitir(pool, inputEmitir(ids, "homolog-re-os-01", {
      pecas: [{ estoqueId: ids.estoqueId, nome: "Filtro Homolog", quantidade: 2, valorUnitario: 10 }],
    }));
    const estoqueRe1 = (await q<{ quantidade: string }[]>(pool, "SELECT quantidade FROM estoque WHERE id = ?", [ids.estoqueId]))[0];
    const re2 = await emitir(pool, inputEmitir(ids, "homolog-re-os-01", {
      pecas: [{ estoqueId: ids.estoqueId, nome: "Filtro Homolog", quantidade: 2, valorUnitario: 10 }],
    }));
    const estoqueRe2 = (await q<{ quantidade: string }[]>(pool, "SELECT quantidade FROM estoque WHERE id = ?", [ids.estoqueId]))[0];
    const cre = await contagens(pool);
    const okRe = re1.ok && re2.ok && re2.idempotente === true
      && re1.osId === re2.osId && re1.tituloId === re2.tituloId
      && cre.os === 1 && cre.titulos === 1 && cre.movEstoque === 1
      && estoqueRe1?.quantidade === estoqueRe2?.quantidade;
    cenarios.push(baseCenario("RE", "Reenvio após operação concluída", cre, okRe, {
      primeiro: re1,
      segundo: re2,
      estoque: estoqueRe2,
    }));
    if (!okRe) problemas.push("RE: reenvio alterou estoque ou criou outra OS");

    // E falha financeira + rollback real
    await limparHomolog(pool);
    ids = await semear(pool);
    const inputE = inputEmitir(ids, "homolog-e-os-01", {
      pecas: [{ estoqueId: ids.estoqueId, nome: "Filtro Homolog", quantidade: 2, valorUnitario: 10 }],
    });
    let falhouE = false;
    try {
      const dbx = drizzle(pool, { schema, mode: "default" });
      await dbx.transaction(async tx => {
        const portas: PortasManutencaoAPagar = criarPortasManutencaoAPagar(tx);
        const fin = portas.fin;
        portas.fin = {
          ...fin,
          async insertTitulo() {
            throw new Error("falha financeira homolog 3B.2A.3");
          },
        };
        return persistirManutencaoComFinanceiroAPagarNoTx(portas, inputE);
      });
    } catch (e) {
      falhouE = String((e as Error).message).includes("falha financeira homolog");
    }
    const ce = await contagens(pool);
    const estoqueE = (await q<{ quantidade: string; valor_total_estoque: string }[]>(
      pool,
      "SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?",
      [ids.estoqueId],
    ))[0];
    const okE = falhouE && ce.os === 0 && ce.titulos === 0 && ce.parcelas === 0
      && ce.apropriacoes === 0 && ce.movEstoque === 0
      && Number(estoqueE?.quantidade) === 10
      && persistirCapital(estoqueE?.valor_total_estoque) === persistirCapital(100);
    cenarios.push(baseCenario("E", "Falha financeira com rollback", ce, okE, { estoque: estoqueE, falhou: falhouE }));
    if (!okE) problemas.push("E: rollback incompleto");

    // F estorno sem pagamento
    await limparHomolog(pool);
    ids = await semear(pool);
    const f = await emitir(pool, inputEmitir(ids, "homolog-f-os-01", {
      pecas: [{ estoqueId: ids.estoqueId, nome: "Filtro Homolog", quantidade: 2, valorUnitario: 10 }],
    }));
    if (f.tituloId == null) throw new Error("F: título ausente");
    await estornar(pool, f.osId);
    const cf = await contagens(pool);
    const osF = (await q<{ status: string }[]>(pool, "SELECT status FROM manutencoes WHERE id = ?", [f.osId]))[0];
    const titF = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [f.tituloId]))[0];
    const estoqueF = (await q<{ quantidade: string; valor_total_estoque: string }[]>(
      pool,
      "SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?",
      [ids.estoqueId],
    ))[0];
    const okF = osF?.status === "estornado" && titF?.estado === "cancelado"
      && Number(estoqueF?.quantidade) === 10
      && persistirCapital(estoqueF?.valor_total_estoque) === persistirCapital(100)
      && cf.os === 1 && cf.titulos === 1;
    cenarios.push(baseCenario("F", "Estorno sem pagamento", cf, okF, {
      os: osF,
      titulo: titF,
      estoque: estoqueF,
      historicoPreservado: cf.os === 1 && cf.titulos === 1,
    }));
    if (!okF) problemas.push("F: estorno sem pagamento incompleto");

    // G estorno com pagamento
    await limparHomolog(pool);
    ids = await semear(pool);
    const g = await emitir(pool, inputEmitir(ids, "homolog-g-os-01", {
      pecas: [{ estoqueId: ids.estoqueId, nome: "Filtro Homolog", quantidade: 2, valorUnitario: 10 }],
    }));
    if (g.tituloId == null) throw new Error("G: título ausente");
    await pagarParcial(pool, g.tituloId, 200, "homolog-g-pag-01");
    const estoqueAntesG = (await q<{ quantidade: string }[]>(pool, "SELECT quantidade FROM estoque WHERE id = ?", [ids.estoqueId]))[0];
    let bloqueouG = false;
    let msgG = "";
    try {
      await estornar(pool, g.osId);
    } catch (e) {
      bloqueouG = String((e as Error).message).includes(MSG_MANUT_FIN_COM_PAGAMENTO);
      msgG = String((e as Error).message);
    }
    const cg = await contagens(pool);
    const osG = (await q<{ status: string }[]>(pool, "SELECT status FROM manutencoes WHERE id = ?", [g.osId]))[0];
    const titG = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [g.tituloId]))[0];
    const estoqueG = (await q<{ quantidade: string }[]>(pool, "SELECT quantidade FROM estoque WHERE id = ?", [ids.estoqueId]))[0];
    const okG = bloqueouG && osG?.status === "concluida" && titG?.estado === "ativo"
      && Number(estoqueG?.quantidade) === Number(estoqueAntesG?.quantidade)
      && cg.pagamentos === 1 && cg.movimentosCaixa >= 1;
    cenarios.push(baseCenario("G", "Estorno com pagamento parcial", cg, okG, {
      mensagem: msgG,
      os: osG,
      titulo: titG,
      estoque: estoqueG,
    }));
    if (!okG) problemas.push("G: estorno com pagamento não bloqueou ou alterou dados");

    // Concorrência: unique real e outra constraint
    await limparHomolog(pool);
    ids = await semear(pool);
    await emitir(pool, inputEmitir(ids, "homolog-uq-os-01"));
    let errChave: unknown = null;
    let errTitulo: unknown = null;
    try {
      await pool.query(
        `INSERT INTO manutencoes (userId, maquinaId, tipo, descricao, data, status, valorMaoObra, chaveOperacao)
         VALUES (?, ?, 'Corretiva', 'dup', '2026-10-14', 'concluida', 1, 'homolog-uq-os-01')`,
        [USER, ids.maquina],
      );
    } catch (e) {
      errChave = e;
    }
    const tit = (await q<{ origem_tipo: string; origem_id: number; origem_item_chave: string }[]>(
      pool,
      "SELECT origem_tipo, origem_id, origem_item_chave FROM financeiro_titulos LIMIT 1",
    ))[0];
    try {
      await pool.query(
        `INSERT INTO financeiro_titulos
          (user_id, tipo, estado, condicao_status, pessoa_id, contraparte_nome_snapshot, fazenda_origem_id, origem_tipo, origem_id, origem_item_chave, descricao, data_competencia, valor_original)
         VALUES (?, 'pagar', 'ativo', 'em_aberto', ?, 'dup', ?, ?, ?, ?, 'dup', '2026-10-14', 10.00)`,
        [USER, ids.pessoa, ids.fazenda, tit.origem_tipo, tit.origem_id, tit.origem_item_chave],
      );
    } catch (e) {
      errTitulo = e;
    }
    const reconheceChave = isDuplicateChaveOperacaoManutencao(errChave);
    const reconheceTitulo = isDuplicateChaveOperacaoManutencao(errTitulo);
    const osAposUq = (await contagens(pool)).os;
    const okUq = reconheceChave === true && reconheceTitulo === false && osAposUq === 1;
    cenarios.push(baseCenario("UQ", "Unique real vs outra constraint", await contagens(pool), okUq, {
      chaveReconhecida: reconheceChave,
      tituloNaoReconhecido: reconheceTitulo === false,
      errnoChave: (errChave as { errno?: number } | null)?.errno,
      codeChave: (errChave as { code?: string } | null)?.code,
      sqlChave: (errChave as { sqlMessage?: string } | null)?.sqlMessage,
      errnoTitulo: (errTitulo as { errno?: number } | null)?.errno,
      sqlTitulo: (errTitulo as { sqlMessage?: string } | null)?.sqlMessage,
    }));
    if (!okUq) problemas.push("UQ: detector da unique não distinguiu a constraint correta");

    const depois = await snapshotOperacional(admin);
    const isolamentoFinal = {
      operacionalOsDepois: depois.os,
      idsIguais: JSON.stringify(antes.ids) === JSON.stringify(depois.ids),
      checksumsIguais: JSON.stringify(antes.checksums) === JSON.stringify(depois.checksums),
    };
    if (depois.os !== 6 || !isolamentoFinal.idsIguais || !isolamentoFinal.checksumsIguais) {
      problemas.push("Isolamento violado: banco operacional mudou");
    }

    const relatorio = {
      bancoIsolado: HOMOLOG,
      isolamento: { ...isolamento, ...isolamentoFinal, operacionalChecksums: depois.checksums },
      aPagarOperacional: MANUT_A_PAGAR_OPERACIONAL,
      cenarios,
      problemas,
      ok: problemas.length === 0 && cenarios.every(c => c.ok),
    };
    console.log(JSON.stringify(relatorio, null, 2));
    if (!relatorio.ok) process.exitCode = 2;
  } finally {
    if (pool2) await pool2.end();
    if (pool) await pool.end();
    await admin.end();
  }
}

main().catch((erro) => {
  console.error(JSON.stringify({
    ok: false,
    abortado: true,
    erro: String(erro?.message ?? erro),
    stack: erro?.stack,
  }, null, 2));
  process.exit(1);
});
