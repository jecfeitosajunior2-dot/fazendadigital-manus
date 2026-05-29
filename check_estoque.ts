import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL!, connectionLimit: 1 });
  const db = drizzle(pool);
  const result = await db.execute(sql`SHOW TABLES LIKE 'estoque%'`);
  console.log("Estoque tables:", JSON.stringify(result[0]));
  const result2 = await db.execute(sql`SHOW TABLES LIKE 'contas%'`);
  console.log("Contas tables:", JSON.stringify(result2[0]));
  const result3 = await db.execute(sql`SHOW TABLES LIKE 'moviment%'`);
  console.log("Movimentacoes tables:", JSON.stringify(result3[0]));
  await pool.end();
}

main().catch(err => console.error("Error:", err.message));
