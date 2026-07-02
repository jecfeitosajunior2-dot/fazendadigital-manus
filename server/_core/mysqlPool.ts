import mysql from "mysql2/promise";
import { env } from "./env";

function parseDatabaseUrl(connectionUrl: string): mysql.PoolOptions {
  const parsed = new URL(connectionUrl);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
  };
}

function shouldUseSsl(connectionUrl: string): boolean {
  const url = connectionUrl.toLowerCase();
  if (url.includes("localhost") || url.includes("127.0.0.1")) return false;
  return true;
}

export function createMysqlPool(connectionLimit = 10) {
  const base = parseDatabaseUrl(env.DATABASE_URL);
  const poolConfig: mysql.PoolOptions = {
    ...base,
    waitForConnections: true,
    connectionLimit,
  };

  if (shouldUseSsl(env.DATABASE_URL)) {
    poolConfig.ssl = { minVersion: "TLSv1.2", rejectUnauthorized: true };
  }

  return mysql.createPool(poolConfig);
}
