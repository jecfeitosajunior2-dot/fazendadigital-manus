/**
 * Homologação 3E.8F — recuperação idempotente em concorrência MySQL.
 * Banco exclusivo: fazenda_digital_test_3e8e.
 * Não apaga os cenários da 3E.8E. Não grava em bancos protegidos.
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
import type { ConfirmarVendaFinanceiroInput } from "../server/confirmarVendaFinanceiro";
import { MSG_VENDA_CONFLITO_IDEMPOTENCIA } from "../shared/vendaFinanceiro";
import { INTEGRACAO_CONFIRMACAO_VENDA_ATIVA } from "../client/src/lib/novaVendaPendencia";

const TESTE = "fazenda_digital_test_3e8e";
const TESTE_3E5B = "fazenda_digital_test_3e5b";
const OPERACIONAL = "fazenda_digital";
const HOMOLOG_3C47 = "fazenda_digital_homolog_3c47";
const HOMOLOG_3B2A3 = "fazenda_digital_homolog_3b2a3";
const PROTEGIDOS = [OPERACIONAL, HOMOLOG_3C47, HOMOLOG_3B2A3, TESTE_3E5B] as const;
const USER_A = 940001;
const USER_B = 940002;
const RODADAS_B = 10;
const TABELAS = [
  "pessoas", "fazendas", "lotes", "animais", "animal_baixas", "vendas", "venda_itens",
  "financeiro_contas", "financeiro_categorias", "financeiro_centros_custo",
  "financeiro_titulos", "financeiro_parcelas", "financeiro_apropriacoes",
  "financeiro_liquidacoes", "financeiro_liquidacao_alocacoes",
  "financeiro_movimentos", "financeiro_transferencias",
] as const;

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

async function seedAnimal(pool: mysql.Pool, userId: number, fazendaId: number, brinco: string) {
  await pool.query(
    "INSERT INTO animais (`userId`, `brinco`, `sexo`, `status`, `fazendaId`) VALUES (?, ?, 'macho', 'ativo', ?)",
    [userId, brinco, fazendaId],
  );
  return Number((await q<{ id: number }[]>(pool, "SELECT id FROM animais WHERE brinco = ? AND userId = ?", [brinco, userId]))[0]?.id);
}

function settled<T>(r: PromiseSettledResult<T>) {
  if (r.status === "fulfilled") return { ok: true as const, value: r.value };
  return { ok: false as const, erro: msg(r.reason) };
}

async function main() {
  const cenarios: Cenario[] = [];
  const problemas: string[] = [];
  const cred = credenciais();
  const admin = await mysql.createConnection({
    host: cred.host, port: cred.port, user: cred.user, password: cred.password,
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
    const antesOp = await snapshotBanco(admin, OPERACIONAL);
    const antes47 = await snapshotBanco(admin, HOMOLOG_3C47);
    const antesB2 = await snapshotBanco(admin, HOMOLOG_3B2A3);
    const antes5b = await snapshotBanco(admin, TESTE_3E5B);
    if (!antesOp.existe || !antes47.existe) throw new Error("ABORT: operacional ou homolog 3C47 ausente");
    if (!antes5b.existe) throw new Error("ABORT: test_3e5b ausente — não seguir sem conferência");

    const bancos = (await q<{ Database: string }[]>(admin, "SHOW DATABASES")).map(b => b.Database);
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

    const vendas3e8eAntes = Number((await q<{ n: number }[]>(
      admin,
      `SELECT COUNT(*) n FROM \`${TESTE}\`.vendas WHERE idempotency_key LIKE 'ven-3e8e%'`,
    ))[0]?.n);

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

    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM fazendas WHERE userId = ?", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda 3E8F A')", [USER_A]);
    }
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM fazendas WHERE userId = ?", [USER_B]))[0]?.n)) {
      await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda 3E8F B')", [USER_B]);
    }
    const fazendaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    const fazendaB = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id LIMIT 1", [USER_B]))[0]?.id);
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM pessoas WHERE user_id = ? AND tipo = 'cliente'", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Cliente sintético 3E8F A', 'cliente', 1)", [USER_A]);
    }
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM pessoas WHERE user_id = ? AND tipo = 'cliente'", [USER_B]))[0]?.n)) {
      await pool.query("INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Cliente sintético 3E8F B', 'cliente', 1)", [USER_B]);
    }
    const pessoaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'cliente' ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    const pessoaB = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'cliente' ORDER BY id LIMIT 1", [USER_B]))[0]?.id);

    const animalA = await seedAnimal(pool, USER_A, fazendaA, "3E8F-A01");
    const animalC = await seedAnimal(pool, USER_A, fazendaA, "3E8F-C01");
    const animalIso = await seedAnimal(pool, USER_B, fazendaB, "3E8F-B01");
    const animaisB: number[] = [];
    for (let i = 1; i <= RODADAS_B; i++) {
      animaisB.push(await seedAnimal(pool, USER_A, fazendaA, `3E8F-B${String(i).padStart(2, "0")}`));
    }

    const conf = confirmarDe(pool);
    const conf2 = confirmarDe(pool2);
    const cabeca = (key: string, animalId: number, extra: Partial<ConfirmarVendaFinanceiroInput> = {}): ConfirmarVendaFinanceiroInput => ({
      idempotencyKey: key,
      fazendaId: fazendaA,
      data: "2026-10-23",
      compradorId: pessoaA,
      formaPrecificacao: "cabeca",
      itens: [{ animalId, precoUnitario: 1500 }],
      condicao: "a_vista",
      ...extra,
    });

    const raiz = dirname(fileURLToPath(import.meta.url));
    const mysqlSrc = readFileSync(join(raiz, "../server/confirmarVendaFinanceiroMysql.ts"), "utf8");
    const svcSrc = readFileSync(join(raiz, "../server/confirmarVendaFinanceiro.ts"), "utf8");
    const nucleoSrc = readFileSync(join(raiz, "../server/financeiroNucleo.ts"), "utf8");
    const flagOff = INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false
      && !readFileSync(join(raiz, "../client/src/lib/novaVendaPendencia.ts"), "utf8").includes("INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = true");

    reg({
      id: "RR",
      nome: "SELECT DATABASE nas duas conexões, REPEATABLE READ e integração desativada",
      ok: db1.db === TESTE && db2.db === TESTE && iso.iso === "REPEATABLE-READ" && flagOff
        && mysqlSrc.includes("lockTituloPrincipalDaVenda")
        && mysqlSrc.includes("FOR UPDATE")
        && svcSrc.includes("isDuplicateChaveIdempotenciaVenda")
        && svcSrc.includes("recuperarAposConflitoNoTx")
        && nucleoSrc.includes("createFinanceiroNucleoTxFromDrizzle"),
      detalhe: { db1: db1.db, db2: db2.db, iso: iso.iso, flagOff, vendas3e8eAntes },
    });

    const rA = await Promise.allSettled([
      conf.confirmar(USER_A, cabeca("ven-3e8f-a1", animalA)),
      conf2.confirmar(USER_A, cabeca("ven-3e8f-a2", animalA)),
    ]);
    const a1 = settled(rA[0]!);
    const a2 = settled(rA[1]!);
    const vendasA = Number((await q<{ n: number }[]>(
      pool,
      "SELECT COUNT(*) n FROM vendas WHERE idempotency_key IN ('ven-3e8f-a1','ven-3e8f-a2')",
    ))[0]?.n);
    const titA = Number((await q<{ n: number }[]>(
      pool,
      "SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id IN (SELECT id FROM vendas WHERE idempotency_key IN ('ven-3e8f-a1','ven-3e8f-a2'))",
    ))[0]?.n);
    const stA = (await q<{ status: string }[]>(pool, "SELECT status FROM animais WHERE id = ?", [animalA]))[0]?.status;
    const bxA = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM animal_baixas WHERE animalId = ? AND status = 'ativa'", [animalA]))[0]?.n);
    reg({
      id: "A",
      nome: "Regressão: mesmo animal, chaves distintas",
      ok: [a1, a2].filter(x => x.ok).length === 1 && [a1, a2].filter(x => !x.ok).length === 1
        && vendasA === 1 && titA === 1 && stA === "vendido" && bxA === 1,
      detalhe: { a1, a2, vendasA, titA, stA, bxA },
    });

    const rodadas: Array<Record<string, unknown>> = [];
    let todasB = true;
    for (let i = 1; i <= RODADAS_B; i++) {
      const key = `ven-3e8f-b${String(i).padStart(2, "0")}`;
      const animalId = animaisB[i - 1]!;
      const rB = await Promise.allSettled([
        conf.confirmar(USER_A, cabeca(key, animalId)),
        conf2.confirmar(USER_A, cabeca(key, animalId)),
      ]);
      const b1 = settled(rB[0]!);
      const b2 = settled(rB[1]!);
      const ids = [b1, b2].filter(x => x.ok).map(x => x.ok ? x.value : null);
      const vendasB = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = ?", [key]))[0]?.n);
      const vendaId = ids[0]?.vendaId ?? 0;
      const titB = Number((await q<{ n: number }[]>(
        pool,
        "SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id = ? AND origem_item_chave = 'principal'",
        [vendaId],
      ))[0]?.n);
      const bxB = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM animal_baixas WHERE animalId = ? AND status = 'ativa'", [animalId]))[0]?.n);
      const orfao = Number((await q<{ n: number }[]>(
        pool,
        `SELECT COUNT(*) n FROM vendas v
         LEFT JOIN financeiro_titulos t ON t.origem_tipo = 'venda_animais' AND t.origem_id = v.id AND t.origem_item_chave = 'principal'
         WHERE v.idempotency_key = ? AND t.id IS NULL`,
        [key],
      ))[0]?.n);
      const mesmos = ids.length === 2
        && ids[0]?.vendaId === ids[1]?.vendaId
        && ids[0]?.tituloId === ids[1]?.tituloId;
      const okRodada = mesmos && vendasB === 1 && titB === 1 && bxB === 1 && orfao === 0;
      if (!okRodada) todasB = false;
      rodadas.push({ i, key, animalId, b1, b2, vendasB, titB, bxB, orfao, mesmos });
    }
    reg({
      id: "B",
      nome: `Concorrência mesma chave/mesmo payload em ${RODADAS_B} rodadas`,
      ok: todasB,
      detalhe: { rodadas: RODADAS_B, falhas: rodadas.filter(r => r.mesmos !== true), amostra: rodadas.slice(0, 2) },
    });

    const cOk = await conf.confirmar(USER_A, cabeca("ven-3e8f-c", animalC));
    let cMsg = "";
    try {
      await conf2.confirmar(USER_A, cabeca("ven-3e8f-c", animalC, { condicao: "definir_depois", parcelas: [] }));
    } catch (e) {
      cMsg = msg(e);
    }
    const vendasC = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = 'ven-3e8f-c'"))[0]?.n);
    reg({
      id: "C",
      nome: "Regressão: mesma chave com payload diferente",
      ok: cOk.success && vendasC === 1 && cMsg.includes(MSG_VENDA_CONFLITO_IDEMPOTENCIA),
      detalhe: { cOk, cMsg, vendasC },
    });

    await conf2.confirmar(USER_B, {
      idempotencyKey: "ven-3e8f-iso-b",
      fazendaId: fazendaB,
      data: "2026-10-23",
      compradorId: pessoaB,
      formaPrecificacao: "cabeca",
      itens: [{ animalId: animalIso, precoUnitario: 1800 }],
      condicao: "definir_depois",
    });
    const isoB = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE user_id = ? AND idempotency_key = 'ven-3e8f-iso-b'", [USER_B]))[0]?.n);
    const cruzado = Number((await q<{ n: number }[]>(
      pool,
      "SELECT COUNT(*) n FROM vendas WHERE user_id = ? AND idempotency_key LIKE 'ven-3e8f%'",
      [USER_B],
    ))[0]?.n);

    const orfaos = Number((await q<{ n: number }[]>(
      pool,
      `SELECT COUNT(*) n FROM vendas v
       LEFT JOIN financeiro_titulos t ON t.origem_tipo = 'venda_animais' AND t.origem_id = v.id AND t.origem_item_chave = 'principal'
       WHERE v.idempotency_key LIKE 'ven-3e8f%' AND v.status = 'concluido' AND t.id IS NULL`,
    ))[0]?.n);
    const dupTitulo = Number((await q<{ n: number }[]>(
      pool,
      `SELECT COUNT(*) n FROM (
         SELECT origem_id FROM financeiro_titulos
         WHERE origem_tipo = 'venda_animais' AND origem_item_chave = 'principal'
           AND origem_id IN (SELECT id FROM vendas WHERE idempotency_key LIKE 'ven-3e8f%')
         GROUP BY origem_id HAVING COUNT(*) > 1
       ) x`,
    ))[0]?.n);
    const vendas3e8eDepois = Number((await q<{ n: number }[]>(
      pool,
      "SELECT COUNT(*) n FROM vendas WHERE idempotency_key LIKE 'ven-3e8e%'",
    ))[0]?.n);

    reg({
      id: "INV",
      nome: "Invariantes 3E.8F e preservação dos registros 3E.8E",
      ok: orfaos === 0 && dupTitulo === 0 && isoB === 1 && cruzado === 1 && vendas3e8eDepois === vendas3e8eAntes,
      detalhe: { orfaos, dupTitulo, isoB, cruzado, vendas3e8eAntes, vendas3e8eDepois },
    });

    const depoisOp = await snapshotBanco(admin, OPERACIONAL);
    const depois47 = await snapshotBanco(admin, HOMOLOG_3C47);
    const depoisB2 = await snapshotBanco(admin, HOMOLOG_3B2A3);
    const depois5b = await snapshotBanco(admin, TESTE_3E5B);
    const [dbFinal] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    reg({
      id: "ISO",
      nome: "Bancos protegidos preservados",
      ok: dbFinal.db === TESTE
        && JSON.stringify(antesOp) === JSON.stringify(depoisOp)
        && JSON.stringify(antes47) === JSON.stringify(depois47)
        && JSON.stringify(antesB2) === JSON.stringify(depoisB2)
        && JSON.stringify(antes5b) === JSON.stringify(depois5b),
      detalhe: { dbFinal: dbFinal.db, antesOp, depoisOp, antes47, depois47, antesB2, depoisB2, antes5b, depois5b },
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
    parecer: ok ? "APTO PARA AVANÇAR" : "NECESSITA CORREÇÕES",
    rodadasB: RODADAS_B,
    problemas,
    cenarios,
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
