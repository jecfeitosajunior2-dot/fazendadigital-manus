/**
 * 3E.13I.3G — comparação estrutural somente leitura.
 * Não grava em nenhum schema. Não confirma venda.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import mysql from "mysql2/promise";

const OPERACIONAL = "fazenda_digital";
const TESTE = "fazenda_digital_test_3e13i3";
const EVID = "C:/Users/Pedro Neto/FazendaDigital-backups/homolog-3e13i3g";
const TABELAS = [
  "vendas",
  "venda_itens",
  "animal_baixas",
  "financeiro_titulos",
  "financeiro_parcelas",
  "animais",
  "pessoas",
  "fazendas",
  "lotes",
] as const;

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

function credenciaisAdmin() {
  const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };
  const raw = env.DATABASE_URL;
  if (!raw) throw new Error("ABORT: DATABASE_URL ausente");
  const u = new URL(raw);
  if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) throw new Error("ABORT: host não local");
  const db = (u.pathname || "").replace(/^\//, "").split("?")[0];
  if (db !== OPERACIONAL) throw new Error(`ABORT: URL admin aponta para ${db}`);
  return {
    host: u.hostname === "localhost" ? "127.0.0.1" : u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}

async function q<T extends mysql.RowDataPacket[]>(conn: mysql.Connection, sqlText: string, params: unknown[] = []) {
  const [rows] = await conn.query(sqlText, params);
  return rows as T;
}

function chaveCol(r: { TABLE_NAME: string; COLUMN_NAME: string }) {
  return `${r.TABLE_NAME}.${r.COLUMN_NAME}`;
}

async function main() {
  mkdirSync(EVID, { recursive: true });
  const cred = credenciaisAdmin();
  const admin = await mysql.createConnection({
    host: cred.host, port: cred.port, user: cred.user, password: cred.password,
  });
  try {
    const tabelas = await q<{ TABLE_SCHEMA: string; TABLE_NAME: string; ENGINE: string; TABLE_COLLATION: string }[]>(
      admin,
      `SELECT TABLE_SCHEMA, TABLE_NAME, ENGINE, TABLE_COLLATION
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA IN (?, ?) AND TABLE_NAME IN (${TABELAS.map(() => "?").join(",")})
       ORDER BY TABLE_NAME, TABLE_SCHEMA`,
      [OPERACIONAL, TESTE, ...TABELAS],
    );

    const colunas = await q<{
      TABLE_SCHEMA: string; TABLE_NAME: string; COLUMN_NAME: string; ORDINAL_POSITION: number;
      COLUMN_TYPE: string; IS_NULLABLE: string; COLUMN_DEFAULT: string | null; EXTRA: string;
    }[]>(
      admin,
      `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA IN (?, ?) AND TABLE_NAME IN (${TABELAS.map(() => "?").join(",")})
       ORDER BY TABLE_NAME, ORDINAL_POSITION, TABLE_SCHEMA`,
      [OPERACIONAL, TESTE, ...TABELAS],
    );

    const indices = await q<{
      TABLE_SCHEMA: string; TABLE_NAME: string; INDEX_NAME: string; NON_UNIQUE: number;
      SEQ_IN_INDEX: number; COLUMN_NAME: string | null; INDEX_TYPE: string; EXPRESSION: string | null;
    }[]>(
      admin,
      `SELECT TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, INDEX_TYPE, EXPRESSION
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA IN (?, ?) AND TABLE_NAME IN (${TABELAS.map(() => "?").join(",")})
       ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX, TABLE_SCHEMA`,
      [OPERACIONAL, TESTE, ...TABELAS],
    );

    const constraints = await q<{
      CONSTRAINT_SCHEMA: string; TABLE_NAME: string; CONSTRAINT_NAME: string; CONSTRAINT_TYPE: string;
    }[]>(
      admin,
      `SELECT CONSTRAINT_SCHEMA, TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE
       FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA IN (?, ?) AND TABLE_NAME IN (${TABELAS.map(() => "?").join(",")})
       ORDER BY TABLE_NAME, CONSTRAINT_TYPE, CONSTRAINT_NAME, CONSTRAINT_SCHEMA`,
      [OPERACIONAL, TESTE, ...TABELAS],
    );

    const fks = await q<{
      CONSTRAINT_SCHEMA: string; TABLE_NAME: string; CONSTRAINT_NAME: string; COLUMN_NAME: string;
      REFERENCED_TABLE_SCHEMA: string; REFERENCED_TABLE_NAME: string; REFERENCED_COLUMN_NAME: string;
    }[]>(
      admin,
      `SELECT CONSTRAINT_SCHEMA, TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_SCHEMA,
              REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE CONSTRAINT_SCHEMA IN (?, ?) AND REFERENCED_TABLE_NAME IS NOT NULL
         AND TABLE_NAME IN (${TABELAS.map(() => "?").join(",")})
       ORDER BY TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_SCHEMA`,
      [OPERACIONAL, TESTE, ...TABELAS],
    );

    const checks = await q<{ CONSTRAINT_SCHEMA: string; CONSTRAINT_NAME: string; CHECK_CLAUSE: string }[]>(
      admin,
      `SELECT CONSTRAINT_SCHEMA, CONSTRAINT_NAME, CHECK_CLAUSE
       FROM information_schema.CHECK_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA IN (?, ?)`,
      [OPERACIONAL, TESTE],
    );

    const triggers = await q<{ TRIGGER_SCHEMA: string; EVENT_OBJECT_TABLE: string; TRIGGER_NAME: string }[]>(
      admin,
      `SELECT TRIGGER_SCHEMA, EVENT_OBJECT_TABLE, TRIGGER_NAME
       FROM information_schema.TRIGGERS
       WHERE TRIGGER_SCHEMA IN (?, ?)`,
      [OPERACIONAL, TESTE],
    );

    const opCols = colunas.filter(c => c.TABLE_SCHEMA === OPERACIONAL);
    const teCols = colunas.filter(c => c.TABLE_SCHEMA === TESTE);
    const mapOp = new Map(opCols.map(c => [chaveCol(c), c]));
    const mapTe = new Map(teCols.map(c => [chaveCol(c), c]));
    const soNoOp = [...mapOp.keys()].filter(k => !mapTe.has(k));
    const soNoTe = [...mapTe.keys()].filter(k => !mapOp.has(k));
    const tipoDiferente = [...mapOp.keys()].filter(k => mapTe.has(k)).flatMap(k => {
      const a = mapOp.get(k)!;
      const b = mapTe.get(k)!;
      const campos: string[] = [];
      if (a.COLUMN_TYPE !== b.COLUMN_TYPE) campos.push(`tipo ${a.COLUMN_TYPE} vs ${b.COLUMN_TYPE}`);
      if (a.IS_NULLABLE !== b.IS_NULLABLE) campos.push(`null ${a.IS_NULLABLE} vs ${b.IS_NULLABLE}`);
      if (String(a.COLUMN_DEFAULT) !== String(b.COLUMN_DEFAULT)) campos.push(`default ${a.COLUMN_DEFAULT} vs ${b.COLUMN_DEFAULT}`);
      if (a.EXTRA !== b.EXTRA) campos.push(`extra ${a.EXTRA} vs ${b.EXTRA}`);
      return campos.length ? [{ coluna: k, diferencas: campos }] : [];
    });

    const idxKey = (r: { TABLE_NAME: string; INDEX_NAME: string; SEQ_IN_INDEX: number }) =>
      `${r.TABLE_NAME}.${r.INDEX_NAME}#${r.SEQ_IN_INDEX}`;
    const opIdx = new Map(indices.filter(i => i.TABLE_SCHEMA === OPERACIONAL).map(i => [idxKey(i), i]));
    const teIdx = new Map(indices.filter(i => i.TABLE_SCHEMA === TESTE).map(i => [idxKey(i), i]));
    const idxSoNoOp = [...opIdx.keys()].filter(k => !teIdx.has(k));
    const idxSoNoTe = [...teIdx.keys()].filter(k => !opIdx.has(k));

    const [fazenda] = await q<{ id: number; userId: number; nome: string }[]>(
      admin, `SELECT id, userId, nome FROM \`${OPERACIONAL}\`.fazendas WHERE id = 1`,
    );
    const [pessoa] = await q<{ id: number; user_id: number; nome: string; tipo: string; ativo: number }[]>(
      admin, `SELECT id, user_id, nome, tipo, ativo FROM \`${OPERACIONAL}\`.pessoas WHERE id = 17`,
    );
    const [animal] = await q<{
      id: number; userId: number; brinco: string; status: string; fazendaId: number | null;
      loteId: number | null; sexo: string; castrado: number | null; compraId: number | null;
    }[]>(
      admin,
      `SELECT id, userId, brinco, status, fazendaId, loteId, sexo, castrado, compraId
       FROM \`${OPERACIONAL}\`.animais WHERE id = 35`,
    );
    const baixas35 = Number((await q<{ n: number }[]>(
      admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.animal_baixas WHERE animalId = 35`,
    ))[0]?.n);
    let lote: { id: number; nome: string; fazendaId: number | null; userId: number } | null = null;
    if (animal?.loteId) {
      const rows = await q<{ id: number; nome: string; fazendaId: number | null; userId: number }[]>(
        admin, `SELECT id, nome, fazendaId, userId FROM \`${OPERACIONAL}\`.lotes WHERE id = ?`, [animal.loteId],
      );
      lote = rows[0] ?? null;
    }
    const mesmaConta = fazenda && pessoa && animal
      ? fazenda.userId === pessoa.user_id && pessoa.user_id === animal.userId
      : false;

    const creates: Record<string, { operacional?: string; teste?: string }> = {};
    for (const schemaName of [OPERACIONAL, TESTE]) {
      const existe = tabelas.some(t => t.TABLE_SCHEMA === schemaName);
      if (!schemaName || !existe) continue;
      await admin.query(`USE \`${schemaName}\``);
      for (const tabela of ["vendas", "venda_itens", "animal_baixas", "financeiro_titulos", "financeiro_parcelas"] as const) {
        try {
          const [row] = await q<Record<string, string>[]>(admin, `SHOW CREATE TABLE \`${tabela}\``);
          const ddl = String(Object.values(row)[1] ?? "");
          creates[tabela] ??= {};
          if (schemaName === OPERACIONAL) creates[tabela].operacional = ddl;
          else creates[tabela].teste = ddl;
        } catch (e) {
          creates[tabela] ??= {};
          if (schemaName === TESTE) creates[tabela].teste = `ERRO: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    }

    const relatorio = {
      fase: "3E.13I.3G",
      somenteLeitura: true,
      tabelasPresentes: tabelas,
      colunasSoNoOperacional: soNoOp,
      colunasSoNoTeste: soNoTe,
      colunasTipoDiferente: tipoDiferente,
      indicesSoNoOperacional: idxSoNoOp,
      indicesSoNoTeste: idxSoNoTe,
      constraints,
      fks,
      checks,
      triggers,
      registros: { fazenda, pessoa, animal, baixas35, lote, mesmaConta },
      creates,
    };
    writeFileSync(`${EVID}/comparacao.json`, JSON.stringify(relatorio, null, 2), "utf8");
    console.log(JSON.stringify({
      tabelas: tabelas.map(t => `${t.TABLE_SCHEMA}.${t.TABLE_NAME}`),
      colunasSoNoOperacional: soNoOp,
      colunasSoNoTeste: soNoTe,
      colunasTipoDiferente: tipoDiferente,
      indicesSoNoOperacional: idxSoNoOp,
      indicesSoNoTeste: idxSoNoTe,
      fks: fks.map(f => `${f.CONSTRAINT_SCHEMA}.${f.TABLE_NAME}.${f.CONSTRAINT_NAME} -> ${f.REFERENCED_TABLE_SCHEMA}.${f.REFERENCED_TABLE_NAME}`),
      checks: checks.length,
      triggers: triggers.length,
      registros: relatorio.registros,
      evidencia: `${EVID}/comparacao.json`,
    }, null, 2));
  } finally {
    await admin.end();
  }
}

main().catch(err => {
  console.error("[3e13i3g]", err instanceof Error ? err.message : err);
  process.exit(1);
});
