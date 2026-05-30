import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL!;
  console.log("Connecting to DB...");
  const pool = mysql.createPool({ uri: url, connectionLimit: 1 });
  const db = drizzle(pool);
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: new URL("../drizzle/migrations", import.meta.url).pathname });
  console.log("Migrations complete!");
  await pool.end();
}

main().catch(err => { console.error("Migration failed:", err.message); process.exit(1); });
