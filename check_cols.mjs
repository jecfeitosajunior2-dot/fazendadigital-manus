import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.execute('DESCRIBE animais');
  console.log(JSON.stringify(rows, null, 2));
  const [rows2] = await conn.execute('SELECT * FROM animais LIMIT 3');
  console.log('Data:', JSON.stringify(rows2, null, 2));
  await conn.end();
}
main().catch(console.error);
