/**
 * Homologação 3E.5B — MySQL descartável fazenda_digital_test_3e5b.
 * Não grava em fazenda_digital nem fazenda_digital_homolog_3c47.
 * Não aplica migrate-all. Não usa db:push. Não chama ensureSchema.
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
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "../server/financeiroNucleo";
import type { ConfirmarVendaFinanceiroInput } from "../server/confirmarVendaFinanceiro";

const TESTE = "fazenda_digital_test_3e5b";
const OPERACIONAL = "fazenda_digital";
const HOMOLOG_3C47 = "fazenda_digital_homolog_3c47";
const USER_A = 930001;
const USER_B = 930002;
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
  if (!existe) return { existe: false as const };
  const count = async (tabela: string) => Number((await q<{ n: number }[]>(
    admin,
    `SELECT COUNT(*) n FROM \`${schemaName}\`.\`${tabela}\``,
  ))[0]?.n);
  const [chk] = await admin.query(
    `CHECKSUM TABLE \`${schemaName}\`.vendas, \`${schemaName}\`.animais, \`${schemaName}\`.financeiro_titulos, \`${schemaName}\`.financeiro_movimentos`,
  );
  return {
    existe: true as const,
    vendas: await count("vendas"),
    animais: await count("animais"),
    titulos: await count("financeiro_titulos"),
    movimentos: await count("financeiro_movimentos"),
    checksums: Object.fromEntries(
      (chk as Array<{ Table: string; Checksum: number | null }>).map(r => [String(r.Table).split(".").pop(), r.Checksum]),
    ),
  };
}

function svcDe(pool: mysql.Pool) {
  const db = drizzle(pool, { schema, mode: "default" as const });
  return createConfirmarVendaFinanceiroService(createConfirmarVendaFinanceiroMysqlStore(db));
}

function nucleoDe(pool: mysql.Pool) {
  const db = drizzle(pool, { schema, mode: "default" as const });
  return createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(db));
}

async function seedAnimal(
  pool: mysql.Pool,
  userId: number,
  fazendaId: number,
  brinco: string,
) {
  await pool.query(
    "INSERT INTO animais (`userId`, `brinco`, `sexo`, `status`, `fazendaId`) VALUES (?, ?, 'macho', 'ativo', ?)",
    [userId, brinco, fazendaId],
  );
  const [row] = await q<{ id: number }[]>(pool, "SELECT id FROM animais WHERE brinco = ? AND userId = ?", [brinco, userId]);
  return Number(row?.id);
}

async function main() {
  const cenarios: Cenario[] = [];
  const problemas: string[] = [];
  const cred = credenciais();
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
    const [server] = await q<{ hostname: string; port: number; version: string; db: string | null }[]>(
      admin,
      "SELECT @@hostname AS hostname, @@port AS port, @@version AS version, DATABASE() db",
    );
    const bancos = (await q<{ Database: string }[]>(admin, "SHOW DATABASES")).map(b => b.Database);
    const antesOp = await snapshotBanco(admin, OPERACIONAL);
    const antes47 = await snapshotBanco(admin, HOMOLOG_3C47);
    if (!antesOp.existe || !antes47.existe) throw new Error("ABORT: operacional ou homolog 3C47 ausente para conferência");

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

    const sql0061 = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../drizzle/migrations/0061_vendas_idempotency.sql"),
      "utf8",
    );
    if (!sql0061.includes("`idempotency_key` varchar(80) NULL") || !sql0061.includes("`vendas_idem_uq`")) {
      throw new Error("ABORT: 0061 não tem a definição esperada");
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

    const [col] = await q<{ Field: string; Type: string; Null: string }[]>(
      admin,
      `SHOW COLUMNS FROM \`${TESTE}\`.vendas LIKE 'idempotency_key'`,
    );
    const idx = await q<{ Key_name: string; Column_name: string; Non_unique: number }[]>(
      admin,
      `SHOW INDEX FROM \`${TESTE}\`.vendas`,
    );
    const nomesIdx = [...new Set(idx.map(i => i.Key_name))];
    reg({
      id: "0061",
      nome: "Migration 0061 no banco descartável",
      ok: col?.Field === "idempotency_key"
        && String(col.Type).includes("varchar(80)")
        && col.Null === "YES"
        && nomesIdx.includes("vendas_idem_uq")
        && nomesIdx.includes("vendas_fazenda_idx")
        && nomesIdx.includes("vendas_comprador_idx"),
      detalhe: { coluna: col, indices: nomesIdx },
    });

    const poolOpts = {
      host: cred.host,
      port: cred.port,
      user: cred.user,
      password: cred.password,
      database: TESTE,
    };
    pool = mysql.createPool({ ...poolOpts, connectionLimit: 8 });
    pool2 = mysql.createPool({ ...poolOpts, connectionLimit: 4 });
    const [db1] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    const [db2] = await q<{ db: string }[]>(pool2, "SELECT DATABASE() db");
    assertTeste(db1.db);
    assertTeste(db2.db);
    await pool.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const tabela of [...TABELAS].reverse()) {
      await pool.query(`DELETE FROM \`${tabela}\``);
    }
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");

    await pool.query(
      "INSERT INTO vendas (user_id, comprador, data, quantidade_animais, valor_total, status) VALUES (?, 'legado', '2026-01-01', 1, '10.00', 'concluido'), (?, 'legado', '2026-01-02', 1, '20.00', 'concluido')",
      [USER_A, USER_A],
    );
    const nulos = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE user_id = ? AND idempotency_key IS NULL", [USER_A]))[0]?.n);
    let uniqueMesmo = false;
    try {
      await pool.query(
        "INSERT INTO vendas (user_id, comprador, data, quantidade_animais, valor_total, status, idempotency_key) VALUES (?, 'x', '2026-01-03', 1, '1.00', 'concluido', 'ven-dup-a'), (?, 'y', '2026-01-04', 1, '1.00', 'concluido', 'ven-dup-a')",
        [USER_A, USER_A],
      );
    } catch (e) {
      uniqueMesmo = /duplicate/i.test(msg(e));
    }
    await pool.query(
      "INSERT INTO vendas (user_id, comprador, data, quantidade_animais, valor_total, status, idempotency_key) VALUES (?, 'a', '2026-01-05', 1, '1.00', 'concluido', 'ven-dup-b'), (?, 'b', '2026-01-06', 1, '1.00', 'concluido', 'ven-dup-b')",
      [USER_A, USER_B],
    );
    const distintos = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = 'ven-dup-b'"))[0]?.n);
    await pool.query("DELETE FROM vendas");
    reg({
      id: "UNIQUE",
      nome: "NULL múltiplo, mesma chave, usuários distintos",
      ok: nulos === 2 && uniqueMesmo && distintos === 2,
      detalhe: { nulos, uniqueMesmo, distintos },
    });

    await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda 3E5B A'), (?, 'Fazenda 3E5B B')", [USER_A, USER_B]);
    const fazendaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ?", [USER_A]))[0]?.id);
    const fazendaB = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ?", [USER_B]))[0]?.id);
    await pool.query(
      "INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Cliente sintético 3E5B A', 'cliente', 1), (?, 'Cliente sintético 3E5B B', 'cliente', 1)",
      [USER_A, USER_B],
    );
    const pessoaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ?", [USER_A]))[0]?.id);
    const pessoaB = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ?", [USER_B]))[0]?.id);
    await pool.query(
      "INSERT INTO financeiro_contas (user_id, nome, tipo, saldo_abertura, data_saldo_abertura, ativa) VALUES (?, 'Caixa 3E5B', 'caixa', '10000.00', '2026-10-01', 1)",
      [USER_A],
    );

    const idsA: number[] = [];
    for (let i = 1; i <= 16; i++) idsA.push(await seedAnimal(pool, USER_A, fazendaA, `3E5B-A${String(i).padStart(2, "0")}`));
    const animalB = await seedAnimal(pool, USER_B, fazendaB, "3E5B-B01");

    const svc = svcDe(pool);
    const svc2 = svcDe(pool2);
    const nucleo = nucleoDe(pool);

    const base = (key: string, a: number, b: number, extra: Partial<ConfirmarVendaFinanceiroInput> = {}): ConfirmarVendaFinanceiroInput => ({
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

    const aVista = await svc.confirmar(USER_A, base("ven-3e5b-av", idsA[0]!, idsA[1]!));
    const titA = (await q<{ origem_tipo: string; origem_item_chave: string; valor_original: string; pessoa_id: number; fazenda_origem_id: number }[]>(
      pool, "SELECT origem_tipo, origem_item_chave, valor_original, pessoa_id, fazenda_origem_id FROM financeiro_titulos WHERE id = ?", [aVista.tituloId],
    ))[0];
    const parcA = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_parcelas WHERE titulo_id = ?", [aVista.tituloId]))[0]?.n);
    reg({
      id: "A",
      nome: "Venda à vista",
      ok: aVista.success && aVista.valorTotal === 11000 && titA?.origem_tipo === "venda_animais"
        && titA.origem_item_chave === "principal" && Number(titA.valor_original) === 11000
        && titA.pessoa_id === pessoaA && titA.fazenda_origem_id === fazendaA && parcA === 1,
      detalhe: { aVista, titA, parcA },
    });

    const aPrazo = await svc.confirmar(USER_A, base("ven-3e5b-ap", idsA[2]!, idsA[3]!, {
      condicao: "a_prazo",
      parcelas: [{ numero: 1, vencimento: "2026-11-21", valorOriginal: 11000 }],
    }));
    const vencP = (await q<{ vencimento: string }[]>(
      pool,
      "SELECT DATE_FORMAT(vencimento, '%Y-%m-%d') vencimento FROM financeiro_parcelas WHERE titulo_id = ?",
      [aPrazo.tituloId],
    ))[0]?.vencimento;
    reg({
      id: "B",
      nome: "Venda a prazo",
      ok: aPrazo.success && vencP === "2026-11-21",
      detalhe: { aPrazo, vencP },
    });

    const parc = await svc.confirmar(USER_A, base("ven-3e5b-pc", idsA[4]!, idsA[5]!, {
      condicao: "parcelado",
      parcelas: [
        { numero: 1, vencimento: "2026-11-21", valorOriginal: 5000 },
        { numero: 2, vencimento: "2026-12-21", valorOriginal: 6000 },
      ],
    }));
    const nParc = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_parcelas WHERE titulo_id = ?", [parc.tituloId]))[0]?.n);
    reg({
      id: "C",
      nome: "Venda parcelada",
      ok: parc.success && nParc === 2,
      detalhe: { parc, nParc },
    });

    const depois = await svc.confirmar(USER_A, base("ven-3e5b-dd", idsA[6]!, idsA[7]!, {
      condicao: "definir_depois",
      parcelas: [],
    }));
    const nDepois = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_parcelas WHERE titulo_id = ?", [depois.tituloId]))[0]?.n);
    const condD = (await q<{ condicao_status: string }[]>(pool, "SELECT condicao_status FROM financeiro_titulos WHERE id = ?", [depois.tituloId]))[0]?.condicao_status;
    reg({
      id: "D",
      nome: "Definir depois",
      ok: depois.success && nDepois === 0 && condD === "a_definir",
      detalhe: { depois, nDepois, condD },
    });

    const drizzleFail = drizzle(pool, { schema, mode: "default" as const });
    const storeFail = createConfirmarVendaFinanceiroMysqlStore(drizzleFail);
    const wrapped = {
      transaction<T>(fn: Parameters<typeof storeFail.transaction>[0]) {
        return storeFail.transaction(async tx => {
          tx.fin.insertTitulo = async () => {
            throw new Error("falha financeira forçada");
          };
          return fn(tx);
        });
      },
    };
    const antesRollback = {
      vendas: Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas"))[0]?.n),
      baixas: Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM animal_baixas"))[0]?.n),
      titulos: Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos"))[0]?.n),
    };
    let falhouTitulo = false;
    try {
      await createConfirmarVendaFinanceiroService(wrapped).confirmar(USER_A, base("ven-3e5b-rb", idsA[8]!, idsA[9]!));
    } catch (e) {
      falhouTitulo = msg(e).includes("falha financeira forçada");
    }
    const depoisRollback = {
      vendas: Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas"))[0]?.n),
      baixas: Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM animal_baixas"))[0]?.n),
      titulos: Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos"))[0]?.n),
      animal8: (await q<{ status: string }[]>(pool, "SELECT status FROM animais WHERE id = ?", [idsA[8]]))[0]?.status,
      animal9: (await q<{ status: string }[]>(pool, "SELECT status FROM animais WHERE id = ?", [idsA[9]]))[0]?.status,
    };
    reg({
      id: "E",
      nome: "Rollback integral na falha do título",
      ok: falhouTitulo
        && depoisRollback.vendas === antesRollback.vendas
        && depoisRollback.baixas === antesRollback.baixas
        && depoisRollback.titulos === antesRollback.titulos
        && depoisRollback.animal8 === "ativo"
        && depoisRollback.animal9 === "ativo",
      detalhe: { antesRollback, depoisRollback, falhouTitulo },
    });

    const primeira = await svc.confirmar(USER_A, base("ven-3e5b-rt", idsA[8]!, idsA[9]!));
    const retry = await svc.confirmar(USER_A, base("ven-3e5b-rt", idsA[8]!, idsA[9]!));
    const nVendaRt = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = 'ven-3e5b-rt'"))[0]?.n);
    reg({
      id: "F",
      nome: "Retry mesma chave e mesmo payload",
      ok: retry.idempotente && retry.vendaId === primeira.vendaId && retry.tituloId === primeira.tituloId && nVendaRt === 1,
      detalhe: { primeira, retry, nVendaRt },
    });

    let conflito = false;
    try {
      await svc.confirmar(USER_A, base("ven-3e5b-rt", idsA[8]!, idsA[9]!, { condicao: "definir_depois", parcelas: [] }));
    } catch (e) {
      conflito = /já confirmou outra venda/i.test(msg(e));
    }
    reg({
      id: "G",
      nome: "Retry mesma chave e payload diferente",
      ok: conflito && nVendaRt === 1,
      detalhe: { conflito },
    });

    const concInput = base("ven-3e5b-cc", idsA[10]!, idsA[11]!);
    const conc = await Promise.allSettled([svc.confirmar(USER_A, concInput), svc2.confirmar(USER_A, concInput)]);
    const oks = conc.filter(r => r.status === "fulfilled") as PromiseFulfilledResult<typeof primeira>[];
    const nConc = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = 'ven-3e5b-cc'"))[0]?.n);
    const tConc = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id IN (SELECT id FROM vendas WHERE idempotency_key = 'ven-3e5b-cc')"))[0]?.n);
    const idsIguais = oks.length === 2 && oks.every(o => o.value.vendaId === oks[0]!.value.vendaId);
    reg({
      id: "H",
      nome: "Concorrência mesma chave",
      ok: nConc === 1 && tConc === 1 && oks.length === 2 && idsIguais,
      detalhe: {
        resultados: conc.map(r => r.status === "fulfilled" ? r.value : msg(r.reason)),
        nConc,
        tConc,
      },
    });

    const animalUnico = idsA[12]!;
    const concAnimal = await Promise.allSettled([
      svc.confirmar(USER_A, {
        idempotencyKey: "ven-3e5b-c1",
        fazendaId: fazendaA,
        data: "2026-10-21",
        compradorId: pessoaA,
        formaPrecificacao: "cabeca",
        itens: [{ animalId: animalUnico, precoUnitario: 1500 }],
        condicao: "definir_depois",
      }),
      svc2.confirmar(USER_A, {
        idempotencyKey: "ven-3e5b-c2",
        fazendaId: fazendaA,
        data: "2026-10-21",
        compradorId: pessoaA,
        formaPrecificacao: "cabeca",
        itens: [{ animalId: animalUnico, precoUnitario: 1500 }],
        condicao: "definir_depois",
      }),
    ]);
    const nAni = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM venda_itens WHERE animal_id = ?", [animalUnico]))[0]?.n);
    const nBai = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM animal_baixas WHERE animalId = ? AND status = 'ativa'", [animalUnico]))[0]?.n);
    const stAni = (await q<{ status: string }[]>(pool, "SELECT status FROM animais WHERE id = ?", [animalUnico]))[0]?.status;
    const fulfilledAni = concAnimal.filter(r => r.status === "fulfilled").length;
    reg({
      id: "I",
      nome: "Concorrência chaves diferentes no mesmo animal",
      ok: nAni === 1 && nBai === 1 && stAni === "vendido" && fulfilledAni === 1,
      detalhe: {
        resultados: concAnimal.map(r => r.status === "fulfilled" ? r.value : msg(r.reason)),
        nAni,
        nBai,
        stAni,
      },
    });

    let origemDup = false;
    try {
      await nucleo.criarTitulo(USER_A, {
        tipo: "receber",
        pessoaId: pessoaA,
        descricao: "segundo título",
        dataCompetencia: "2026-10-21",
        valorOriginal: 11000,
        origemTipo: "venda_animais",
        origemId: aVista.vendaId,
        origemItemChave: "principal",
      });
    } catch (e) {
      origemDup = /origem/i.test(msg(e)) || /duplicate/i.test(msg(e));
    }
    const nOrigem = Number((await q<{ n: number }[]>(
      pool,
      "SELECT COUNT(*) n FROM financeiro_titulos WHERE user_id = ? AND origem_tipo = 'venda_animais' AND origem_id = ?",
      [USER_A, aVista.vendaId],
    ))[0]?.n);
    reg({
      id: "J",
      nome: "UNIQUE da origem financeira",
      ok: origemDup && nOrigem === 1,
      detalhe: { origemDup, nOrigem },
    });

    const outroUser = await svc.confirmar(USER_B, {
      idempotencyKey: "ven-3e5b-av",
      fazendaId: fazendaB,
      data: "2026-10-21",
      compradorId: pessoaB,
      formaPrecificacao: "cabeca",
      itens: [{ animalId: animalB, precoUnitario: 1800 }],
      condicao: "definir_depois",
    });
    const nKeyAv = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = 'ven-3e5b-av'"))[0]?.n);
    reg({
      id: "K",
      nome: "Isolamento por usuário",
      ok: outroUser.success && outroUser.vendaId !== aVista.vendaId && nKeyAv === 2,
      detalhe: { outroUser, nKeyAv },
    });

    const movs = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_movimentos"))[0]?.n);
    const liqs = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_liquidacoes"))[0]?.n);
    reg({
      id: "L",
      nome: "Caixa inalterado",
      ok: movs === 0 && liqs === 0,
      detalhe: { movs, liqs },
    });

    const contagens = {
      vendas: Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas"))[0]?.n),
      itens: Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM venda_itens"))[0]?.n),
      baixas: Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM animal_baixas"))[0]?.n),
      titulos: Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos"))[0]?.n),
      parcelas: Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_parcelas"))[0]?.n),
      movimentos: movs,
    };
    const orfaos = Number((await q<{ n: number }[]>(
      pool,
      "SELECT COUNT(*) n FROM financeiro_titulos t LEFT JOIN vendas v ON v.id = t.origem_id AND t.origem_tipo = 'venda_animais' WHERE t.origem_tipo = 'venda_animais' AND v.id IS NULL",
    ))[0]?.n);
    reg({
      id: "ATOM",
      nome: "Sem título órfão e contagens",
      ok: orfaos === 0 && contagens.titulos === contagens.vendas && contagens.baixas === contagens.itens,
      detalhe: { contagens, orfaos },
    });

    const depoisOp = await snapshotBanco(admin, OPERACIONAL);
    const depois47 = await snapshotBanco(admin, HOMOLOG_3C47);
    const [dbFinal] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    reg({
      id: "ISO",
      nome: "Bancos existentes preservados",
      ok: dbFinal.db === TESTE
        && JSON.stringify(antesOp) === JSON.stringify(depoisOp)
        && JSON.stringify(antes47) === JSON.stringify(depois47),
      detalhe: { host: cred.host, databaseNaUrl: cred.databaseNaUrl, server, dbFinal: dbFinal.db, antesOp, depoisOp, antes47, depois47 },
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
    problemas,
    cenarios,
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
