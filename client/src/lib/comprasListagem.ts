/** Apresentação da listagem de Compras — filtros no padrão de Vendas, domínio próprio. */

import { FILTRO_TODOS } from "./vendasListagem";
import { normalizeOperacaoData } from "./compraVendaResumo";
import { labelStatusComercialCompra } from "@shared/compraIdentificacao";

export { FILTRO_TODOS };

/** Enum real de `compras.status` no schema MySQL. */
export const COMPRA_STATUS = ["pendente", "concluido", "cancelado"] as const;
export type CompraStatus = (typeof COMPRA_STATUS)[number];

export type CompraListagemRow = {
  id: number;
  data: string;
  fornecedor?: string | null;
  fornecedorId?: number | null;
  fazendaId?: number | null;
  quantidadeAnimais?: number | null;
  valorTotal?: string | number | null;
  status?: string | null;
  observacoes?: string | null;
  podeCancelar?: boolean;
};

export type FiltrosComprasListagem = {
  busca?: string;
  periodoDe?: string;
  periodoAte?: string;
  fornecedorId?: number | string | null;
  status?: string;
  fazendaId?: number | null;
};

export type FiltrosComprasTela = {
  periodoDe: string;
  periodoAte: string;
  fornecedorId: string;
  status: string;
};

export function filtrosSecundariosComprasVazios(): FiltrosComprasTela {
  return { periodoDe: "", periodoAte: "", fornecedorId: "", status: "" };
}

export function isCompraStatus(value: unknown): value is CompraStatus {
  return value === "pendente" || value === "concluido" || value === "cancelado";
}

/** Valor persistido enviado ao `compras.list`. `Todos` não envia status. */
export function statusQueryComprasListagem(status?: string | null): CompraStatus | undefined {
  if (!status || status === FILTRO_TODOS) return undefined;
  return isCompraStatus(status) ? status : undefined;
}

/** Filtro da listagem: só os status do fluxo atual. `pendente` fica no banco. */
export function opcoesStatusCompra(): Array<{ value: string; label: string }> {
  return [
    { value: FILTRO_TODOS, label: "Todos" },
    { value: "concluido", label: labelStatusComercialCompra("concluido") },
    { value: "cancelado", label: labelStatusComercialCompra("cancelado") },
  ];
}

export function opcoesFornecedorCompra(
  pessoas: ReadonlyArray<{ id: number; nome?: string | null }>,
): Array<{ value: string; label: string }> {
  const opcoes = pessoas
    .map(pessoa => ({
      value: String(pessoa.id),
      label: String(pessoa.nome ?? "").trim() || `Fornecedor #${pessoa.id}`,
    }))
    .filter(opcao => opcao.value !== FILTRO_TODOS)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  return [{ value: FILTRO_TODOS, label: "Todos" }, ...opcoes];
}

export function intervaloDatasListagemInvalido(de?: string, ate?: string): boolean {
  const inicio = de?.trim() ?? "";
  const fim = ate?.trim() ?? "";
  return Boolean(inicio && fim && inicio > fim);
}

function noPeriodo(data: unknown, de?: string, ate?: string): boolean {
  if (!de && !ate) return true;
  const iso = normalizeOperacaoData(data);
  if (!iso) return false;
  if (de && iso < de) return false;
  if (ate && iso > ate) return false;
  return true;
}

function fornecedorIdFiltro(value?: number | string | null): number | null {
  if (value == null || value === "" || value === FILTRO_TODOS) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function filtrarComprasListagem(
  compras: ReadonlyArray<CompraListagemRow>,
  filtros: FiltrosComprasListagem,
): CompraListagemRow[] {
  const busca = filtros.busca?.trim().toLowerCase() ?? "";
  const fornecedorId = fornecedorIdFiltro(filtros.fornecedorId);
  const status = filtros.status && filtros.status !== FILTRO_TODOS ? filtros.status : "";

  return compras.filter(compra => {
    if (filtros.fazendaId != null && Number(compra.fazendaId) !== Number(filtros.fazendaId)) return false;
    if (!noPeriodo(compra.data, filtros.periodoDe?.trim(), filtros.periodoAte?.trim())) return false;
    if (fornecedorId != null && Number(compra.fornecedorId) !== fornecedorId) return false;
    if (status && compra.status !== status) return false;
    if (!busca) return true;
    return [compra.fornecedor, compra.data].some(campo =>
      String(campo ?? "").toLowerCase().includes(busca),
    );
  });
}

export function paginarComprasListagem<T>(rows: ReadonlyArray<T>, page: number, pageSize: number): T[] {
  const pagina = Math.max(1, page);
  const tamanho = Math.max(1, pageSize);
  const inicio = (pagina - 1) * tamanho;
  return rows.slice(inicio, inicio + tamanho);
}
