import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectDatabaseSchemaRequirements } from "./databaseSchemaRequirements";
import { prepareDatabaseForBoot } from "./prepareDatabaseBoot";
import {
  DatabaseSchemaIncompatibleError,
  SCHEMA_VERIFY_SQL,
  verifyDatabaseSchema,
  type SchemaQuery,
} from "./verifyDatabaseSchema";

const raiz = dirname(fileURLToPath(import.meta.url));

type Snapshot = {
  schemaName: string;
  tables: Set<string>;
  columns: Map<string, Record<string, unknown>>;
  indexes: Array<Record<string, unknown>>;
  constraints: Array<Record<string, unknown>>;
};

function parseVarcharLen(sql: string): number | null {
  const match = sql.toLowerCase().match(/^varchar\((\d+)\)$/);
  return match ? Number(match[1]) : null;
}

function columnMeta(sqlType: string) {
  const sql = sqlType.toLowerCase().replace(/\s+/g, "");
  if (sql.startsWith("varchar(")) {
    return { data_type: "varchar", column_type: sql, character_maximum_length: parseVarcharLen(sql) };
  }
  if (sql.startsWith("decimal(")) {
    return { data_type: "decimal", column_type: sql, character_maximum_length: null };
  }
  if (sql.startsWith("enum(")) {
    return { data_type: "enum", column_type: sql, character_maximum_length: null };
  }
  if (sql === "text" || sql === "longtext") {
    return { data_type: sql, column_type: sql, character_maximum_length: null };
  }
  if (sql === "boolean" || sql === "tinyint") {
    return { data_type: "tinyint", column_type: "tinyint(1)", character_maximum_length: null };
  }
  if (sql === "timestamp") {
    return { data_type: "timestamp", column_type: "timestamp", character_maximum_length: null };
  }
  if (sql === "date") {
    return { data_type: "date", column_type: "date", character_maximum_length: null };
  }
  if (sql === "int") {
    return { data_type: "int", column_type: "int", character_maximum_length: null };
  }
  return { data_type: sql, column_type: sql, character_maximum_length: null };
}

function bancoIntegro(): Snapshot {
  const req = collectDatabaseSchemaRequirements();
  const columns = new Map<string, Record<string, unknown>>();
  for (const col of req.columns) {
    columns.set(`${col.table}.${col.column}`, {
      table_name: col.table,
      column_name: col.column,
      is_nullable: col.mustAllowNull || !col.notNull ? "YES" : "NO",
      ...columnMeta(col.sqlType),
    });
  }
  const indexes: Array<Record<string, unknown>> = [];
  for (const index of req.indexes) {
    const cols = index.columns.length > 0 ? index.columns : ["(expr)"];
    cols.forEach((column, i) => {
      indexes.push({
        table_name: index.table,
        index_name: index.name,
        seq_in_index: i + 1,
        column_name: column,
        non_unique: index.unique ? 0 : 1,
      });
    });
  }
  return {
    schemaName: "fazenda_digital",
    tables: new Set(req.tables),
    columns,
    indexes,
    constraints: req.foreignKeys.flatMap((fk) => {
      const cols = fk.columns?.length ? fk.columns : [""];
      const refs = fk.referencedColumns ?? cols.map(() => "");
      return cols.map((column, i) => ({
        table_name: fk.table,
        constraint_name: fk.name,
        constraint_type: "FOREIGN KEY",
        delete_rule: fk.deleteRule ?? "CASCADE",
        update_rule: fk.updateRule ?? "CASCADE",
        ordinal_position: i + 1,
        column_name: column || null,
        referenced_table_name: fk.referencedTable ?? null,
        referenced_column_name: refs[i] || null,
      }));
    }),
  };
}

function consultar(snapshot: Snapshot): SchemaQuery {
  return async (sql: string) => {
    if (sql === SCHEMA_VERIFY_SQL.database) return [{ schema_name: snapshot.schemaName }];
    if (sql === SCHEMA_VERIFY_SQL.tables) return [...snapshot.tables].map((table_name) => ({ table_name }));
    if (sql === SCHEMA_VERIFY_SQL.columns) return [...snapshot.columns.values()];
    if (sql === SCHEMA_VERIFY_SQL.indexes) return snapshot.indexes;
    if (sql === SCHEMA_VERIFY_SQL.constraints) return snapshot.constraints;
    throw new Error("SQL inesperado");
  };
}

describe("boot da autorização e da auditoria", () => {
  it("banco íntegro libera a inicialização", async () => {
    const result = await verifyDatabaseSchema(consultar(bancoIntegro()));
    expect(result.issues.map((issue) => issue.message)).toEqual([]);
    expect(result.ok).toBe(true);
    const req = collectDatabaseSchemaRequirements();
    expect(req.tables).toEqual(expect.arrayContaining(["usuario_fazendas", "auditoria_eventos"]));
  });

  it("ausência de usuario_fazendas bloqueia", async () => {
    const snapshot = bancoIntegro();
    snapshot.tables.delete("usuario_fazendas");
    const result = await verifyDatabaseSchema(consultar(snapshot));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.table === "usuario_fazendas" && issue.kind === "table")).toBe(true);
  });

  it("ausência de auditoria_eventos bloqueia", async () => {
    const snapshot = bancoIntegro();
    snapshot.tables.delete("auditoria_eventos");
    const result = await verifyDatabaseSchema(consultar(snapshot));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.table === "auditoria_eventos" && issue.kind === "table")).toBe(true);
  });

  it("estrutura incompatível bloqueia", async () => {
    const snapshot = bancoIntegro();
    const fazenda = snapshot.columns.get("auditoria_eventos.fazendaId");
    if (!fazenda) throw new Error("coluna de fazenda ausente no cenário");
    fazenda.is_nullable = "NO";
    const vinculo = snapshot.constraints.find((row) => row.constraint_name === "usuario_fazendas_user_fk");
    if (!vinculo) throw new Error("chave de vínculo ausente no cenário");
    vinculo.delete_rule = "CASCADE";
    const result = await verifyDatabaseSchema(consultar(snapshot));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.column === "fazendaId")).toBe(true);
    expect(result.issues.some((issue) => issue.index === "usuario_fazendas_user_fk")).toBe(true);
  });

  it("falha de conexão não libera o modo local", async () => {
    await expect(prepareDatabaseForBoot({
      databaseUrl: "mysql://user:pass@127.0.0.1:3306/fazenda_digital",
      nodeEnv: "development",
      connect: async () => {
        throw new Error("ECONNREFUSED");
      },
    })).rejects.toThrow(/inicialização foi bloqueada/);
  });

  it("tabela ausente não é contornada pelo fallback local", async () => {
    const boot = readFileSync(join(raiz, "prepareDatabaseBoot.ts"), "utf8");
    expect(boot).not.toContain("listLocalFazendas");
    expect(boot).not.toContain("getLocalFazenda");
    await expect(prepareDatabaseForBoot({
      databaseUrl: "mysql://user:pass@127.0.0.1:3306/fazenda_digital",
      nodeEnv: "development",
      connect: async () => ({
        query: async () => [],
        end: async () => undefined,
      }),
      verify: async () => ({
        ok: false,
        schemaName: "fazenda_digital",
        issues: [{ kind: "table", table: "auditoria_eventos", message: "Tabela obrigatória ausente: auditoria_eventos" }],
      }),
    })).rejects.toBeInstanceOf(DatabaseSchemaIncompatibleError);
  });
});
