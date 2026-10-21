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
if (db[0].db !== "fazenda_digital_homolog_3c47") throw new Error("ABORT banco");
const [h] = await c.query(`SELECT
  (SELECT COUNT(*) FROM users WHERE email='homolog.3c47@teste.local') users,
  (SELECT descricao FROM financeiro_titulos WHERE id=1) descTit,
  (SELECT valor_original FROM financeiro_titulos WHERE id=1) valorTit,
  (SELECT COUNT(*) FROM financeiro_parcelas WHERE titulo_id=1) parcelas,
  (SELECT valor_original FROM financeiro_parcelas WHERE titulo_id=1 AND numero=1) p1,
  (SELECT valor_original FROM financeiro_parcelas WHERE titulo_id=1 AND numero=2) p2,
  (SELECT COUNT(*) FROM financeiro_contas WHERE nome='Caixa Homolog' AND ativa=1) caixa,
  (SELECT saldo_abertura FROM financeiro_contas WHERE nome='Caixa Homolog') abertura,
  (SELECT COUNT(*) FROM financeiro_liquidacoes) liq,
  (SELECT COUNT(*) FROM financeiro_movimentos) mov,
  (SELECT COUNT(*) FROM financeiro_liquidacao_alocacoes) aloc`);
const [op] = await c.query(`SELECT
  (SELECT COUNT(*) FROM fazenda_digital.financeiro_contas) contasOp,
  (SELECT COUNT(*) FROM fazenda_digital.financeiro_liquidacoes) liqOp`);
console.log(JSON.stringify({ db: db[0].db, homolog: h[0], operacional: op[0] }, null, 2));
await c.end();
const ok = h[0].users === 1 && h[0].descTit.includes("homologação") && Number(h[0].valorTit) === 250
  && h[0].parcelas === 2 && Number(h[0].p1) === 100 && Number(h[0].p2) === 150
  && h[0].caixa === 1 && Number(h[0].abertura) === 1000
  && h[0].liq === 0 && h[0].mov === 0 && h[0].aloc === 0
  && op[0].contasOp === 0 && op[0].liqOp === 0;
if (!ok) process.exit(2);
