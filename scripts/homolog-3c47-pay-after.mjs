import { createRequire } from "module";
import { existsSync, readFileSync } from "fs";
const require = createRequire(new URL("../package.json", import.meta.url));
const mysql = require("mysql2/promise");
function parse(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i)] = t.slice(i + 1);
  }
  return out;
}
const env = { ...parse(".env"), ...parse(".env.local") };
const u = new URL(env.DATABASE_URL);
const c = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 3306),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
});
await c.query("USE fazenda_digital_homolog_3c47");
const [db] = await c.query("SELECT DATABASE() db");
const [liq] = await c.query("SELECT id, tipo, conta_id, data_liquidacao, valor_movimentado, idempotency_key FROM financeiro_liquidacoes");
const [aloc] = await c.query(`SELECT a.id, a.liquidacao_id, a.parcela_id, a.principal_liquidado, a.desconto, a.juros, a.multa, p.numero
  FROM financeiro_liquidacao_alocacoes a JOIN financeiro_parcelas p ON p.id=a.parcela_id`);
const [mov] = await c.query("SELECT id, conta_id, direcao, natureza, valor, liquidacao_id FROM financeiro_movimentos");
const [cta] = await c.query("SELECT id, nome, ativa, saldo_abertura FROM financeiro_contas");
const [par] = await c.query("SELECT id, numero, valor_original FROM financeiro_parcelas WHERE titulo_id=1 ORDER BY numero");
const [op] = await c.query(`SELECT
  (SELECT COUNT(*) FROM fazenda_digital.financeiro_contas) contas,
  (SELECT COUNT(*) FROM fazenda_digital.financeiro_liquidacoes) liq,
  (SELECT COUNT(*) FROM fazenda_digital.financeiro_movimentos) mov`);
const [t80] = await c.query("SELECT id, estado, condicao_status, valor_original FROM fazenda_digital.financeiro_titulos WHERE id IN (80,84) ORDER BY id");
console.log(JSON.stringify({
  db: db[0].db,
  liquidacoes: liq,
  alocacoes: aloc,
  movimentos: mov,
  conta: cta,
  parcelas: par,
  operacional: { ...op[0], t80 },
}, null, 2));
await c.end();
