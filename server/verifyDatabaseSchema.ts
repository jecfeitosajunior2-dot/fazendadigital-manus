import {
  collectDatabaseSchemaRequirements,
  type DatabaseSchemaRequirements,
} from "./databaseSchemaRequirements";

export type SchemaQuery = (sql: string) => Promise<unknown>;

export type SchemaIssue = {
  kind: "table" | "column" | "index" | "foreign_key" | "connection" | "query";
  table?: string;
  column?: string;
  index?: string;
  message: string;
};

export type VerifyDatabaseSchemaResult = {
  ok: boolean;
  schemaName: string | null;
  issues: SchemaIssue[];
};

export const SCHEMA_VERIFY_SQL = {
  database: "SELECT DATABASE() AS schema_name",
  tables: `SELECT TABLE_NAME AS table_name
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()`,
  columns: `SELECT TABLE_NAME AS table_name,
            COLUMN_NAME AS column_name,
            DATA_TYPE AS data_type,
            COLUMN_TYPE AS column_type,
            IS_NULLABLE AS is_nullable,
            CHARACTER_MAXIMUM_LENGTH AS character_maximum_length
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()`,
  indexes: `SELECT TABLE_NAME AS table_name,
            INDEX_NAME AS index_name,
            SEQ_IN_INDEX AS seq_in_index,
            COLUMN_NAME AS column_name,
            NON_UNIQUE AS non_unique
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
  constraints: `SELECT tc.TABLE_NAME AS table_name,
            tc.CONSTRAINT_NAME AS constraint_name,
            tc.CONSTRAINT_TYPE AS constraint_type,
            rc.DELETE_RULE AS delete_rule,
            rc.UPDATE_RULE AS update_rule,
            kcu.ORDINAL_POSITION AS ordinal_position,
            kcu.COLUMN_NAME AS column_name,
            kcu.REFERENCED_TABLE_NAME AS referenced_table_name,
            kcu.REFERENCED_COLUMN_NAME AS referenced_column_name
     FROM information_schema.TABLE_CONSTRAINTS tc
     LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
       ON rc.CONSTRAINT_SCHEMA = tc.TABLE_SCHEMA
      AND rc.TABLE_NAME = tc.TABLE_NAME
      AND rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
     LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
       ON kcu.CONSTRAINT_SCHEMA = tc.TABLE_SCHEMA
      AND kcu.TABLE_NAME = tc.TABLE_NAME
      AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
     WHERE tc.TABLE_SCHEMA = DATABASE()`,
} as const;

const WRITE_HEAD =
  /^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|CALL|GRANT|REVOKE|RENAME|LOCK|UNLOCK|LOAD|HANDLER|DO|REPLACE)\b/i;

export function assertReadOnlySelectSql(sql: string): void {
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new Error("verifyDatabaseSchema recusou SQL vazio.");
  }
  if (trimmed.includes(";")) {
    throw new Error("verifyDatabaseSchema recusou SQL com mais de um comando.");
  }
  if (!/^SELECT\b/i.test(trimmed)) {
    throw new Error("verifyDatabaseSchema só emite SELECT.");
  }
  if (WRITE_HEAD.test(trimmed) || /\b(INTO|FOR UPDATE|FOR SHARE)\b/i.test(trimmed)) {
    throw new Error("verifyDatabaseSchema recusou SQL de escrita.");
  }
}

export function typesCompatible(
  expectedSql: string,
  dataType: string,
  columnType: string,
  maxLength: number | null,
): boolean {
  const expected = expectedSql.toLowerCase().replace(/\s+/g, "");
  const actualType = String(dataType ?? "").toLowerCase();
  const actualColumn = String(columnType ?? "").toLowerCase().replace(/\s+/g, "");

  if (expected.startsWith("varchar(")) {
    const length = Number(expected.match(/^varchar\((\d+)\)$/)?.[1]);
    return actualType === "varchar" && maxLength === length;
  }
  if (expected.startsWith("decimal(")) {
    return actualColumn === expected || actualColumn.startsWith(expected);
  }
  if (expected.startsWith("enum(")) {
    return actualType === "enum" && actualColumn.startsWith("enum(");
  }
  if (expected === "text") {
    return ["text", "tinytext", "mediumtext", "longtext"].includes(actualType);
  }
  if (expected === "longtext") {
    return actualType === "longtext" || actualType === "mediumtext";
  }
  if (expected === "int") return actualType === "int";
  if (expected === "tinyint" || expected === "boolean") return actualType === "tinyint";
  if (expected === "timestamp") return actualType === "timestamp" || actualType === "datetime";
  if (expected === "date") return actualType === "date";
  return actualColumn === expected || actualColumn.startsWith(expected);
}

function asRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Array<Record<string, unknown>>;
  }
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  return [];
}

async function selectRows(query: SchemaQuery, sql: string): Promise<Array<Record<string, unknown>>> {
  assertReadOnlySelectSql(sql);
  return asRows(await query(sql));
}

export async function verifyDatabaseSchema(
  query: SchemaQuery,
  requirements: DatabaseSchemaRequirements = collectDatabaseSchemaRequirements(),
): Promise<VerifyDatabaseSchemaResult> {
  const issues: SchemaIssue[] = [];
  let schemaName: string | null = null;

  try {
    const dbRows = await selectRows(query, SCHEMA_VERIFY_SQL.database);
    schemaName = dbRows[0]?.schema_name == null ? null : String(dbRows[0].schema_name);
    if (!schemaName) {
      issues.push({ kind: "connection", message: "MySQL conectou, mas DATABASE() veio vazio." });
      return { ok: false, schemaName, issues };
    }

    const tableRows = await selectRows(query, SCHEMA_VERIFY_SQL.tables);
    const tables = new Set(tableRows.map((row) => String(row.table_name)));

    const columnRows = await selectRows(query, SCHEMA_VERIFY_SQL.columns);
    const columns = new Map<string, Record<string, unknown>>();
    for (const row of columnRows) {
      columns.set(`${row.table_name}.${row.column_name}`, row);
    }

    const indexRows = await selectRows(query, SCHEMA_VERIFY_SQL.indexes);
    const indexCols = new Map<string, Array<{ seq: number; column: string; nonUnique: number }>>();
    for (const row of indexRows) {
      const key = `${row.table_name}.${row.index_name}`;
      const list = indexCols.get(key) ?? [];
      list.push({
        seq: Number(row.seq_in_index),
        column: String(row.column_name ?? ""),
        nonUnique: Number(row.non_unique),
      });
      indexCols.set(key, list);
    }

    const constraintRows = await selectRows(query, SCHEMA_VERIFY_SQL.constraints);
    const foreignKeys = new Map<string, {
      deleteRule: string;
      updateRule: string;
      columns: Array<{ seq: number; column: string; referencedTable: string; referencedColumn: string }>;
    }>();
    for (const row of constraintRows) {
      if (String(row.constraint_type).toUpperCase() !== "FOREIGN KEY") continue;
      const key = `${row.table_name}.${row.constraint_name}`;
      const found = foreignKeys.get(key) ?? { deleteRule: "", updateRule: "", columns: [] };
      found.deleteRule = String(row.delete_rule ?? found.deleteRule).toUpperCase();
      found.updateRule = String(row.update_rule ?? found.updateRule).toUpperCase();
      if (row.column_name != null && String(row.column_name) !== "") {
        found.columns.push({
          seq: Number(row.ordinal_position ?? found.columns.length + 1),
          column: String(row.column_name),
          referencedTable: String(row.referenced_table_name ?? ""),
          referencedColumn: String(row.referenced_column_name ?? ""),
        });
      }
      foreignKeys.set(key, found);
    }

    for (const table of requirements.tables) {
      if (!tables.has(table)) {
        issues.push({ kind: "table", table, message: `Tabela obrigatória ausente: ${table}` });
      }
    }

    for (const col of requirements.columns) {
      const row = columns.get(`${col.table}.${col.column}`);
      if (!row) {
        issues.push({
          kind: "column",
          table: col.table,
          column: col.column,
          message: `Coluna obrigatória ausente: ${col.table}.${col.column}`,
        });
        continue;
      }
      const nullable = String(row.is_nullable).toUpperCase() === "YES";
      if (col.notNull && nullable) {
        issues.push({
          kind: "column",
          table: col.table,
          column: col.column,
          message: `Coluna ${col.table}.${col.column} deveria ser NOT NULL.`,
        });
      }
      if (col.mustAllowNull && !nullable) {
        issues.push({
          kind: "column",
          table: col.table,
          column: col.column,
          message: `Coluna ${col.table}.${col.column} precisa aceitar NULL.`,
        });
      }
      const maxLength =
        row.character_maximum_length == null ? null : Number(row.character_maximum_length);
      if (
        !typesCompatible(col.sqlType, String(row.data_type), String(row.column_type), maxLength)
      ) {
        issues.push({
          kind: "column",
          table: col.table,
          column: col.column,
          message: `Tipo incompatível em ${col.table}.${col.column}: esperado ${col.sqlType}, encontrado ${row.column_type}.`,
        });
      }
    }

    for (const index of requirements.indexes) {
      const key = `${index.table}.${index.name}`;
      const parts = indexCols.get(key);
      if (!parts) {
        issues.push({
          kind: "index",
          table: index.table,
          index: index.name,
          message: `Índice obrigatório ausente: ${index.table}.${index.name}`,
        });
        continue;
      }
      const isUnique = parts.every((part) => part.nonUnique === 0);
      if (index.unique && !isUnique) {
        issues.push({
          kind: "index",
          table: index.table,
          index: index.name,
          message: `Índice ${index.table}.${index.name} deveria ser UNIQUE.`,
        });
      }
      if (index.columns.length > 0) {
        const actual = [...parts].sort((a, b) => a.seq - b.seq).map((part) => part.column);
        if (actual.join("\0") !== index.columns.join("\0")) {
          issues.push({
            kind: "index",
            table: index.table,
            index: index.name,
            message: `Índice ${index.table}.${index.name} com ordem/colunas incorretas: esperado (${index.columns.join(", ")}), encontrado (${actual.join(", ")}).`,
          });
        }
      }
    }

    for (const fk of requirements.foreignKeys) {
      const found = foreignKeys.get(`${fk.table}.${fk.name}`);
      if (!found) {
        issues.push({
          kind: "foreign_key",
          table: fk.table,
          index: fk.name,
          message: `Chave estrangeira ausente: ${fk.table}.${fk.name}`,
        });
        continue;
      }
      if (fk.deleteRule && found.deleteRule !== fk.deleteRule) {
        issues.push({
          kind: "foreign_key",
          table: fk.table,
          index: fk.name,
          message: `Chave ${fk.table}.${fk.name} deveria recusar exclusão (${fk.deleteRule}), encontrado ${found.deleteRule || "indefinido"}.`,
        });
      }
      if (fk.updateRule && found.updateRule !== fk.updateRule) {
        issues.push({
          kind: "foreign_key",
          table: fk.table,
          index: fk.name,
          message: `Chave ${fk.table}.${fk.name} deveria recusar atualização (${fk.updateRule}), encontrado ${found.updateRule || "indefinido"}.`,
        });
      }
      if (fk.columns && fk.columns.length > 0) {
        const actual = [...found.columns].sort((a, b) => a.seq - b.seq);
        const actualColumns = actual.map((part) => part.column);
        if (actualColumns.join("\0") !== fk.columns.join("\0")) {
          issues.push({
            kind: "foreign_key",
            table: fk.table,
            index: fk.name,
            message: `Chave ${fk.table}.${fk.name} com ordem/colunas incorretas: esperado (${fk.columns.join(", ")}), encontrado (${actualColumns.join(", ")}).`,
          });
        }
        if (fk.referencedColumns && fk.referencedColumns.length > 0) {
          const actualReferenced = actual.map((part) => part.referencedColumn);
          const actualTable = actual.find((part) => part.referencedTable)?.referencedTable ?? "";
          if (
            actualReferenced.join("\0") !== fk.referencedColumns.join("\0")
            || (fk.referencedTable && actualTable !== fk.referencedTable)
          ) {
            issues.push({
              kind: "foreign_key",
              table: fk.table,
              index: fk.name,
              message: `Chave ${fk.table}.${fk.name} aponta para colunas incorretas: esperado ${fk.referencedTable ?? ""}(${fk.referencedColumns.join(", ")}), encontrado ${actualTable}(${actualReferenced.join(", ")}).`,
            });
          }
        }
      }
    }
  } catch (err) {
    issues.push({
      kind: "query",
      message: err instanceof Error ? err.message : "Falha ao consultar o schema.",
    });
  }

  return { ok: issues.length === 0, schemaName, issues };
}

export class DatabaseSchemaIncompatibleError extends Error {
  readonly issues: SchemaIssue[];
  readonly schemaName: string | null;

  constructor(result: VerifyDatabaseSchemaResult) {
    const detail = result.issues.map((issue) => issue.message).join(" | ") || "schema incompatível";
    super(`[schema] Banco incompatível com a aplicação: ${detail}`);
    this.name = "DatabaseSchemaIncompatibleError";
    this.issues = result.issues;
    this.schemaName = result.schemaName;
  }
}
