import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL!, connectionLimit: 1 });
  const db = drizzle(pool);
  const tables = await db.execute(sql`SHOW TABLES`);
  console.log("Tables:", JSON.stringify(tables[0], null, 2));
  await pool.end();
}

main().catch(err => console.error("Error:", err.message));
