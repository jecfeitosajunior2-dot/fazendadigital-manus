/**
 * Homologação 3E.8E — concorrência MySQL no banco descartável
 * fazenda_digital_test_3e8e.
 *
 * Não grava em fazenda_digital, homolog_3c47, homolog_3b2a3 nem test_3e5b.
 * Não usa db:push, migrate-all nem ensureSchema nos bancos protegidos.
 * Schema do 3e8e: CREATE TABLE LIKE a partir do operacional (estrutura, sem dados)
 * + coluna/índice 0061 só no descartável.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { createConfirmarVendaFinanceiroService } from "../server/confirmarVendaFinanceiro";
import { createConfirmarVendaFinanceiroMysqlStore } from "../server/confirmarVendaFinanceiroMysql";
import {
  createCancelarVendaFinanceiroService,
  MSG_VENDA_CANCELAR_COM_RECEBIMENTO,
} from "../server/cancelarVendaFinanceiro";
import { createCancelarVendaFinanceiroMysqlStore } from "../server/cancelarVendaFinanceiroMysql";
import { MSG_VENDA_CANCELAR_JA_CANCELADA } from "../server/cancelarVenda";
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "../server/financeiroNucleo";
import type { ConfirmarVendaFinanceiroInput } from "../server/confirmarVendaFinanceiro";
import { MSG_VENDA_CONFLITO_IDEMPOTENCIA } from "../shared/vendaFinanceiro";
import { MSG_FIN_LIQUIDACAO_JA_ESTORNADA, MSG_FIN_TITULO_CANCELADO } from "../shared/financeiroNucleo";

const TESTE = "fazenda_digital_test_3e8e";
const TESTE_3E5B = "fazenda_digital_test_3e5b";
const OPERACIONAL = "fazenda_digital";
const HOMOLOG_3C47 = "fazenda_digital_homolog_3c47";
const HOMOLOG_3B2A3 = "fazenda_digital_homolog_3b2a3";
const PROTEGIDOS = [OPERACIONAL, HOMOLOG_3C47, HOMOLOG_3B2A3, TESTE_3E5B] as const;
const USER_A = 940001;
const USER_B = 940002;
const TABELAS = [
  "pessoas",
  "fazendas",
  "lotes",
  "animais",
  "animal_baixas",
  "vendas",
  "venda_itens",
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

type Cenario = { id: string; nome: string; ok: boolean; detalhe: Record<string, unknown>; erro?: string };

const stats = { deadlock: 0, lockWait: 0, dup: 0, retryOk: 0 };

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
  if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) {
    throw new Error("ABORT: host não é MySQL local");
  }
  if ((u.pathname || "").replace(/^\//, "").split("?")[0] !== OPERACIONAL) {
    throw new Error("ABORT: URL operacional inesperada — recusando para não gravar no banco da URL");
  }
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    databaseNaUrl: (u.pathname || "").replace(/^\//, "").split("?")[0],
  };
}

async function q<T extends mysql.RowDataPacket[]>(
  conn: mysql.Connection | mysql.Pool,
  sqlText: string,
  params: unknown[] = [],
) {
  const [rows] = await conn.query(sqlText, params);
  return rows as T;
}

function assertTeste(nome: string | null) {
  if (nome !== TESTE) throw new Error(`ABORT: conexão em ${nome}, esperado ${TESTE}`);
  if ((PROTEGIDOS as readonly string[]).includes(String(nome))) {
    throw new Error(`ABORT: conexão em banco protegido ${nome}`);
  }
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function errnoDe(e: unknown): number | null {
  let atual: unknown = e;
  for (let i = 0; i < 8 && atual; i++) {
    if (typeof atual === "object" && atual != null) {
      const n = Number((atual as { errno?: number }).errno);
      if (Number.isInteger(n) && n > 0) return n;
      atual = (atual as { cause?: unknown }).cause ?? (atual as { original?: unknown }).original;
    } else break;
  }
  return null;
}

function anotarErro(e: unknown) {
  const n = errnoDe(e);
  const t = msg(e);
  if (n === 1213 || /deadlock/i.test(t)) stats.deadlock += 1;
  if (n === 1205 || /lock wait timeout/i.test(t)) stats.lockWait += 1;
  if (n === 1062 || /duplicate/i.test(t)) stats.dup += 1;
}

async function snapshotBanco(admin: mysql.Connection, schemaName: string) {
  const existe = Number((await q<{ n: number }[]>(
    admin,
    "SELECT COUNT(*) n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
    [schemaName],
  ))[0]?.n);
  if (!existe) return { existe: false as const, schemaName };
  const count = async (tabela: string) => {
    const tem = Number((await q<{ n: number }[]>(
      admin,
      "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
      [schemaName, tabela],
    ))[0]?.n);
    if (!tem) return null;
    return Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${schemaName}\`.\`${tabela}\``))[0]?.n);
  };
  const [chk] = await admin.query(
    `CHECKSUM TABLE \`${schemaName}\`.vendas, \`${schemaName}\`.animais, \`${schemaName}\`.financeiro_titulos, \`${schemaName}\`.financeiro_movimentos, \`${schemaName}\`.financeiro_liquidacoes`,
  );
  return {
    existe: true as const,
    schemaName,
    vendas: await count("vendas"),
    animais: await count("animais"),
    titulos: await count("financeiro_titulos"),
    movimentos: await count("financeiro_movimentos"),
    liquidacoes: await count("financeiro_liquidacoes"),
    checksums: Object.fromEntries(
      (chk as Array<{ Table: string; Checksum: number | null }>).map(r => [String(r.Table).split(".").pop(), r.Checksum]),
    ),
  };
}

function confirmarDe(pool: mysql.Pool) {
  const db = drizzle(pool, { schema, mode: "default" as const });
  return createConfirmarVendaFinanceiroService(createConfirmarVendaFinanceiroMysqlStore(db));
}

function cancelarDe(pool: mysql.Pool) {
  const db = drizzle(pool, { schema, mode: "default" as const });
  return createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(db));
}

function nucleoDe(pool: mysql.Pool) {
  const db = drizzle(pool, { schema, mode: "default" as const });
  return createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(db));
}

async function seedAnimal(pool: mysql.Pool, userId: number, fazendaId: number, brinco: string) {
  await pool.query(
    "INSERT INTO animais (`userId`, `brinco`, `sexo`, `status`, `fazendaId`) VALUES (?, ?, 'macho', 'ativo', ?)",
    [userId, brinco, fazendaId],
  );
  return Number((await q<{ id: number }[]>(pool, "SELECT id FROM animais WHERE brinco = ? AND userId = ?", [brinco, userId]))[0]?.id);
}

function settled<T>(r: PromiseSettledResult<T>) {
  if (r.status === "fulfilled") return { ok: true as const, value: r.value };
  anotarErro(r.reason);
  return { ok: false as const, erro: msg(r.reason) };
}

async function main() {
  const cenarios: Cenario[] = [];
  const problemas: string[] = [];
  const cred = credenciais();
  if ((PROTEGIDOS as readonly string[]).includes(TESTE)) {
    throw new Error("ABORT: nome do banco de teste colide com protegido");
  }
  const admin = await mysql.createConnection({
    host: cred.host,
    port: cred.port,
    user: cred.user,
    password: cred.password,
  });
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
    const [server] = await q<{ hostname: string; port: number; version: string; iso: string }[]>(
      admin,
      "SELECT @@hostname AS hostname, @@port AS port, @@version AS version, @@transaction_isolation AS iso",
    );
    const bancos = (await q<{ Database: string }[]>(admin, "SHOW DATABASES")).map(b => b.Database);
    const antesOp = await snapshotBanco(admin, OPERACIONAL);
    const antes47 = await snapshotBanco(admin, HOMOLOG_3C47);
    const antesB2 = await snapshotBanco(admin, HOMOLOG_3B2A3);
    const antes5b = await snapshotBanco(admin, TESTE_3E5B);
    if (!antesOp.existe || !antes47.existe) throw new Error("ABORT: operacional ou homolog 3C47 ausente");
    if (!antes5b.existe) throw new Error("ABORT: test_3e5b ausente — não seguir sem conferência");

    if (!bancos.includes(TESTE)) {
      await admin.query(`CREATE DATABASE \`${TESTE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    }
    for (const tabela of TABELAS) {
      const existeOp = Number((await q<{ n: number }[]>(
        admin,
        "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
        [OPERACIONAL, tabela],
      ))[0]?.n);
      if (existeOp !== 1) throw new Error(`Tabela operacional ${tabela} ausente`);
      const existeTeste = Number((await q<{ n: number }[]>(
        admin,
        "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
        [TESTE, tabela],
      ))[0]?.n);
      if (!existeTeste) {
        await admin.query(`CREATE TABLE \`${TESTE}\`.\`${tabela}\` LIKE \`${OPERACIONAL}\`.\`${tabela}\``);
      }
    }
    const jaTemColuna = Number((await q<{ n: number }[]>(
      admin,
      "SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendas' AND COLUMN_NAME = 'idempotency_key'",
      [TESTE],
    ))[0]?.n);
    if (!jaTemColuna) {
      await admin.query(`ALTER TABLE \`${TESTE}\`.\`vendas\` ADD COLUMN \`idempotency_key\` varchar(80) NULL`);
    }
    const jaTemIdx = Number((await q<{ n: number }[]>(
      admin,
      "SELECT COUNT(*) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendas' AND INDEX_NAME = 'vendas_idem_uq'",
      [TESTE],
    ))[0]?.n);
    if (!jaTemIdx) {
      await admin.query(`CREATE UNIQUE INDEX \`vendas_idem_uq\` ON \`${TESTE}\`.\`vendas\` (\`user_id\`, \`idempotency_key\`)`);
    }

    pool = mysql.createPool({
      host: cred.host, port: cred.port, user: cred.user, password: cred.password,
      database: TESTE, connectionLimit: 8,
    });
    pool2 = mysql.createPool({
      host: cred.host, port: cred.port, user: cred.user, password: cred.password,
      database: TESTE, connectionLimit: 4,
    });
    const [db1] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    const [db2] = await q<{ db: string }[]>(pool2, "SELECT DATABASE() db");
    assertTeste(db1.db);
    assertTeste(db2.db);
    const [iso] = await q<{ iso: string }[]>(pool, "SELECT @@transaction_isolation iso");

    await pool.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const tabela of [...TABELAS].reverse()) {
      await pool.query(`DELETE FROM \`${tabela}\``);
    }
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");

    await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda 3E8E A'), (?, 'Fazenda 3E8E B')", [USER_A, USER_B]);
    const fazendaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ?", [USER_A]))[0]?.id);
    const fazendaB = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ?", [USER_B]))[0]?.id);
    await pool.query(
      "INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Cliente sintético 3E8E A', 'cliente', 1), (?, 'Cliente sintético 3E8E B', 'cliente', 1)",
      [USER_A, USER_B],
    );
    const pessoaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ?", [USER_A]))[0]?.id);
    const pessoaB = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ?", [USER_B]))[0]?.id);
    await pool.query(
      "INSERT INTO financeiro_contas (user_id, nome, tipo, saldo_abertura, data_saldo_abertura, ativa) VALUES (?, 'Caixa 3E8E', 'caixa', '200000.00', '2026-10-01', 1)",
      [USER_A],
    );
    const contaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM financeiro_contas WHERE user_id = ?", [USER_A]))[0]?.id);

    const ids: number[] = [];
    for (let i = 1; i <= 28; i++) ids.push(await seedAnimal(pool, USER_A, fazendaA, `3E8E-A${String(i).padStart(2, "0")}`));
    const animalB = await seedAnimal(pool, USER_B, fazendaB, "3E8E-B01");

    const conf = confirmarDe(pool);
    const conf2 = confirmarDe(pool2);
    const canc = cancelarDe(pool);
    const canc2 = cancelarDe(pool2);
    const nucleo = nucleoDe(pool);
    const nucleo2 = nucleoDe(pool2);

    const cabeca = (key: string, animalId: number, extra: Partial<ConfirmarVendaFinanceiroInput> = {}): ConfirmarVendaFinanceiroInput => ({
      idempotencyKey: key,
      fazendaId: fazendaA,
      data: "2026-10-21",
      compradorId: pessoaA,
      formaPrecificacao: "cabeca",
      itens: [{ animalId, precoUnitario: 1500 }],
      condicao: "a_vista",
      ...extra,
    });
    const kg = (key: string, a: number, b: number, extra: Partial<ConfirmarVendaFinanceiroInput> = {}): ConfirmarVendaFinanceiroInput => ({
      idempotencyKey: key,
      fazendaId: fazendaA,
      data: "2026-10-21",
      compradorId: pessoaA,
      formaPrecificacao: "kg",
      precoPadrao: 20,
      itens: [
        { animalId: a, pesoVenda: 300, precoUnitario: 20 },
        { animalId: b, pesoVenda: 250, precoUnitario: 20 },
      ],
      condicao: "a_vista",
      ...extra,
    });

    async function nVendas() {
      return Number((await q<{ n: number }[]>(pool!, "SELECT COUNT(*) n FROM vendas"))[0]?.n);
    }
    async function titulosDaVenda(vendaId: number) {
      return Number((await q<{ n: number }[]>(
        pool!,
        "SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id = ? AND origem_item_chave = 'principal'",
        [vendaId],
      ))[0]?.n);
    }
    async function baixasAtivas(animalId: number) {
      return Number((await q<{ n: number }[]>(
        pool!,
        "SELECT COUNT(*) n FROM animal_baixas WHERE animalId = ? AND status = 'ativa'",
        [animalId],
      ))[0]?.n);
    }
    async function parcela(tituloId: number) {
      return Number((await q<{ id: number }[]>(pool!, "SELECT id FROM financeiro_parcelas WHERE titulo_id = ? ORDER BY numero LIMIT 1", [tituloId]))[0]?.id);
    }
    async function liqDaChave(key: string) {
      return Number((await q<{ id: number }[]>(pool!, "SELECT id FROM financeiro_liquidacoes WHERE user_id = ? AND idempotency_key = ?", [USER_A, key]))[0]?.id);
    }

    const isoOk = iso.iso === "REPEATABLE-READ";
    const raiz = dirname(fileURLToPath(import.meta.url));
    const nucleoSrc = readFileSync(join(raiz, "../server/financeiroNucleo.ts"), "utf8");
    const mysqlSrc = readFileSync(join(raiz, "../server/confirmarVendaFinanceiroMysql.ts"), "utf8");
    const locksAtualizados = ["lockContas", "lockTitulos", "lockParcelas", "lockLiquidacao", "lockTransferencia"]
      .every(fn => nucleoSrc.includes(`async ${fn}`))
      && nucleoSrc.includes("mapContaFromLock")
      && nucleoSrc.includes("mapParcelaFromLock")
      && nucleoSrc.includes("mapLiqFromLock")
      && nucleoSrc.includes("mapTransfFromLock")
      && mysqlSrc.includes('.for("update")')
      && mysqlSrc.includes("orderBy");
    reg({
      id: "RR",
      nome: "Isolamento REPEATABLE READ e locks no estado do FOR UPDATE",
      ok: isoOk && locksAtualizados && db1.db === TESTE,
      detalhe: { iso: iso.iso, db1: db1.db, db2: db2.db, locksAtualizados, adminDb: adminDb.db, server },
    });

    // A — mesmo animal, chaves diferentes
    const rA = await Promise.allSettled([
      conf.confirmar(USER_A, cabeca("ven-3e8e-a1", ids[0]!)),
      conf2.confirmar(USER_A, cabeca("ven-3e8e-a2", ids[0]!)),
    ]);
    const a1 = settled(rA[0]!);
    const a2 = settled(rA[1]!);
    const okAum = [a1, a2].filter(x => x.ok).length === 1;
    const recA = [a1, a2].filter(x => !x.ok).length === 1;
    const vendasA = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key IN ('ven-3e8e-a1','ven-3e8e-a2')"))[0]?.n);
    const titA = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id IN (SELECT id FROM vendas WHERE idempotency_key IN ('ven-3e8e-a1','ven-3e8e-a2'))"))[0]?.n);
    const stA = (await q<{ status: string }[]>(pool, "SELECT status FROM animais WHERE id = ?", [ids[0]]))[0]?.status;
    const bxA = await baixasAtivas(ids[0]!);
    if (a1.ok || a2.ok) stats.retryOk += Number(/deadlock/i.test(a1.ok ? "" : a1.erro) || /deadlock/i.test(a2.ok ? "" : a2.erro));
    reg({
      id: "A",
      nome: "Duas confirmações do mesmo animal, chaves distintas",
      ok: okAum && recA && vendasA === 1 && titA === 1 && stA === "vendido" && bxA === 1,
      detalhe: { a1, a2, vendasA, titA, stA, bxA },
    });

    // B — mesma chave, mesmo payload
    const rB = await Promise.allSettled([
      conf.confirmar(USER_A, cabeca("ven-3e8e-b", ids[1]!)),
      conf2.confirmar(USER_A, cabeca("ven-3e8e-b", ids[1]!)),
    ]);
    const b1 = settled(rB[0]!);
    const b2 = settled(rB[1]!);
    const idsB = [b1, b2].filter(x => x.ok).map(x => x.ok ? x.value : null);
    const vendasB = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = 'ven-3e8e-b'"))[0]?.n);
    const mesmosB = idsB.length === 2
      && idsB[0]?.vendaId === idsB[1]?.vendaId
      && idsB[0]?.tituloId === idsB[1]?.tituloId;
    const umB = idsB.length >= 1 && vendasB === 1;
    const recuperacaoB = [b1, b2].some(x => !x.ok && /recuperar a venda já confirmada/i.test(x.erro));
    reg({
      id: "B",
      nome: "Mesma chave ven- e mesmo payload",
      ok: umB && mesmosB,
      detalhe: { b1, b2, vendasB, mesmosB, recuperacaoB, integridadeUmaVenda: vendasB === 1 },
    });

    // C — mesma chave, payload diferente
    const cOk = await conf.confirmar(USER_A, cabeca("ven-3e8e-c", ids[2]!));
    let cMsg = "";
    try {
      await conf2.confirmar(USER_A, cabeca("ven-3e8e-c", ids[2]!, { condicao: "definir_depois", parcelas: [] }));
    } catch (e) {
      anotarErro(e);
      cMsg = msg(e);
    }
    const vendasC = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = 'ven-3e8e-c'"))[0]?.n);
    reg({
      id: "C",
      nome: "Mesma chave ven- com payload diferente",
      ok: cOk.success && vendasC === 1 && cMsg.includes(MSG_VENDA_CONFLITO_IDEMPOTENCIA),
      detalhe: { cOk, cMsg, vendasC },
    });

    // D — ids fora de ordem
    const d = await conf.confirmar(USER_A, kg("ven-3e8e-d", ids[4]!, ids[3]!));
    const itensD = await q<{ animal_id: number }[]>(pool, "SELECT animal_id FROM venda_itens WHERE venda_id = ? ORDER BY animal_id", [d.vendaId]);
    const stD3 = (await q<{ status: string }[]>(pool, "SELECT status FROM animais WHERE id = ?", [ids[3]]))[0]?.status;
    const stD4 = (await q<{ status: string }[]>(pool, "SELECT status FROM animais WHERE id = ?", [ids[4]]))[0]?.status;
    reg({
      id: "D",
      nome: "Múltiplos animais fora de ordem",
      ok: d.success && d.valorTotal === 11000 && itensD.map(i => i.animal_id).join(",") === `${ids[3]},${ids[4]}` && stD3 === "vendido" && stD4 === "vendido"
        && await titulosDaVenda(d.vendaId) === 1,
      detalhe: { d, itensD, stD3, stD4, lastListHint: "ORDER BY id no adapter" },
    });

    // E — cancelar venda 1 × confirmar animal da venda 1
    const eVenda = await conf.confirmar(USER_A, cabeca("ven-3e8e-e1", ids[5]!));
    const rE = await Promise.allSettled([
      canc.cancelar(USER_A, { vendaId: eVenda.vendaId, motivo: "corrida 3E8E E", canceladoPorUserId: USER_A }),
      conf2.confirmar(USER_A, cabeca("ven-3e8e-e2", ids[5]!)),
    ]);
    const eCanc = settled(rE[0]!);
    const eConf = settled(rE[1]!);
    const stE = (await q<{ status: string; id: number }[]>(pool, "SELECT id, status FROM animais WHERE id = ?", [ids[5]]))[0];
    const vendasE = await q<{ id: number; status: string | null; idempotency_key: string | null }[]>(
      pool,
      "SELECT id, status, idempotency_key FROM vendas WHERE idempotency_key IN ('ven-3e8e-e1','ven-3e8e-e2')",
    );
    const concluidasE = vendasE.filter(v => v.status === "concluido");
    const ativasE = await baixasAtivas(ids[5]!);
    const duplaE = concluidasE.length === 2;
    const eConsistente = !duplaE && ativasE <= 1 && (
      (eCanc.ok && stE?.status === "ativo" && !eConf.ok)
      || (eCanc.ok && eConf.ok && stE?.status === "vendido" && concluidasE.length === 1)
      || (!eCanc.ok && eConf.ok === false && stE?.status === "vendido" && concluidasE.length === 1)
      || (eConf.ok && concluidasE.length === 1 && stE?.status === "vendido")
    );
    reg({
      id: "E",
      nome: "Cancelamento × confirmação do mesmo animal",
      ok: eConsistente,
      detalhe: { eVenda, eCanc, eConf, stE, vendasE, ativasE, duplaE },
    });

    // F — cancelamento × recebimento
    const fVenda = await conf.confirmar(USER_A, cabeca("ven-3e8e-f", ids[6]!));
    const parcF = await parcela(fVenda.tituloId);
    const rF = await Promise.allSettled([
      canc.cancelar(USER_A, { vendaId: fVenda.vendaId, motivo: "corrida 3E8E F", canceladoPorUserId: USER_A }),
      nucleo2.criarRecebimento(USER_A, {
        contaId: contaA,
        dataLiquidacao: "2026-10-21",
        valorMovimentado: 1500,
        idempotencyKey: "rec-3e8e-f",
        alocacoes: [{ parcelaId: parcF, principalLiquidado: 1500 }],
      }),
    ]);
    const fCanc = settled(rF[0]!);
    const fRec = settled(rF[1]!);
    const titF = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [fVenda.tituloId]))[0]?.estado;
    const liqF = Number((await q<{ n: number }[]>(
      pool,
      "SELECT COUNT(*) n FROM financeiro_liquidacoes l INNER JOIN financeiro_liquidacao_alocacoes a ON a.liquidacao_id = l.id WHERE a.parcela_id = ?",
      [parcF],
    ))[0]?.n);
    const efetivaF = Number((await q<{ n: number }[]>(
      pool,
      `SELECT COUNT(*) n FROM financeiro_parcelas p
       JOIN financeiro_liquidacao_alocacoes a ON a.parcela_id = p.id
       JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id
       WHERE p.titulo_id = ? AND l.tipo IN ('recebimento','pagamento')
         AND NOT EXISTS (SELECT 1 FROM financeiro_liquidacoes e WHERE e.liquidacao_original_id = l.id)`,
      [fVenda.tituloId],
    ))[0]?.n);
    const fCancRecusa = !fCanc.ok && String(fCanc.erro).includes(MSG_VENDA_CANCELAR_COM_RECEBIMENTO);
    const fRecRecusa = !fRec.ok && String(fRec.erro).includes(MSG_FIN_TITULO_CANCELADO);
    reg({
      id: "F",
      nome: "Cancelamento × recebimento",
      ok: !(titF === "cancelado" && efetivaF > 0) && (fCancRecusa || fRecRecusa || (fCanc.ok && efetivaF === 0)),
      detalhe: { fCanc, fRec, titF, liqF, efetivaF, fCancRecusa, fRecRecusa },
    });

    // G — dois cancelamentos
    const gVenda = await conf.confirmar(USER_A, cabeca("ven-3e8e-g", ids[7]!));
    const rG = await Promise.allSettled([
      canc.cancelar(USER_A, { vendaId: gVenda.vendaId, motivo: "primeiro cancel 3E8E", canceladoPorUserId: USER_A }),
      canc2.cancelar(USER_A, { vendaId: gVenda.vendaId, motivo: "segundo cancel 3E8E", canceladoPorUserId: USER_A }),
    ]);
    const g1 = settled(rG[0]!);
    const g2 = settled(rG[1]!);
    const stG = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [gVenda.vendaId]))[0]?.status;
    const titG = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [gVenda.tituloId]))[0]?.estado;
    const umG = [g1, g2].filter(x => x.ok).length === 1;
    const recusaG = [g1, g2].some(x => !x.ok && String(x.erro).includes(MSG_VENDA_CANCELAR_JA_CANCELADA));
    reg({
      id: "G",
      nome: "Dois cancelamentos da mesma venda",
      ok: umG && recusaG && stG === "cancelado" && titG === "cancelado",
      detalhe: { g1, g2, stG, titG },
    });

    // H — dois estornos
    const hVenda = await conf.confirmar(USER_A, cabeca("ven-3e8e-h", ids[8]!));
    const parcH = await parcela(hVenda.tituloId);
    const recH = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA,
      dataLiquidacao: "2026-10-21",
      valorMovimentado: 1500,
      idempotencyKey: "rec-3e8e-h",
      alocacoes: [{ parcelaId: parcH, principalLiquidado: 1500 }],
    });
    const rH = await Promise.allSettled([
      nucleo.estornarLiquidacao(USER_A, { liquidacaoId: recH.id, idempotencyKey: "est-3e8e-h1", dataLiquidacao: "2026-10-22" }),
      nucleo2.estornarLiquidacao(USER_A, { liquidacaoId: recH.id, idempotencyKey: "est-3e8e-h2", dataLiquidacao: "2026-10-22" }),
    ]);
    const h1 = settled(rH[0]!);
    const h2 = settled(rH[1]!);
    const estH = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE liquidacao_original_id = ?", [recH.id]))[0]?.n);
    const movH = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_movimentos WHERE liquidacao_id IN (SELECT id FROM financeiro_liquidacoes WHERE liquidacao_original_id = ? OR id = ?)", [recH.id, recH.id]))[0]?.n);
    const recusaH = [h1, h2].some(x => !x.ok && String(x.erro).includes(MSG_FIN_LIQUIDACAO_JA_ESTORNADA));
    const umH = [h1, h2].filter(x => x.ok).length === 1;
    reg({
      id: "H",
      nome: "Dois estornos da mesma liquidação (chaves distintas)",
      ok: umH && recusaH && estH === 1 && movH === 2,
      detalhe: { h1, h2, estH, movH, recH: recH.id },
    });

    const hSameVenda = await conf.confirmar(USER_A, cabeca("ven-3e8e-hs", ids[9]!));
    const parcHs = await parcela(hSameVenda.tituloId);
    const recHs = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA,
      dataLiquidacao: "2026-10-21",
      valorMovimentado: 1500,
      idempotencyKey: "rec-3e8e-hs",
      alocacoes: [{ parcelaId: parcHs, principalLiquidado: 1500 }],
    });
    const rHs = await Promise.allSettled([
      nucleo.estornarLiquidacao(USER_A, { liquidacaoId: recHs.id, idempotencyKey: "est-3e8e-hs", dataLiquidacao: "2026-10-22" }),
      nucleo2.estornarLiquidacao(USER_A, { liquidacaoId: recHs.id, idempotencyKey: "est-3e8e-hs", dataLiquidacao: "2026-10-22" }),
    ]);
    const hs1 = settled(rHs[0]!);
    const hs2 = settled(rHs[1]!);
    const estHs = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE liquidacao_original_id = ?", [recHs.id]))[0]?.n);
    const idsHs = [hs1, hs2].filter(x => x.ok).map(x => x.ok ? x.value.id : null);
    const mesmosHs = idsHs.length === 2 && idsHs[0] === idsHs[1];
    reg({
      id: "H2",
      nome: "Dois estornos da mesma liquidação (mesma chave)",
      ok: estHs === 1 && (mesmosHs || idsHs.length === 1),
      detalhe: { hs1, hs2, estHs, idsHs },
    });

    // I — estorno × cancelamento
    const iVenda = await conf.confirmar(USER_A, cabeca("ven-3e8e-i", ids[10]!));
    const parcI = await parcela(iVenda.tituloId);
    const recI = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA,
      dataLiquidacao: "2026-10-21",
      valorMovimentado: 1500,
      idempotencyKey: "rec-3e8e-i",
      alocacoes: [{ parcelaId: parcI, principalLiquidado: 1500 }],
    });
    const rI = await Promise.allSettled([
      nucleo2.estornarLiquidacao(USER_A, { liquidacaoId: recI.id, idempotencyKey: "est-3e8e-i", dataLiquidacao: "2026-10-22" }),
      canc.cancelar(USER_A, { vendaId: iVenda.vendaId, motivo: "corrida estorno 3E8E I", canceladoPorUserId: USER_A }),
    ]);
    const iEst = settled(rI[0]!);
    const iCanc = settled(rI[1]!);
    const titI = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [iVenda.tituloId]))[0]?.estado;
    const efetivaI = Number((await q<{ n: number }[]>(
      pool,
      `SELECT COUNT(*) n FROM financeiro_parcelas p
       JOIN financeiro_liquidacao_alocacoes a ON a.parcela_id = p.id
       JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id
       WHERE p.titulo_id = ? AND l.tipo = 'recebimento'
         AND NOT EXISTS (SELECT 1 FROM financeiro_liquidacoes e WHERE e.liquidacao_original_id = l.id)`,
      [iVenda.tituloId],
    ))[0]?.n);
    const liqI = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE id = ? OR liquidacao_original_id = ?", [recI.id, recI.id]))[0]?.n);
    reg({
      id: "I",
      nome: "Estorno × cancelamento de venda",
      ok: !(titI === "cancelado" && efetivaI > 0) && liqI <= 2 && (iEst.ok || iCanc.ok),
      detalhe: { iEst, iCanc, titI, efetivaI, liqI },
    });

    // J — estorno × outro recebimento
    const jVenda = await conf.confirmar(USER_A, kg("ven-3e8e-j", ids[11]!, ids[12]!));
    const parcJ = await parcela(jVenda.tituloId);
    const recJ1 = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA,
      dataLiquidacao: "2026-10-21",
      valorMovimentado: 4000,
      idempotencyKey: "rec-3e8e-j1",
      alocacoes: [{ parcelaId: parcJ, principalLiquidado: 4000 }],
    });
    const rJ = await Promise.allSettled([
      nucleo.estornarLiquidacao(USER_A, { liquidacaoId: recJ1.id, idempotencyKey: "est-3e8e-j", dataLiquidacao: "2026-10-22" }),
      nucleo2.criarRecebimento(USER_A, {
        contaId: contaA,
        dataLiquidacao: "2026-10-21",
        valorMovimentado: 5000,
        idempotencyKey: "rec-3e8e-j2",
        alocacoes: [{ parcelaId: parcJ, principalLiquidado: 5000 }],
      }),
    ]);
    const jEst = settled(rJ[0]!);
    const jRec = settled(rJ[1]!);
    const movJ = Number((await q<{ n: number }[]>(
      pool,
      "SELECT COUNT(*) n FROM financeiro_movimentos m JOIN financeiro_liquidacoes l ON l.id = m.liquidacao_id JOIN financeiro_liquidacao_alocacoes a ON a.liquidacao_id = l.id WHERE a.parcela_id = ?",
      [parcJ],
    ))[0]?.n);
    const princJ = Number((await q<{ s: string }[]>(
      pool,
      `SELECT COALESCE(SUM(CASE
         WHEN l.tipo IN ('recebimento','pagamento') THEN a.principal_liquidado
         WHEN l.tipo LIKE 'estorno_%' THEN -a.principal_liquidado
         ELSE 0 END), 0) s
       FROM financeiro_liquidacao_alocacoes a
       JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id
       WHERE a.parcela_id = ?`,
      [parcJ],
    ))[0]?.s);
    const saldoJ = Number(princJ);
    const jConsistente = saldoJ >= 0 && saldoJ <= 11000 && movJ === Number((await q<{ n: number }[]>(
      pool,
      "SELECT COUNT(*) n FROM financeiro_liquidacoes l JOIN financeiro_liquidacao_alocacoes a ON a.liquidacao_id = l.id WHERE a.parcela_id = ?",
      [parcJ],
    ))[0]?.n);
    reg({
      id: "J",
      nome: "Estorno × outro recebimento do mesmo título",
      ok: jConsistente && (jEst.ok || jRec.ok) && saldoJ <= 11000,
      detalhe: { jEst, jRec, movJ, saldoJ },
    });

    // K — estorno histórico com título já cancelado (estado sintético)
    const kVenda = await conf.confirmar(USER_A, cabeca("ven-3e8e-k", ids[13]!));
    const parcK = await parcela(kVenda.tituloId);
    const recK = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA,
      dataLiquidacao: "2026-10-21",
      valorMovimentado: 1500,
      idempotencyKey: "rec-3e8e-k",
      alocacoes: [{ parcelaId: parcK, principalLiquidado: 1500 }],
    });
    await pool.query("UPDATE financeiro_titulos SET estado = 'cancelado' WHERE id = ? AND user_id = ?", [kVenda.tituloId, USER_A]);
    const kEst = await nucleo.estornarLiquidacao(USER_A, {
      liquidacaoId: recK.id,
      idempotencyKey: "est-3e8e-k",
      dataLiquidacao: "2026-10-22",
    });
    let kNovoRec = false;
    try {
      await nucleo.criarRecebimento(USER_A, {
        contaId: contaA,
        dataLiquidacao: "2026-10-23",
        valorMovimentado: 1500,
        idempotencyKey: "rec-3e8e-k-novo",
        alocacoes: [{ parcelaId: parcK, principalLiquidado: 1500 }],
      });
      kNovoRec = true;
    } catch (e) {
      kNovoRec = !String(msg(e)).includes(MSG_FIN_TITULO_CANCELADO);
    }
    const origK = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE id = ?", [recK.id]))[0]?.n);
    const estornoK = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE liquidacao_original_id = ?", [recK.id]))[0]?.n);
    const movK = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_movimentos WHERE liquidacao_id IN (?, ?)", [recK.id, kEst.id]))[0]?.n);
    reg({
      id: "K",
      nome: "Estorno histórico com título cancelado",
      ok: kEst.idempotente === false && origK === 1 && estornoK === 1 && movK === 2 && kNovoRec === false,
      detalhe: { kEst, origK, estornoK, movK, kNovoRec },
    });

    const orfaos = Number((await q<{ n: number }[]>(
      pool,
      "SELECT COUNT(*) n FROM financeiro_titulos t LEFT JOIN vendas v ON v.id = t.origem_id AND t.origem_tipo = 'venda_animais' WHERE t.origem_tipo = 'venda_animais' AND v.id IS NULL",
    ))[0]?.n);
    const dupTitulo = Number((await q<{ n: number }[]>(
      pool,
      "SELECT COUNT(*) n FROM (SELECT origem_id FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_item_chave = 'principal' GROUP BY origem_id HAVING COUNT(*) > 1) x",
    ))[0]?.n);
    const duplaVendaAnimal = Number((await q<{ n: number }[]>(
      pool,
      `SELECT COUNT(*) n FROM (
         SELECT vi.animal_id FROM venda_itens vi
         JOIN vendas v ON v.id = vi.venda_id
         WHERE v.status = 'concluido' AND v.user_id = ?
         GROUP BY vi.animal_id HAVING COUNT(*) > 1
       ) x`,
      [USER_A],
    ))[0]?.n);
    const cancComEfetiva = Number((await q<{ n: number }[]>(
      pool,
      `SELECT COUNT(*) n FROM financeiro_titulos t
       WHERE t.estado = 'cancelado' AND EXISTS (
         SELECT 1 FROM financeiro_parcelas p
         JOIN financeiro_liquidacao_alocacoes a ON a.parcela_id = p.id
         JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id
         WHERE p.titulo_id = t.id AND l.tipo = 'recebimento'
           AND NOT EXISTS (SELECT 1 FROM financeiro_liquidacoes e WHERE e.liquidacao_original_id = l.id)
       )`,
    ))[0]?.n);
    const isoUser = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE user_id = ?", [USER_B]))[0]?.n);
    await conf2.confirmar(USER_B, {
      idempotencyKey: "ven-3e8e-iso-b",
      fazendaId: fazendaB,
      data: "2026-10-21",
      compradorId: pessoaB,
      formaPrecificacao: "cabeca",
      itens: [{ animalId: animalB, precoUnitario: 1800 }],
      condicao: "definir_depois",
    });
    const isoUserDepois = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE user_id = ?", [USER_B]))[0]?.n);
    const saldoConta = await nucleo.calcularSaldoConta(USER_A, contaA);
    const movSum = Number((await q<{ s: string }[]>(
      pool,
      `SELECT COALESCE(SUM(CASE WHEN direcao = 'entrada' THEN valor WHEN direcao = 'saida' THEN -valor ELSE 0 END), 0) s
       FROM financeiro_movimentos WHERE user_id = ? AND conta_id = ?`,
      [USER_A, contaA],
    ))[0]?.s);
    const saldoFecha = Number(saldoConta) === 200000 + Number(movSum);

    reg({
      id: "INV",
      nome: "Invariantes financeiros A–J",
      ok: orfaos === 0 && dupTitulo === 0 && duplaVendaAnimal === 0 && cancComEfetiva === 0 && isoUserDepois === isoUser + 1 && saldoFecha,
      detalhe: { orfaos, dupTitulo, duplaVendaAnimal, cancComEfetiva, isoUser, isoUserDepois, saldoConta, movSum, saldoFecha, nVendas: await nVendas() },
    });

    const depoisOp = await snapshotBanco(admin, OPERACIONAL);
    const depois47 = await snapshotBanco(admin, HOMOLOG_3C47);
    const depoisB2 = await snapshotBanco(admin, HOMOLOG_3B2A3);
    const depois5b = await snapshotBanco(admin, TESTE_3E5B);
    const [dbFinal] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    reg({
      id: "ISO",
      nome: "Bancos protegidos e test_3e5b preservados",
      ok: dbFinal.db === TESTE
        && JSON.stringify(antesOp) === JSON.stringify(depoisOp)
        && JSON.stringify(antes47) === JSON.stringify(depois47)
        && JSON.stringify(antesB2) === JSON.stringify(depoisB2)
        && JSON.stringify(antes5b) === JSON.stringify(depois5b),
      detalhe: {
        host: cred.host,
        databaseNaUrl: cred.databaseNaUrl,
        dbFinal: dbFinal.db,
        antesOp, depoisOp, antes47, depois47, antesB2, depoisB2, antes5b, depois5b,
      },
    });
  } catch (e) {
    reg({ id: "ABORT", nome: "Execução", ok: false, detalhe: { stats }, erro: msg(e) });
  } finally {
    if (pool) await pool.end();
    if (pool2) await pool2.end();
    await admin.end();
  }

  const ok = problemas.length === 0;
  console.log(JSON.stringify({
    banco: TESTE,
    parecer: ok ? "APTO PARA AVANÇAR" : "NECESSITA CORREÇÕES",
    stats,
    problemas,
    cenarios,
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
