import mysql from "mysql2/promise";
import { env } from "./env";

function shouldUseSsl(): boolean {
  if (env.NODE_ENV === "production") return true;
  const url = env.DATABASE_URL.toLowerCase();
  return url.includes("tidbcloud") || url.includes("ssl-mode=required");
}

export function createMysqlPool(connectionLimit = 10) {
  return mysql.createPool({
    uri: env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit,
    ...(shouldUseSsl() ? { ssl: { minVersion: "TLSv1.2" } } : {}),
  });
}
