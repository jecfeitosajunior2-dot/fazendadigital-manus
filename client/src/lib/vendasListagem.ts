/** Apresentação da listagem de Vendas — só lê campos já persistidos. */

import { arredondarMoeda } from "@shared/vendaComercial";
import {
  normalizeOperacaoData,
  parseQuantidadeOperacao,
  parseValorOperacao,
  type CommercialMetric,
  type OperacaoComercial,
} from "./compraVendaResumo";

/** Enum real de `vendas.status` no schema MySQL. */
export const VENDA_STATUS = ["pendente", "concluido", "cancelado"] as const;
export type VendaStatus = (typeof VENDA_STATUS)[number];

export const VENDA_STATUS_LABEL: Record<VendaStatus, string> = {
  pendente: "Pendente",
  concluido: "Concluída",
  cancelado: "Cancelada",
};

export const FILTRO_TODOS = "__all__";

export type VendaListagemRow = OperacaoComercial & {
  id: number;
  compradorId?: number | null;
  fazendaId?: number | null;
  fazendaNome?: string | null;
  status?: string | null;
  formaPrecificacao?: string | null;
};

export type FiltrosVendasListagem = {
  busca?: string;
  periodoDe?: string;
  periodoAte?: string;
  comprador?: string;
  status?: string;
  fazendaId?: number | null;
};

export function isVendaStatus(value: unknown): value is VendaStatus {
  return value === "pendente" || value === "concluido" || value === "cancelado";
}

export function labelStatusVenda(status: unknown): string {
  return isVendaStatus(status) ? VENDA_STATUS_LABEL[status] : "—";
}

export function opcoesStatusVenda(): Array<{ value: string; label: string }> {
  return [
    { value: FILTRO_TODOS, label: "Todos" },
    ...VENDA_STATUS.map(status => ({ value: status, label: VENDA_STATUS_LABEL[status] })),
  ];
}

export function opcoesCompradorVenda(vendas: ReadonlyArray<VendaListagemRow>): Array<{ value: string; label: string }> {
  const nomes = [
    ...new Set(
      vendas
        .map(venda => String(venda.comprador ?? "").trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [{ value: FILTRO_TODOS, label: "Todos" }, ...nomes.map(nome => ({ value: nome, label: nome }))];
}

function noPeriodo(data: unknown, de?: string, ate?: string): boolean {
  if (!de && !ate) return true;
  const iso = normalizeOperacaoData(data);
  if (!iso) return false;
  if (de && iso < de) return false;
  if (ate && iso > ate) return false;
  return true;
}

export function filtrarVendasListagem(
  vendas: ReadonlyArray<VendaListagemRow>,
  filtros: FiltrosVendasListagem,
): VendaListagemRow[] {
  const busca = filtros.busca?.trim().toLowerCase() ?? "";
  const comprador = filtros.comprador && filtros.comprador !== FILTRO_TODOS ? filtros.comprador : "";
  const status = filtros.status && filtros.status !== FILTRO_TODOS ? filtros.status : "";

  return vendas.filter(venda => {
    if (filtros.fazendaId != null && Number(venda.fazendaId) !== Number(filtros.fazendaId)) return false;
    if (!noPeriodo(venda.data, filtros.periodoDe?.trim(), filtros.periodoAte?.trim())) return false;
    if (comprador && String(venda.comprador ?? "").trim() !== comprador) return false;
    if (status && venda.status !== status) return false;
    if (!busca) return true;
    return [venda.comprador, venda.data].some(campo =>
      String(campo ?? "").toLowerCase().includes(busca),
    );
  });
}

/** Rodapé da listagem: tira cancelada, salvo quando o recorte é só canceladas. */
export function vendasParaTotaisRodape(
  vendas: ReadonlyArray<VendaListagemRow>,
): VendaListagemRow[] {
  if (vendas.length === 0) return [];
  const soCanceladas = vendas.every(venda => venda.status === "cancelado");
  if (soCanceladas) return [...vendas];
  return vendas.filter(venda => venda.status !== "cancelado");
}

export function resumirVendasListagem(vendas: ReadonlyArray<VendaListagemRow>): {
  vendas: CommercialMetric;
  animais: CommercialMetric;
  peso: CommercialMetric;
  valor: CommercialMetric;
} {
  const pesos = vendas
    .map(venda => {
      if (venda.pesoTotal == null || venda.pesoTotal === "") return null;
      const n = Number(venda.pesoTotal);
      return Number.isFinite(n) ? n : null;
    })
    .filter((n): n is number => n != null);
  const animais = vendas.map(venda => parseQuantidadeOperacao(venda));
  const valores = vendas.map(venda => parseValorOperacao(venda.valorTotalNumero ?? venda.valorTotal));

  return {
    vendas: { kind: "known", value: vendas.length },
    animais: animais.every((n): n is number => n != null)
      ? { kind: "known", value: animais.reduce((acc, n) => acc + n, 0) }
      : { kind: "unknown" },
    peso: pesos.length
      ? { kind: "known", value: Math.round(pesos.reduce((acc, n) => acc + n, 0) * 100) / 100 }
      : { kind: "unknown" },
    valor: valores.every((n): n is number => n != null)
      ? { kind: "known", value: valores.reduce((acc, n) => acc + n, 0) }
      : { kind: "unknown" },
  };
}

/**
 * R$/kg médio só para venda persistida em R$/kg vivo.
 * R$/cabeça e R$/@ não usam esta coluna — a UI deve mostrar "—".
 */
export function precoMedioKgVendaListagem(venda: VendaListagemRow): number | null {
  if (venda.formaPrecificacao !== "kg") return null;
  const peso = Number(venda.pesoTotal);
  const valor = parseValorOperacao(venda.valorTotalNumero ?? venda.valorTotal);
  if (!Number.isFinite(peso) || peso <= 0 || valor == null) return null;
  return arredondarMoeda(valor / peso);
}
