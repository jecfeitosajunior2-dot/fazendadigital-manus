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
  deleteRule?: "RESTRICT";
  updateRule?: "RESTRICT";
  /** Ordem real das colunas. Quando informada, a inicialização confere a sequência. */
  columns?: string[];
  referencedTable?: string;
  referencedColumns?: string[];
};

export type DatabaseSchemaRequirements = {
  tables: string[];
  columns: SchemaColumnRequirement[];
  indexes: SchemaIndexRequirement[];
  foreignKeys: SchemaForeignKeyRequirement[];
};

const EXTRA_CONFIG = Symbol.for("drizzle:ExtraConfigBuilder");

/** Colunas que a aplicação precisa nulas. Fazenda do histórico é opcional. */
const COLUMNS_MUST_ALLOW_NULL = new Set([
  "vendas.idempotency_key",
  "auditoria_eventos.fazendaId",
  "auditoria_eventos.registroTipo",
  "auditoria_eventos.registroId",
  "auditoria_eventos.dadosAnteriores",
  "auditoria_eventos.dadosPosteriores",
  "perfis_acesso.descricao",
  "usuario_permissoes.origemPerfilId",
]);

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
  { table: "usuario_fazendas", name: "usuario_fazendas_user_fk", deleteRule: "RESTRICT", updateRule: "RESTRICT" },
  { table: "usuario_fazendas", name: "usuario_fazendas_fazenda_fk", deleteRule: "RESTRICT", updateRule: "RESTRICT" },
  { table: "usuario_fazendas", name: "usuario_fazendas_concedido_fk", deleteRule: "RESTRICT", updateRule: "RESTRICT" },
  { table: "auditoria_eventos", name: "auditoria_eventos_executor_fk", deleteRule: "RESTRICT", updateRule: "RESTRICT" },
  { table: "auditoria_eventos", name: "auditoria_eventos_titular_fk", deleteRule: "RESTRICT", updateRule: "RESTRICT" },
  { table: "auditoria_eventos", name: "auditoria_eventos_fazenda_fk", deleteRule: "RESTRICT", updateRule: "RESTRICT" },
  {
    table: "perfis_acesso",
    name: "perfis_acesso_titular_fk",
    deleteRule: "RESTRICT",
    updateRule: "RESTRICT",
    columns: ["titularUserId"],
    referencedTable: "users",
    referencedColumns: ["id"],
  },
  {
    table: "perfis_acesso",
    name: "perfis_acesso_criado_por_fk",
    deleteRule: "RESTRICT",
    updateRule: "RESTRICT",
    columns: ["criadoPorUserId"],
    referencedTable: "users",
    referencedColumns: ["id"],
  },
  {
    table: "perfil_permissoes",
    name: "perfil_permissoes_perfil_fk",
    deleteRule: "RESTRICT",
    updateRule: "RESTRICT",
    columns: ["perfilId"],
    referencedTable: "perfis_acesso",
    referencedColumns: ["id"],
  },
  {
    table: "usuario_permissoes",
    name: "usuario_permissoes_user_fk",
    deleteRule: "RESTRICT",
    updateRule: "RESTRICT",
    columns: ["userId"],
    referencedTable: "users",
    referencedColumns: ["id"],
  },
  {
    table: "usuario_permissoes",
    name: "usuario_permissoes_usuario_titular_fk",
    deleteRule: "RESTRICT",
    updateRule: "RESTRICT",
    columns: ["userId", "titularUserId"],
    referencedTable: "users",
    referencedColumns: ["id", "titularUserId"],
  },
  {
    table: "usuario_permissoes",
    name: "usuario_permissoes_concedido_fk",
    deleteRule: "RESTRICT",
    updateRule: "RESTRICT",
    columns: ["concedidoPorUserId"],
    referencedTable: "users",
    referencedColumns: ["id"],
  },
  {
    table: "usuario_permissoes",
    name: "usuario_permissoes_titular_fk",
    deleteRule: "RESTRICT",
    updateRule: "RESTRICT",
    columns: ["titularUserId"],
    referencedTable: "users",
    referencedColumns: ["id"],
  },
  {
    table: "usuario_permissoes",
    name: "usuario_permissoes_origem_fk",
    deleteRule: "RESTRICT",
    updateRule: "RESTRICT",
    columns: ["origemPerfilId", "titularUserId"],
    referencedTable: "perfis_acesso",
    referencedColumns: ["id", "titularUserId"],
  },
];

const PRIMARY_KEYS: SchemaIndexRequirement[] = [
  { table: "perfis_acesso", name: "PRIMARY", unique: true, columns: ["id"] },
  { table: "perfil_permissoes", name: "PRIMARY", unique: true, columns: ["id"] },
  { table: "usuario_permissoes", name: "PRIMARY", unique: true, columns: ["id"] },
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
      const mustAllowNull = COLUMNS_MUST_ALLOW_NULL.has(`${tableName}.${col.name}`);
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

  indexes.push(...FUNCTIONAL_UNIQUES, ...PRIMARY_KEYS);

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
