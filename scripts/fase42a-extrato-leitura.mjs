/**
 * Fase 4.2A — somente leitura do extrato operacional da Caixa 97.
 */
import { writeFileSync } from "node:fs";
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

const [movs] = await conn.query(
  `SELECT id, conta_id, data_movimento, direcao, natureza, valor, descricao,
          liquidacao_id, transferencia_id, referencia, user_id
   FROM financeiro_movimentos
   WHERE conta_id = 97
   ORDER BY data_movimento ASC, id ASC`,
);
const [transf] = await conn.query("SELECT COUNT(*) n FROM financeiro_transferencias");
const [conta] = await conn.query(
  `SELECT id, nome, tipo, ativa, saldo_abertura, data_saldo_abertura, banco, agencia, numero_conta
   FROM financeiro_contas WHERE id = 97`,
);
await conn.end();

const out = {
  momento,
  schema,
  conta97: conta[0] ?? null,
  transferencias: Number(transf[0].n),
  movimentos: movs,
};
writeFileSync(
  `C:/Users/Pedro Neto/FazendaDigital-backups/homolog-fase42a/extrato-caixa97-${momento}.json`,
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
