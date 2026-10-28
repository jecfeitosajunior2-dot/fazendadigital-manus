/**
 * Fase 4.1 — somente leitura no schema operacional.
 * Não grava, não altera saldo, não cria lançamento.
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";

config({ path: ".env.local" });
config();

const raw = process.env.DATABASE_URL || "";
let schema = "";
try {
  schema = new URL(raw).pathname.replace(/^\//, "").split("?")[0];
} catch {
  schema = "parse_error";
}

if (schema !== "fazenda_digital") {
  console.log(JSON.stringify({ abort: true, schema }));
  process.exit(2);
}

const momento = process.argv[2] || "SNAPSHOT";
const conn = await mysql.createConnection({ uri: raw });
await conn.query("SET SESSION TRANSACTION READ ONLY");

const q = async (sql, params = []) => {
  const [rows] = await conn.query(sql, params);
  return rows;
};

const tables = await q("SHOW TABLES LIKE 'financeiro%'");
const tableNames = tables.map((row) => Object.values(row)[0]);

const countOrNull = async (table) => {
  if (!tableNames.includes(table) && table.startsWith("financeiro_")) {
    return null;
  }
  const rows = await q(`SELECT COUNT(*) n FROM \`${table}\``);
  return Number(rows[0].n);
};

const one = async (sql, params = []) => {
  const rows = await q(sql, params);
  return rows[0] ?? null;
};

const out = {
  momento,
  schema,
  tabelasFinanceiro: tableNames,
  vendas: await countOrNull("vendas"),
  titulos: await countOrNull("financeiro_titulos"),
  parcelas: await countOrNull("financeiro_parcelas"),
  liquidacoes: await countOrNull("financeiro_liquidacoes"),
  alocacoes: tableNames.includes("financeiro_liquidacao_alocacoes")
    ? await countOrNull("financeiro_liquidacao_alocacoes")
    : null,
  movimentos: await countOrNull("financeiro_movimentos"),
  legadoContas: await countOrNull("contas_financeiras"),
  legadoMovs: await countOrNull("movimentacoes"),
  caixa97: await one(
    `SELECT c.id, c.nome, c.saldo_abertura,
            (CAST(c.saldo_abertura AS DECIMAL(12,2))
              + COALESCE((SELECT SUM(CASE WHEN m.direcao = 'entrada' THEN m.valor ELSE -m.valor END)
                          FROM financeiro_movimentos m WHERE m.conta_id = c.id), 0)
            ) AS saldo
     FROM financeiro_contas c WHERE c.id = 97`,
  ),
  venda5: await one("SELECT id, status FROM vendas WHERE id = 5"),
  venda6: await one("SELECT id, status FROM vendas WHERE id = 6"),
  venda7: await one("SELECT id, status FROM vendas WHERE id = 7"),
  titulo108: await one("SELECT id, estado FROM financeiro_titulos WHERE id = 108"),
  titulo109: await one("SELECT id, estado FROM financeiro_titulos WHERE id = 109"),
  titulo110: await one("SELECT id, estado FROM financeiro_titulos WHERE id = 110"),
  parcela98: await one(
    `SELECT p.id, p.valor_original,
            (CAST(p.valor_original AS DECIMAL(12,2))
              - COALESCE((
                  SELECT SUM(CASE WHEN l.tipo LIKE 'estorno_%' THEN -a.principal_liquidado ELSE a.principal_liquidado END)
                  FROM financeiro_liquidacao_alocacoes a
                  JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id
                  WHERE a.parcela_id = p.id
                ), 0)
            ) AS saldo_aberto
     FROM financeiro_parcelas p WHERE p.id = 98`,
  ),
  parcela102: await one(
    `SELECT p.id, p.valor_original,
            (CAST(p.valor_original AS DECIMAL(12,2))
              - COALESCE((
                  SELECT SUM(CASE WHEN l.tipo LIKE 'estorno_%' THEN -a.principal_liquidado ELSE a.principal_liquidado END)
                  FROM financeiro_liquidacao_alocacoes a
                  JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id
                  WHERE a.parcela_id = p.id
                ), 0)
            ) AS saldo_aberto
     FROM financeiro_parcelas p WHERE p.id = 102`,
  ),
};

await conn.end();
console.log(JSON.stringify(out, null, 2));
