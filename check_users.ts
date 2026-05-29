import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL!, connectionLimit: 1 });
  const db = drizzle(pool);
  const cols = await db.execute(sql`DESCRIBE users`);
  console.log("Users columns:", JSON.stringify(cols[0], null, 2));
  await pool.end();
}

main().catch(err => console.error("Error:", err.message));
