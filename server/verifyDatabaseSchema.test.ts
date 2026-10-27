import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectDatabaseSchemaRequirements } from "./databaseSchemaRequirements";
import {
  SCHEMA_VERIFY_SQL,
  assertReadOnlySelectSql,
  verifyDatabaseSchema,
  type SchemaQuery,
} from "./verifyDatabaseSchema";
import { INTEGRACAO_CONFIRMACAO_VENDA_ATIVA } from "../shared/vendaIntegracao";

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

function buildCompatibleSnapshot(): Snapshot {
  const req = collectDatabaseSchemaRequirements();
  const columns = new Map<string, Record<string, unknown>>();
  for (const col of req.columns) {
    columns.set(`${col.table}.${col.column}`, {
      table_name: col.table,
      column_name: col.column,
      is_nullable: col.notNull ? "NO" : "YES",
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
    constraints: req.foreignKeys.map((fk) => ({
      table_name: fk.table,
      constraint_name: fk.name,
      constraint_type: "FOREIGN KEY",
    })),
  };
}

function queryFromSnapshot(snapshot: Snapshot, emitted: string[]): SchemaQuery {
  return async (sql: string) => {
    emitted.push(sql);
    if (sql === SCHEMA_VERIFY_SQL.database) return [{ schema_name: snapshot.schemaName }];
    if (sql === SCHEMA_VERIFY_SQL.tables) {
      return [...snapshot.tables].map((table_name) => ({ table_name }));
    }
    if (sql === SCHEMA_VERIFY_SQL.columns) return [...snapshot.columns.values()];
    if (sql === SCHEMA_VERIFY_SQL.indexes) return snapshot.indexes;
    if (sql === SCHEMA_VERIFY_SQL.constraints) return snapshot.constraints;
    throw new Error(`SQL inesperado: ${sql}`);
  };
}

describe("verifyDatabaseSchema — somente leitura", () => {
  it("A — schema compatível libera a inicialização", async () => {
    const emitted: string[] = [];
    const result = await verifyDatabaseSchema(queryFromSnapshot(buildCompatibleSnapshot(), emitted));
    expect(result.ok).toBe(true);
    expect(result.schemaName).toBe("fazenda_digital");
    expect(result.issues).toEqual([]);
    expect(emitted.length).toBeGreaterThan(0);
  });

  it("B — coluna obrigatória ausente reprova e não corrige", async () => {
    const snapshot = buildCompatibleSnapshot();
    snapshot.columns.delete("vendas.comprador_id");
    const emitted: string[] = [];
    const result = await verifyDatabaseSchema(queryFromSnapshot(snapshot, emitted));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.column === "comprador_id" && issue.table === "vendas")).toBe(true);
    expect(emitted.every((sql) => sql.trim().startsWith("SELECT"))).toBe(true);
  });

  it("C — UNIQUE ausente reprova", async () => {
    const snapshot = buildCompatibleSnapshot();
    snapshot.indexes = snapshot.indexes.filter((row) => row.index_name !== "vendas_idem_uq");
    const result = await verifyDatabaseSchema(queryFromSnapshot(snapshot, []));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.index === "vendas_idem_uq")).toBe(true);
  });

  it("D — UNIQUE com ordem incorreta reprova", async () => {
    const snapshot = buildCompatibleSnapshot();
    for (const row of snapshot.indexes) {
      if (row.index_name === "vendas_idem_uq" && row.seq_in_index === 1) row.column_name = "idempotency_key";
      if (row.index_name === "vendas_idem_uq" && row.seq_in_index === 2) row.column_name = "user_id";
    }
    const result = await verifyDatabaseSchema(queryFromSnapshot(snapshot, []));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => /ordem\/colunas incorretas/.test(issue.message))).toBe(true);
  });

  it("F — erro de consulta falha controlada, sem SQL de escrita", async () => {
    const emitted: string[] = [];
    const result = await verifyDatabaseSchema(async (sql) => {
      emitted.push(sql);
      throw new Error("information_schema indisponível");
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe("query");
    expect(emitted.every((sql) => /^SELECT\b/i.test(sql.trim()))).toBe(true);
  });

  it("I — a rotina só emite SELECT de information_schema / DATABASE()", async () => {
    const emitted: string[] = [];
    await verifyDatabaseSchema(queryFromSnapshot(buildCompatibleSnapshot(), emitted));
    expect(emitted).toEqual([
      SCHEMA_VERIFY_SQL.database,
      SCHEMA_VERIFY_SQL.tables,
      SCHEMA_VERIFY_SQL.columns,
      SCHEMA_VERIFY_SQL.indexes,
      SCHEMA_VERIFY_SQL.constraints,
    ]);
    for (const sql of emitted) {
      expect(() => assertReadOnlySelectSql(sql)).not.toThrow();
    }
    expect(() => assertReadOnlySelectSql("ALTER TABLE vendas ADD COLUMN x int")).toThrow();
    expect(() => assertReadOnlySelectSql("UPDATE vendas SET status = 'x'")).toThrow();
  });

  it("0061 está entre os requisitos reais", () => {
    const req = collectDatabaseSchemaRequirements();
    const col = req.columns.find((item) => item.table === "vendas" && item.column === "idempotency_key");
    expect(col).toMatchObject({
      sqlType: "varchar(80)",
      notNull: false,
      mustAllowNull: true,
    });
    const index = req.indexes.find((item) => item.name === "vendas_idem_uq");
    expect(index).toEqual({
      table: "vendas",
      name: "vendas_idem_uq",
      unique: true,
      columns: ["user_id", "idempotency_key"],
    });
    expect(req.tables).toContain("vendas");
    expect(req.tables.length).toBeGreaterThan(20);
    expect(req.columns.length).toBeGreaterThan(100);
  });

  it("H — integração financeira permanece OFF", () => {
    expect(INTEGRACAO_CONFIRMACAO_VENDA_ATIVA).toBe(false);
  });

  it("G — verifyDatabaseSchema não chama ensureSchema", () => {
    const fonte = readFileSync(join(raiz, "verifyDatabaseSchema.ts"), "utf8");
    expect(fonte).not.toContain("ensureSchema");
    expect(fonte).not.toContain("pool.query");
    expect(fonte).not.toContain("CREATE TABLE");
    expect(fonte).not.toContain("ALTER TABLE");
  });
});
