import mysql from "mysql2/promise";
import { env } from "./env";

function shouldUseSsl(): boolean {
  if (process.env.VERCEL === "1") return true;
  if (env.NODE_ENV === "production") return true;
  const url = env.DATABASE_URL.toLowerCase();
  return url.includes("tidbcloud") || url.includes("tidb") || url.includes("ssl-mode=required");
}

export function createMysqlPool(connectionLimit = 10) {
  const poolConfig: mysql.PoolOptions = {
    waitForConnections: true,
    connectionLimit,
  };

  if (shouldUseSsl()) {
    poolConfig.ssl = { minVersion: "TLSv1.2", rejectUnauthorized: true };
  }

  if (env.DATABASE_URL.startsWith("mysql://")) {
    return mysql.createPool(env.DATABASE_URL, poolConfig);
  }

  return mysql.createPool({ uri: env.DATABASE_URL, ...poolConfig });
}
