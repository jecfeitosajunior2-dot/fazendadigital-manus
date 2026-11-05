import { config } from "dotenv";
config({ path: ".env.local" });
config();
import mysql from "mysql2/promise";

const u = new URL(process.env.DATABASE_URL!);
const c = await mysql.createConnection({
  host: u.hostname === "localhost" ? "127.0.0.1" : u.hostname,
  port: Number(u.port || 3306),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
});
const [[g]] = await c.query("SELECT @@general_log AS g, @@log_output AS o");
const [[op]] = await c.query(`
  SELECT
    (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='fazenda_digital') t,
    (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA='fazenda_digital' AND CONSTRAINT_TYPE='FOREIGN KEY') f,
    (SELECT COUNT(*) FROM fazenda_digital.vendas) v,
    (SELECT COUNT(*) FROM fazenda_digital.venda_itens) i,
    (SELECT COUNT(*) FROM fazenda_digital.animal_baixas) b,
    (SELECT COUNT(*) FROM fazenda_digital.financeiro_titulos) ti,
    (SELECT COUNT(*) FROM fazenda_digital.financeiro_titulos WHERE origem_tipo='venda_animais') tv,
    (SELECT COUNT(*) FROM fazenda_digital.animais) a
`);
const [[c61]] = await c.query(`
  SELECT COLUMN_TYPE, IS_NULLABLE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='fazenda_digital' AND TABLE_NAME='vendas' AND COLUMN_NAME='idempotency_key'
`);
const [idx] = await c.query(`
  SELECT SEQ_IN_INDEX, COLUMN_NAME, NON_UNIQUE
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='fazenda_digital' AND INDEX_NAME='vendas_idem_uq'
  ORDER BY SEQ_IN_INDEX
`);
const [[desc]] = await c.query(
  "SELECT COUNT(*) n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='fazenda_digital_test_boot_3e11e2'",
);
const [[idxd]] = await c.query(
  "SELECT COUNT(*) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='fazenda_digital_test_boot_3e11e2' AND INDEX_NAME='vendas_idem_uq'",
);
if (String((g as { o?: string }).o).toUpperCase() === "TABLE") {
  await c.query("SET GLOBAL log_output = 'FILE'");
}
const [[g2]] = await c.query("SELECT @@general_log AS g, @@log_output AS o");
console.log(JSON.stringify({ generalAntes: g, generalDepois: g2, operacional: op, col0061: c61, idx0061: idx, schemaDescartavel: Number(desc.n) === 1, idxDescartavel: Number(idxd.n) }, null, 2));
await c.end();
