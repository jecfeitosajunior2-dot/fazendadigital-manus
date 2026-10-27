import { getTableColumns, getTableName, isTable } from "drizzle-orm";
import * as schema from "../drizzle/schema";

export type SchemaColumnRequirement = {
  table: string;
  column: string;
  sqlType: string;
  notNull: boolean;
  /** Se true, a coluna precisa aceitar NULL (ex.: 0061). */
  mustAllowNull: boolean;
};

export type SchemaIndexRequirement = {
  table: string;
  name: string;
  unique: boolean;
  columns: string[];
};

export type SchemaForeignKeyRequirement = {
  table: string;
  name: string;
};

export type DatabaseSchemaRequirements = {
  tables: string[];
  columns: SchemaColumnRequirement[];
  indexes: SchemaIndexRequirement[];
  foreignKeys: SchemaForeignKeyRequirement[];
};

const EXTRA_CONFIG = Symbol.for("drizzle:ExtraConfigBuilder");

/** Índices Drizzle ainda não presentes no operacional; não bloqueiam o boot. */
const INDEXES_NOT_REQUIRED = new Set([
  "nutricao_fornecimentos.nutricao_fornecimentos_cocho_idx",
  "nutricao_fornecimentos.nutricao_fornecimentos_batida_idx",
]);

/** FKs que o núcleo financeiro e as compras usam de fato. */
const REQUIRED_FOREIGN_KEYS: SchemaForeignKeyRequirement[] = [
  { table: "compra_grupos", name: "compra_grupos_compra_fk" },
  { table: "compra_recebimentos", name: "compra_recebimentos_compra_fk" },
  { table: "compra_recebimentos", name: "compra_recebimentos_grupo_fk" },
  { table: "pesagens", name: "pesagens_compra_recebimento_fk" },
  { table: "animal_lote_movimentacoes", name: "animal_lote_mov_compra_recebimento_fk" },
  { table: "estoque_movimentacoes", name: "estoque_movimentacoes_operacao_fk" },
  { table: "financeiro_titulos", name: "financeiro_titulos_pessoa_fk" },
  { table: "financeiro_movimentos", name: "financeiro_movimentos_pessoa_fk" },
  { table: "financeiro_titulos", name: "financeiro_titulos_fazenda_fk" },
  { table: "financeiro_centros_custo", name: "financeiro_centros_custo_fazenda_fk" },
  { table: "financeiro_apropriacoes", name: "financeiro_apropriacoes_fazenda_fk" },
  { table: "financeiro_categorias", name: "financeiro_categorias_pai_fk" },
  { table: "financeiro_parcelas", name: "financeiro_parcelas_titulo_fk" },
  { table: "financeiro_liquidacoes", name: "financeiro_liquidacoes_conta_fk" },
  { table: "financeiro_liquidacoes", name: "financeiro_liquidacoes_original_fk" },
  { table: "financeiro_liquidacao_alocacoes", name: "financeiro_alocacoes_liquidacao_fk" },
  { table: "financeiro_liquidacao_alocacoes", name: "financeiro_alocacoes_parcela_fk" },
  { table: "financeiro_transferencias", name: "financeiro_transferencias_origem_fk" },
  { table: "financeiro_transferencias", name: "financeiro_transferencias_destino_fk" },
  { table: "financeiro_transferencias", name: "financeiro_transferencias_original_fk" },
  { table: "financeiro_movimentos", name: "financeiro_movimentos_conta_fk" },
  { table: "financeiro_movimentos", name: "financeiro_movimentos_liquidacao_fk" },
  { table: "financeiro_movimentos", name: "financeiro_movimentos_transf_fk" },
  { table: "financeiro_movimentos", name: "financeiro_movimentos_original_fk" },
  { table: "financeiro_apropriacoes", name: "financeiro_apropriacoes_titulo_fk" },
  { table: "financeiro_apropriacoes", name: "financeiro_apropriacoes_categoria_fk" },
  { table: "financeiro_apropriacoes", name: "financeiro_apropriacoes_centro_fk" },
];

const FUNCTIONAL_UNIQUES: SchemaIndexRequirement[] = [
  { table: "animal_baixas", name: "animal_baixas_animal_ativa_uq", unique: true, columns: [] },
];

function extractIndexes(table: object, tableName: string): SchemaIndexRequirement[] {
  const builder = (table as Record<symbol, unknown>)[EXTRA_CONFIG];
  if (typeof builder !== "function") return [];
  const cfg = (builder as (t: object) => unknown)(table);
  const items = Array.isArray(cfg) ? cfg : Object.values((cfg ?? {}) as object);
  const out: SchemaIndexRequirement[] = [];
  for (const item of items) {
    const config = (item as { config?: { name?: string; unique?: boolean; columns?: Array<{ name?: string }> } })
      .config;
    if (!config?.name) continue;
    if (INDEXES_NOT_REQUIRED.has(`${tableName}.${config.name}`)) continue;
    out.push({
      table: tableName,
      name: config.name,
      unique: Boolean(config.unique),
      columns: (config.columns ?? []).map((col) => String(col.name ?? "")).filter(Boolean),
    });
  }
  return out;
}

export function collectDatabaseSchemaRequirements(): DatabaseSchemaRequirements {
  const tables: string[] = [];
  const columns: SchemaColumnRequirement[] = [];
  const indexes: SchemaIndexRequirement[] = [];

  for (const value of Object.values(schema)) {
    if (!isTable(value)) continue;
    const tableName = getTableName(value);
    tables.push(tableName);
    for (const col of Object.values(getTableColumns(value))) {
      const mustAllowNull = tableName === "vendas" && col.name === "idempotency_key";
      columns.push({
        table: tableName,
        column: col.name,
        sqlType: col.getSQLType(),
        notNull: Boolean(col.notNull),
        mustAllowNull,
      });
    }
    indexes.push(...extractIndexes(value, tableName));
  }

  indexes.push(...FUNCTIONAL_UNIQUES);

  tables.sort();
  columns.sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`));
  indexes.sort((a, b) => `${a.table}.${a.name}`.localeCompare(`${b.table}.${b.name}`));

  return {
    tables,
    columns,
    indexes,
    foreignKeys: REQUIRED_FOREIGN_KEYS,
  };
}
