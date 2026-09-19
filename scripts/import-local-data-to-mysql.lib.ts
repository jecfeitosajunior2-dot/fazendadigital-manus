/**
 * Funções puras da migração real local → MySQL.
 * Sem conexão com banco. Sem escrita.
 */
import { DEV_DATA_EXCLUIDOS, DEV_DATA_WHITELIST } from "./import-local-data-to-mysql.dry-run";

export const EXPECTED_USER_ID = 1;
export const EXPECTED_DATABASE = "fazenda_digital";

export const OFFICIAL_ADMIN = {
  source: ".env.example + scripts/seed.ts (ADMIN_*)",
  id: 1,
  email: "admin@fazendadigital.local",
  name: "Administrador",
  password: "admin123",
  openId: "local:admin@fazendadigital.local",
  loginMethod: "local",
  role: "admin",
} as const;

export const TARGET_TABLES = [
  "users",
  "fazendas",
  "pastos",
  "lotes",
  "animais",
  "produtos_catalogo",
  "estoque",
  "estoque_movimentacoes",
  "pesagens",
  "historico_brincos",
  "animal_baixas",
  "saude_registros",
  "reproducao_registros",
  "parto_crias",
  "animal_lote_movimentacoes",
  "lote_pasto_movimentacoes",
  "maquinas",
  "abastecimentos",
  "manutencoes",
  "manutencao_pecas",
  "benfeitorias",
  "semen_reprodutores_externos",
  "semen_partidas",
  "semen_movimentacoes",
  "pessoas",
  "contas_financeiras",
  "movimentacoes",
] as const;

export const MUST_STAY_EMPTY = ["vendas", "venda_itens", "compras", "batidas"] as const;

/** Todas as 31 tabelas do schema oficial — destino precisa estar vazio nelas. */
export const ALL_SCHEMA_TABLES = [
  ...TARGET_TABLES,
  "batidas",
  "compras",
  "vendas",
  "venda_itens",
] as const;

export const INSERT_ORDER = [
  "users",
  "fazendas",
  "pastos",
  "lotes",
  "animais",
  "produtos_catalogo",
  "estoque",
  "estoque_movimentacoes",
  "pesagens",
  "historico_brincos",
  "animal_baixas",
  "saude_registros",
  "reproducao_registros",
  "parto_crias",
  "animal_lote_movimentacoes",
  "lote_pasto_movimentacoes",
  "maquinas",
  "abastecimentos",
  "manutencoes",
  "manutencao_pecas",
  "benfeitorias",
  "semen_reprodutores_externos",
  "semen_partidas",
  "semen_movimentacoes",
  "pessoas",
  "contas_financeiras",
  "movimentacoes",
] as const;

export const DEV_IMPORT_KEYS = Object.keys(DEV_DATA_WHITELIST);
export const DEV_SKIP_KEYS = Object.keys(DEV_DATA_EXCLUIDOS);

export const DEMO_SIGNATURES = {
  fazendaNome: "Minha Fazenda",
  loteNomesProibidos: ["Reprodutores", "Vazias", "Prenhas"],
  lotesReais: [
    { id: 2, nome: "Bezerros" },
    { id: 3, nome: "Vacas" },
    { id: 4, nome: "Novilhos" },
    { id: 5, nome: "Bezerra" },
    { id: 6, nome: "Bezerro" },
    { id: 7, nome: "B01" },
  ],
  fazendasReais: [
    { id: 1, nome: "Fazenda J" },
    { id: 2, nome: "Fazenda B" },
  ],
  animaisReaisVsDemo: [
    { id: 1, realBrinco: "12", demoBrinco: "02" },
    { id: 2, realBrinco: "7845", demoBrinco: "03" },
  ],
} as const;

export const ESTOQUE_REFERENCIADO_IDS = [23, 24, 25, 26, 29, 30, 33] as const;
export const LOTE1_REFS_ESPERADAS = 37;

export type OfficialAdmin = {
  id: number;
  email: string;
  name: string;
  password: string;
  openId: string;
  loginMethod: string;
  role: "admin";
  source: string;
};

export function resolveOfficialAdmin(env: NodeJS.ProcessEnv): OfficialAdmin {
  const email = (env.ADMIN_EMAIL || OFFICIAL_ADMIN.email).trim().toLowerCase();
  const name = (env.ADMIN_NAME || OFFICIAL_ADMIN.name).trim();
  const password = env.ADMIN_PASSWORD || OFFICIAL_ADMIN.password;
  if (!email || !name || !password) {
    throw new Error("ADMIN_EMAIL/ADMIN_NAME/ADMIN_PASSWORD ausentes e sem fallback oficial.");
  }
  const usedEnv = Boolean(env.ADMIN_EMAIL || env.ADMIN_NAME || env.ADMIN_PASSWORD);
  return {
    id: 1,
    email,
    name,
    password,
    openId: `local:${email}`,
    loginMethod: "local",
    role: "admin",
    source: usedEnv ? "variáveis ADMIN_* do ambiente" : OFFICIAL_ADMIN.source,
  };
}

/** Pessoas/dev-data: userId 0 do fallback local vira o único usuário real. */
export function remapDevUserId(value: unknown): number {
  if (value == null || value === "") return EXPECTED_USER_ID;
  const n = Number(value);
  if (n === 0 || n === EXPECTED_USER_ID) return EXPECTED_USER_ID;
  throw new Error(`userId de .dev-data não mapeável: ${String(value)}`);
}

export function assertDestinationEmpty(counts: Record<string, number>): void {
  const dirty = Object.entries(counts).filter(([, n]) => n > 0);
  if (dirty.length) {
    throw new Error(
      `Destino não está vazio: ${dirty.map(([t, n]) => `${t}=${n}`).join(", ")}. Abortado sem apagar.`,
    );
  }
}

export function expectedLoteIds(): number[] {
  return [2, 3, 4, 5, 6, 7];
}

export function isDevDemoCollection(key: string): boolean {
  return key === "fazendas" || key === "animais" || key === "lotes";
}

export function shouldImportDevCollection(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(DEV_DATA_WHITELIST, key) && !isDevDemoCollection(key);
}

export function rejectLoteId1(id: number | null): void {
  if (id === 1) throw new Error("Tentativa de inserir lote id 1. Abortado.");
}

export function buildManutencaoPecaRow(peca: Record<string, unknown>): Record<string, unknown> {
  return {
    manutencaoId: toInt(peca.manutencaoId),
    estoqueId: toInt(peca.estoqueId),
    nome: peca.nome,
    quantidade: toDecimal(peca.quantidade) ?? "1",
    valorUnitario: toDecimal(peca.valorUnitario) ?? "0",
    valorTotal: toDecimal(peca.valorTotal) ?? "0",
  };
}

export function assertNoDemoImported(input: {
  fazendaNomes: string[];
  lotes: Array<{ id: number; nome: string }>;
  animais: Array<{ id: number; brinco: string | null }>;
}): void {
  if (input.fazendaNomes.includes(DEMO_SIGNATURES.fazendaNome)) {
    throw new Error("Fazenda demo 'Minha Fazenda' presente. Abortado.");
  }
  for (const nome of DEMO_SIGNATURES.loteNomesProibidos) {
    if (input.lotes.some(lote => lote.nome === nome)) {
      throw new Error(`Lote demo '${nome}' presente. Abortado.`);
    }
  }
  for (const esperado of DEMO_SIGNATURES.lotesReais) {
    const lote = input.lotes.find(item => item.id === esperado.id);
    if (!lote || lote.nome !== esperado.nome) {
      throw new Error(`Lote real id ${esperado.id} deveria ser '${esperado.nome}', obtido '${lote?.nome ?? "ausente"}'.`);
    }
  }
  for (const spec of DEMO_SIGNATURES.animaisReaisVsDemo) {
    const animal = input.animais.find(item => item.id === spec.id);
    const brinco = String(animal?.brinco ?? "");
    if (brinco === spec.demoBrinco) {
      throw new Error(`Animal id ${spec.id} ficou com brinco demo ${spec.demoBrinco}. Abortado.`);
    }
    if (brinco !== spec.realBrinco) {
      throw new Error(`Animal id ${spec.id} brinco '${brinco}' != real '${spec.realBrinco}'.`);
    }
  }
}

export function toBool(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (value === true || value === 1 || value === "1") return 1;
  if (value === false || value === 0 || value === "0") return 0;
  return value ? 1 : 0;
}

export function toInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

export function toDecimal(value: unknown): string | null {
  if (value == null || value === "") return null;
  const raw = typeof value === "number" ? String(value) : String(value).trim().replace(",", ".");
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return raw;
}

export function toDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : null;
}

export function toTimestamp(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function sqlValue(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

export function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined) {
      return row[key];
    }
  }
  return null;
}

export function sameNumber(a: unknown, b: number): boolean {
  const n = typeof a === "number" ? a : Number(a);
  return Number.isFinite(n) && n === b;
}
