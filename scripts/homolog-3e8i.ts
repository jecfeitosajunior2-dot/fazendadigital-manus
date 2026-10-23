/**
 * Homologação 3E.8I — recuperação idempotente de estorno (movimentoId).
 * Somente fazenda_digital_test_3e8e. Não ativa integração. Não aplica migration.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { existsSync, readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "../server/financeiroNucleo";
import { MSG_FIN_MOVIMENTO_LIQUIDACAO } from "../shared/financeiroNucleo";
import { INTEGRACAO_CONFIRMACAO_VENDA_ATIVA } from "../client/src/lib/novaVendaPendencia";

const TESTE = "fazenda_digital_test_3e8e";
const TESTE_3E5B = "fazenda_digital_test_3e5b";
const OPERACIONAL = "fazenda_digital";
const HOMOLOG_3C47 = "fazenda_digital_homolog_3c47";
const HOMOLOG_3B2A3 = "fazenda_digital_homolog_3b2a3";
const PROTEGIDOS = [OPERACIONAL, HOMOLOG_3C47, HOMOLOG_3B2A3, TESTE_3E5B] as const;
const USER_A = 940001;
const USER_B = 940002;

type Cenario = { id: string; nome: string; ok: boolean; detalhe: Record<string, unknown>; erro?: string };

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

function credenciais() {
  const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };
  const raw = env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL ausente");
  const u = new URL(raw);
  if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) throw new Error("ABORT: host não é MySQL local");
  if ((u.pathname || "").replace(/^\//, "").split("?")[0] !== OPERACIONAL) {
    throw new Error("ABORT: URL operacional inesperada");
  }
  return { host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
}

async function q<T extends mysql.RowDataPacket[]>(conn: mysql.Connection | mysql.Pool, sqlText: string, params: unknown[] = []) {
  const [rows] = await conn.query(sqlText, params);
  return rows as T;
}

function assertTeste(nome: string | null) {
  if (nome !== TESTE) throw new Error(`ABORT: conexão em ${nome}, esperado ${TESTE}`);
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function settled<T>(r: PromiseSettledResult<T>) {
  if (r.status === "fulfilled") return { ok: true as const, value: r.value };
  return { ok: false as const, erro: msg(r.reason) };
}

async function snapshotBanco(admin: mysql.Connection, schemaName: string) {
  const existe = Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [schemaName]))[0]?.n);
  if (!existe) return { existe: false as const, schemaName };
  const count = async (tabela: string) => {
    const tem = Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?", [schemaName, tabela]))[0]?.n);
    if (!tem) return null;
    return Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${schemaName}\`.\`${tabela}\``))[0]?.n);
  };
  const [chk] = await admin.query(
    `CHECKSUM TABLE \`${schemaName}\`.vendas, \`${schemaName}\`.animais, \`${schemaName}\`.financeiro_titulos, \`${schemaName}\`.financeiro_movimentos, \`${schemaName}\`.financeiro_liquidacoes`,
  );
  return {
    existe: true as const, schemaName,
    vendas: await count("vendas"), animais: await count("animais"),
    titulos: await count("financeiro_titulos"), movimentos: await count("financeiro_movimentos"),
    liquidacoes: await count("financeiro_liquidacoes"),
    checksums: Object.fromEntries((chk as Array<{ Table: string; Checksum: number | null }>).map(r => [String(r.Table).split(".").pop(), r.Checksum])),
  };
}

async function main() {
  const cenarios: Cenario[] = [];
  const problemas: string[] = [];
  const cred = credenciais();
  const admin = await mysql.createConnection({ host: cred.host, port: cred.port, user: cred.user, password: cred.password });
  let pool: mysql.Pool | null = null;
  let pool2: mysql.Pool | null = null;
  const reg = (c: Cenario) => {
    cenarios.push(c);
    if (!c.ok) problemas.push(`${c.id}: ${c.erro || JSON.stringify(c.detalhe)}`);
  };

  try {
    const [adminDb] = await q<{ db: string | null }[]>(admin, "SELECT DATABASE() db");
    if (adminDb.db && (PROTEGIDOS as readonly string[]).includes(adminDb.db)) {
      throw new Error(`ABORT: admin conectado em protegido ${adminDb.db}`);
    }
    const antesOp = await snapshotBanco(admin, OPERACIONAL);
    const antes47 = await snapshotBanco(admin, HOMOLOG_3C47);
    const antesB2 = await snapshotBanco(admin, HOMOLOG_3B2A3);
    const antes5b = await snapshotBanco(admin, TESTE_3E5B);
    if (!antesOp.existe || !antes47.existe || !antes5b.existe) throw new Error("ABORT: banco protegido ausente");

    const bancos = (await q<{ Database: string }[]>(admin, "SHOW DATABASES")).map(b => b.Database);
    if (!bancos.includes(TESTE)) throw new Error("ABORT: banco de teste 3e8e ausente");

    pool = mysql.createPool({ host: cred.host, port: cred.port, user: cred.user, password: cred.password, database: TESTE, connectionLimit: 8 });
    pool2 = mysql.createPool({ host: cred.host, port: cred.port, user: cred.user, password: cred.password, database: TESTE, connectionLimit: 4 });
    const [db1] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    const [db2] = await q<{ db: string }[]>(pool2, "SELECT DATABASE() db");
    assertTeste(db1.db);
    assertTeste(db2.db);

    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM fazendas WHERE userId = ?", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda 3E8I A')", [USER_A]);
    }
    const fazendaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM pessoas WHERE user_id = ? AND tipo = 'fornecedor'", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Fornecedor 3E8I A', 'fornecedor', 1)", [USER_A]);
    }
    const fornecedorA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'fornecedor' ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_contas WHERE user_id = ?", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO financeiro_contas (user_id, nome, tipo, saldo_abertura, data_saldo_abertura, ativa) VALUES (?, 'Caixa 3E8I', 'caixa', '200000.00', '2026-10-01', 1)", [USER_A]);
    }
    const contaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM financeiro_contas WHERE user_id = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);

    const d1 = drizzle(pool, { schema, mode: "default" as const });
    const d2 = drizzle(pool2, { schema, mode: "default" as const });
    const nucleo = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(d1));
    const nucleo2 = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(d2));

    const titulo = await nucleo.criarTitulo(USER_A, {
      tipo: "pagar",
      pessoaId: fornecedorA,
      fazendaOrigemId: fazendaA,
      descricao: "Titulo 3E8I",
      dataCompetencia: "2026-10-02",
      valorOriginal: 8000,
      parcelas: [{ numero: 1, vencimento: "2026-10-10", valorOriginal: 8000 }],
    });
    const parcelaId = Number((await q<{ id: number }[]>(pool, "SELECT id FROM financeiro_parcelas WHERE titulo_id = ? AND user_id = ? ORDER BY id LIMIT 1", [titulo.id, USER_A]))[0]?.id);
    const pag = await nucleo.criarPagamento(USER_A, {
      contaId: contaA,
      dataLiquidacao: "2026-10-23",
      valorMovimentado: 8000,
      idempotencyKey: "pag-3e8i-r",
      alocacoes: [{ parcelaId, principalLiquidado: 8000 }],
    });

    const a = await nucleo.estornarLiquidacao(USER_A, {
      liquidacaoId: pag.id, idempotencyKey: "est-3e8i-a", dataLiquidacao: "2026-10-24",
    });
    const b = await nucleo.estornarLiquidacao(USER_A, {
      liquidacaoId: pag.id, idempotencyKey: "est-3e8i-a", dataLiquidacao: "2026-10-24",
    });
    const estA = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE idempotency_key = ? AND user_id = ?", ["est-3e8i-a", USER_A]))[0]?.n);
    const movA = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_movimentos WHERE liquidacao_id = ?", [a.id]))[0]?.n);
    reg({
      id: "A",
      nome: "Estorno + retry mesma chave",
      ok: a.movimentoId > 0 && b.idempotente === true && b.id === a.id && b.movimentoId === a.movimentoId && estA === 1 && movA === 1,
      detalhe: { a, b, estA, movA },
    });

    const tituloC = await nucleo.criarTitulo(USER_A, {
      tipo: "pagar",
      pessoaId: fornecedorA,
      fazendaOrigemId: fazendaA,
      descricao: "Titulo 3E8I C",
      dataCompetencia: "2026-10-02",
      valorOriginal: 3000,
      parcelas: [{ numero: 1, vencimento: "2026-10-10", valorOriginal: 3000 }],
    });
    const parcelaC = Number((await q<{ id: number }[]>(pool, "SELECT id FROM financeiro_parcelas WHERE titulo_id = ? AND user_id = ? ORDER BY id LIMIT 1", [tituloC.id, USER_A]))[0]?.id);
    const pagConc = await nucleo.criarPagamento(USER_A, {
      contaId: contaA,
      dataLiquidacao: "2026-10-23",
      valorMovimentado: 3000,
      idempotencyKey: "pag-3e8i-c",
      alocacoes: [{ parcelaId: parcelaC, principalLiquidado: 3000 }],
    });
    const rC = await Promise.allSettled([
      nucleo.estornarLiquidacao(USER_A, { liquidacaoId: pagConc.id, idempotencyKey: "est-3e8i-c", dataLiquidacao: "2026-10-24" }),
      nucleo2.estornarLiquidacao(USER_A, { liquidacaoId: pagConc.id, idempotencyKey: "est-3e8i-c", dataLiquidacao: "2026-10-24" }),
    ]);
    const c1 = settled(rC[0]!);
    const c2 = settled(rC[1]!);
    const idsC = [c1, c2].filter(x => x.ok).map(x => x.ok ? x.value : null);
    const movIds = idsC.map(x => x?.movimentoId);
    const estC = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE idempotency_key = ? AND user_id = ?", ["est-3e8i-c", USER_A]))[0]?.n);
    const movC = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_movimentos m JOIN financeiro_liquidacoes l ON l.id = m.liquidacao_id WHERE l.idempotency_key = ? AND l.user_id = ?", ["est-3e8i-c", USER_A]))[0]?.n);
    reg({
      id: "C",
      nome: "Dois estornos simultâneos mesma chave com movimentoId",
      ok: idsC.length === 2
        && idsC[0]?.id === idsC[1]?.id
        && Number(movIds[0]) > 0
        && movIds[0] === movIds[1]
        && estC === 1
        && movC === 1
        && !INTEGRACAO_CONFIRMACAO_VENDA_ATIVA,
      detalhe: { c1, c2, estC, movC },
    });

    const iso = await nucleo.estornarLiquidacao(USER_B, {
      liquidacaoId: pag.id, idempotencyKey: "est-3e8i-iso", dataLiquidacao: "2026-10-24",
    }).then(v => ({ ok: true as const, v })).catch(e => ({ ok: false as const, erro: msg(e) }));
    reg({
      id: "I",
      nome: "Isolamento por usuário",
      ok: !iso.ok,
      detalhe: { iso },
    });

    const [dbFinal] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    const depoisOp = await snapshotBanco(admin, OPERACIONAL);
    const depois47 = await snapshotBanco(admin, HOMOLOG_3C47);
    const depoisB2 = await snapshotBanco(admin, HOMOLOG_3B2A3);
    const depois5b = await snapshotBanco(admin, TESTE_3E5B);
    reg({
      id: "ISO",
      nome: "Bancos protegidos preservados",
      ok: dbFinal.db === TESTE
        && JSON.stringify(antesOp) === JSON.stringify(depoisOp)
        && JSON.stringify(antes47) === JSON.stringify(depois47)
        && JSON.stringify(antesB2) === JSON.stringify(depoisB2)
        && JSON.stringify(antes5b) === JSON.stringify(depois5b),
      detalhe: { dbFinal: dbFinal.db, MSG_FIN_MOVIMENTO_LIQUIDACAO },
    });
  } catch (e) {
    reg({ id: "ABORT", nome: "Execução", ok: false, detalhe: {}, erro: msg(e) });
  } finally {
    if (pool) await pool.end();
    if (pool2) await pool2.end();
    await admin.end();
  }

  const ok = problemas.length === 0;
  console.log(JSON.stringify({
    banco: TESTE,
    parecer: ok ? "APTO PARA PLANEJAR ATIVAÇÃO" : "NECESSITA CORREÇÕES",
    problemas,
    cenarios,
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
