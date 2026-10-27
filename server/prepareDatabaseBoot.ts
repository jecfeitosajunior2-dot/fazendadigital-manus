import { createMysqlPool } from "./_core/mysqlPool";
import {
  DatabaseSchemaIncompatibleError,
  assertReadOnlySelectSql,
  verifyDatabaseSchema,
  type SchemaQuery,
  type VerifyDatabaseSchemaResult,
} from "./verifyDatabaseSchema";

export type DatabaseBootMode = "mysql" | "offline";

export type PrepareDatabaseBootDeps = {
  databaseUrl?: string | undefined;
  nodeEnv?: string;
  verify?: (query: SchemaQuery) => Promise<VerifyDatabaseSchemaResult>;
  connect?: () => Promise<{ query: SchemaQuery; end: () => Promise<void> }>;
};

export function isDatabaseUrlConfigured(url: string | undefined | null): boolean {
  return typeof url === "string" && url.trim().length > 0;
}

function mysqlAdapter(pool: { query: (sql: string) => Promise<unknown>; end: () => Promise<void> }): {
  query: SchemaQuery;
  end: () => Promise<void>;
} {
  return {
    async query(sql: string) {
      assertReadOnlySelectSql(sql);
      const result = await pool.query(sql);
      return result;
    },
    end: () => pool.end(),
  };
}

async function defaultConnect(): Promise<{ query: SchemaQuery; end: () => Promise<void> }> {
  if (process.env.VITEST) {
    throw new Error(
      "prepareDatabaseForBoot recusou conexão real durante testes. Injete connect/verify.",
    );
  }
  const pool = createMysqlPool(1);
  return mysqlAdapter(pool);
}

export async function prepareDatabaseForBoot(
  deps: PrepareDatabaseBootDeps = {},
): Promise<DatabaseBootMode> {
  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  const nodeEnv = deps.nodeEnv ?? process.env.NODE_ENV ?? "development";

  if (!isDatabaseUrlConfigured(databaseUrl)) {
    if (nodeEnv === "production") {
      throw new Error("[startup] DATABASE_URL ausente. Inicialização bloqueada em produção.");
    }
    console.warn(
      "[startup] DATABASE_URL ausente. Servidor sobe sem MySQL (modo local de desenvolvimento).",
    );
    return "offline";
  }

  const connect = deps.connect ?? defaultConnect;
  let session: { query: SchemaQuery; end: () => Promise<void> } | null = null;
  try {
    session = await connect();
    const verify = deps.verify ?? ((query: SchemaQuery) => verifyDatabaseSchema(query));
    const result = await verify(session.query);
    if (!result.ok) {
      for (const issue of result.issues) {
        console.error("[schema]", issue.message);
      }
      throw new DatabaseSchemaIncompatibleError(result);
    }
    console.log(`[schema] Compatível (${result.schemaName ?? "mysql"}). Nenhuma alteração aplicada.`);
    return "mysql";
  } catch (err) {
    if (err instanceof DatabaseSchemaIncompatibleError) throw err;
    const message = err instanceof Error ? err.message : "Banco indisponível.";
    throw new Error(`[startup] MySQL configurado, mas a inicialização foi bloqueada: ${message}`);
  } finally {
    if (session) {
      await session.end().catch(() => undefined);
    }
  }
}
