import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { createMysqlPool } from "../server/_core/mysqlPool";

function loadEnvFiles() {
  if (process.env.DATABASE_URL) return;
  config({ path: ".env.production.local" });
  config({ path: ".env.local" });
  config();
}

loadEnvFiles();

const [, , emailArg, passwordArg, nameArg, roleArg] = process.argv;

if (!emailArg || !passwordArg) {
  console.error("Uso: tsx scripts/create-user.ts <email> <senha> [nome] [admin|user]");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não configurada.");
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
const password = passwordArg;
const name = (nameArg || email.split("@")[0] || "Usuário").trim();
const role = roleArg === "user" ? "user" : "admin";
const openId = `local:${email}`;
const passwordHash = await bcrypt.hash(password, 12);

const pool = createMysqlPool(1);

try {
  await pool.query(
    `INSERT INTO users
      (openId, name, email, loginMethod, passwordHash, role, createdAt, updatedAt)
     VALUES (?, ?, ?, 'local', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       email = VALUES(email),
       loginMethod = 'local',
       passwordHash = VALUES(passwordHash),
       role = VALUES(role),
       updatedAt = CURRENT_TIMESTAMP`,
    [openId, name, email, passwordHash, role]
  );

  const [rows] = await pool.query("SELECT id, email, role FROM users WHERE email = ? LIMIT 1", [email]);
  const user = (rows as { id: number; email: string; role: string }[])[0];
  console.log(`Usuário pronto: id=${user?.id} email=${user?.email} role=${user?.role}`);
} finally {
  await pool.end();
}
