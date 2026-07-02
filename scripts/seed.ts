import { config } from "dotenv";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

config({ path: ".env.local" });
config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL não configurada. Copie .env.example para .env.");
}

const email = process.env.ADMIN_EMAIL || "admin@fazendadigital.local";
const password = process.env.ADMIN_PASSWORD || "admin123";
const name = process.env.ADMIN_NAME || "Administrador";
const passwordHash = await bcrypt.hash(password, 12);
const pool = mysql.createPool({ uri: databaseUrl, connectionLimit: 1 });

try {
  await pool.query(
    `INSERT INTO users
      (openId, name, email, loginMethod, passwordHash, role, createdAt, updatedAt)
     VALUES (?, ?, ?, 'local', ?, 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       email = VALUES(email),
       loginMethod = 'local',
       passwordHash = VALUES(passwordHash),
       role = 'admin',
       updatedAt = CURRENT_TIMESTAMP`,
    [email, name, email, passwordHash],
  );

  console.log(`Usuário administrador pronto: ${email}`);
} finally {
  await pool.end();
}
