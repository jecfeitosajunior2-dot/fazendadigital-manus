import { drizzle } from "drizzle-orm/mysql2";
import { createMysqlPool } from "./_core/mysqlPool";
import * as schema from "../drizzle/schema";

const pool = createMysqlPool(10);

export const db = drizzle(pool, { schema, mode: "default" });

// Re-export schema for convenience
export * from "../drizzle/schema";
