import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const tables = ['animais', 'lotes', 'saude_registros', 'reproducao_registros', 'maquinas', 'abastecimentos', 'manutencoes', 'pesagens', 'batidas', 'benfeitorias', 'estoque', 'contas_financeiras', 'movimentacoes', 'users'];
  for (const t of tables) {
    try {
      const [rows] = await conn.execute(`DESCRIBE ${t}`);
      const cols = rows.map(r => r.Field);
      console.log(`${t}: ${cols.join(', ')}`);
    } catch(e) {
      console.log(`${t}: ERROR - ${e.message}`);
    }
  }
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
