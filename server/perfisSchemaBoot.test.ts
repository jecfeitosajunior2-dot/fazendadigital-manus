import { describe, expect, it } from "vitest";
import { collectDatabaseSchemaRequirements } from "./databaseSchemaRequirements";
import { prepareDatabaseForBoot } from "./prepareDatabaseBoot";
import {
  SCHEMA_VERIFY_SQL,
  verifyDatabaseSchema,
  type SchemaQuery,
} from "./verifyDatabaseSchema";

type Snapshot = {
  schemaName: string;
  tables: Set<string>;
  columns: Map<string, Record<string, unknown>>;
  indexes: Array<Record<string, unknown>>;
  constraints: Array<Record<string, unknown>>;
};

function columnMeta(sqlType: string) {
  const sql = sqlType.toLowerCase().replace(/\s+/g, "");
  if (sql.startsWith("varchar(")) {
    const length = Number(sql.match(/^varchar\((\d+)\)$/)?.[1]);
    return { data_type: "varchar", column_type: sql, character_maximum_length: length };
  }
  if (sql.startsWith("enum(")) return { data_type: "enum", column_type: sql, character_maximum_length: null };
  if (sql === "timestamp") return { data_type: "timestamp", column_type: "timestamp", character_maximum_length: null };
  if (sql === "int") return { data_type: "int", column_type: "int", character_maximum_length: null };
  if (sql === "boolean" || sql === "tinyint") {
    return { data_type: "tinyint", column_type: "tinyint(1)", character_maximum_length: null };
  }
  if (sql.startsWith("decimal(")) return { data_type: "decimal", column_type: sql, character_maximum_length: null };
  if (sql === "text" || sql === "longtext" || sql === "date") {
    return { data_type: sql, column_type: sql, character_maximum_length: null };
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

describe("boot dos perfis e permissões", () => {
  it("estrutura completa da 0065 é aprovada", async () => {
    const result = await verifyDatabaseSchema(consultar(bancoIntegro()));
    expect(result.issues.map((issue) => issue.message)).toEqual([]);
    expect(result.ok).toBe(true);
    const req = collectDatabaseSchemaRequirements();
    expect(req.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "users_id_titular_uq", columns: ["id", "titularUserId"] }),
      expect.objectContaining({ name: "usuario_permissoes_usuario_permissao_uq", columns: ["userId", "permissao"] }),
    ]));
    expect(req.foreignKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "usuario_permissoes_usuario_titular_fk",
        columns: ["userId", "titularUserId"],
        referencedColumns: ["id", "titularUserId"],
      }),
      expect.objectContaining({
        name: "usuario_permissoes_origem_fk",
        columns: ["origemPerfilId", "titularUserId"],
        referencedColumns: ["id", "titularUserId"],
      }),
    ]));
  });

  it.each([
    ["perfis_acesso"],
    ["perfil_permissoes"],
    ["usuario_permissoes"],
  ])("ausência de %s é recusada", async (tabela) => {
    const snapshot = bancoIntegro();
    snapshot.tables.delete(tabela);
    const result = await verifyDatabaseSchema(consultar(snapshot));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.kind === "table" && issue.table === tabela)).toBe(true);
  });

  it("ausência do índice composto em users é recusada", async () => {
    const snapshot = bancoIntegro();
    snapshot.indexes = snapshot.indexes.filter((row) => row.index_name !== "users_id_titular_uq");
    const result = await verifyDatabaseSchema(consultar(snapshot));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.index === "users_id_titular_uq")).toBe(true);
  });

  it("índice composto com colunas trocadas é recusado", async () => {
    const snapshot = bancoIntegro();
    for (const row of snapshot.indexes) {
      if (row.index_name === "users_id_titular_uq" && row.seq_in_index === 1) row.column_name = "titularUserId";
      if (row.index_name === "users_id_titular_uq" && row.seq_in_index === 2) row.column_name = "id";
    }
    const result = await verifyDatabaseSchema(consultar(snapshot));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.index === "users_id_titular_uq" && /ordem\/colunas incorretas/.test(issue.message))).toBe(true);
  });

  it("ausência de índice único obrigatório é recusada", async () => {
    const snapshot = bancoIntegro();
    snapshot.indexes = snapshot.indexes.filter((row) => row.index_name !== "perfil_permissoes_perfil_permissao_uq");
    const result = await verifyDatabaseSchema(consultar(snapshot));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.index === "perfil_permissoes_perfil_permissao_uq")).toBe(true);
  });

  it("ausência de chave estrangeira obrigatória é recusada", async () => {
    const snapshot = bancoIntegro();
    snapshot.constraints = snapshot.constraints.filter((row) => row.constraint_name !== "usuario_permissoes_usuario_titular_fk");
    const result = await verifyDatabaseSchema(consultar(snapshot));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.index === "usuario_permissoes_usuario_titular_fk")).toBe(true);
  });

  it("chave estrangeira com colunas trocadas é recusada", async () => {
    const snapshot = bancoIntegro();
    for (const row of snapshot.constraints) {
      if (row.constraint_name !== "usuario_permissoes_origem_fk") continue;
      if (row.ordinal_position === 1) {
        row.column_name = "titularUserId";
        row.referenced_column_name = "titularUserId";
      }
      if (row.ordinal_position === 2) {
        row.column_name = "origemPerfilId";
        row.referenced_column_name = "id";
      }
    }
    const result = await verifyDatabaseSchema(consultar(snapshot));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.index === "usuario_permissoes_origem_fk" && /ordem\/colunas incorretas/.test(issue.message))).toBe(true);
  });

  it("restrição diferente de RESTRICT é recusada", async () => {
    const snapshot = bancoIntegro();
    const chave = snapshot.constraints.find((row) => row.constraint_name === "perfil_permissoes_perfil_fk");
    if (!chave) throw new Error("chave do perfil ausente no cenário");
    chave.delete_rule = "CASCADE";
    const result = await verifyDatabaseSchema(consultar(snapshot));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.index === "perfil_permissoes_perfil_fk" && /exclusão/.test(issue.message))).toBe(true);
  });

  it("fases 7.5, 7.6 e 7.7 continuam obrigatórias", async () => {
    const req = collectDatabaseSchemaRequirements();
    for (const coluna of ["papel", "titularUserId", "situacao", "sessionVersion"]) {
      expect(req.columns.some((col) => col.table === "users" && col.column === coluna)).toBe(true);
    }
    expect(req.foreignKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "usuario_fazendas_user_fk", deleteRule: "RESTRICT", updateRule: "RESTRICT" }),
      expect.objectContaining({ name: "auditoria_eventos_executor_fk", deleteRule: "RESTRICT", updateRule: "RESTRICT" }),
    ]));
    const snapshot = bancoIntegro();
    snapshot.tables.delete("usuario_fazendas");
    snapshot.tables.delete("auditoria_eventos");
    const result = await verifyDatabaseSchema(consultar(snapshot));
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.table)).toEqual(expect.arrayContaining(["usuario_fazendas", "auditoria_eventos"]));
  });

  it("banco indisponível bloqueia a inicialização sem modo local", async () => {
    await expect(prepareDatabaseForBoot({
      databaseUrl: "mysql://user:pass@127.0.0.1:3306/fazenda_digital",
      nodeEnv: "development",
      connect: async () => {
        throw new Error("ECONNREFUSED");
      },
    })).rejects.toThrow(/inicialização foi bloqueada/);
  });
});
