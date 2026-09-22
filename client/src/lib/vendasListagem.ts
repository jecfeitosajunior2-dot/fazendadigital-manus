/** Apresentação da listagem de Vendas — só lê campos já persistidos. */

import { formatDateBR } from "@/lib/date-utils";
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

/** Valor persistido enviado ao `vendas.list`. `Todos` não envia status. */
export function statusQueryVendasListagem(status?: string | null): VendaStatus | undefined {
  if (!status || status === FILTRO_TODOS) return undefined;
  return isVendaStatus(status) ? status : undefined;
}

export function labelStatusVenda(status: unknown): string {
  return isVendaStatus(status) ? VENDA_STATUS_LABEL[status] : "—";
}

/** Filtro da listagem: só os status do fluxo atual. `pendente` fica no banco. */
export function opcoesStatusVenda(): Array<{ value: string; label: string }> {
  return [
    { value: FILTRO_TODOS, label: "Todos" },
    { value: "concluido", label: VENDA_STATUS_LABEL.concluido },
    { value: "cancelado", label: VENDA_STATUS_LABEL.cancelado },
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

export type ModoTotaisRodapeVendas = "efetivo" | "canceladas" | "pendentes";

export function modoTotaisRodapeVendas(statusFiltro?: string | null): ModoTotaisRodapeVendas {
  if (statusFiltro === "cancelado") return "canceladas";
  if (statusFiltro === "pendente") return "pendentes";
  return "efetivo";
}

/**
 * Recorte do rodapé: efetivo só `concluido`.
 * Cancelada/Pendente só entram quando o filtro de status pede explicitamente esse recorte.
 */
export function vendasParaTotaisRodape(
  vendas: ReadonlyArray<VendaListagemRow>,
  statusFiltro?: string | null,
): VendaListagemRow[] {
  const modo = modoTotaisRodapeVendas(statusFiltro);
  if (modo === "canceladas") return vendas.filter(venda => venda.status === "cancelado");
  if (modo === "pendentes") return vendas.filter(venda => venda.status === "pendente");
  return vendas.filter(venda => venda.status === "concluido");
}

export function resumirVendasListagem(vendas: ReadonlyArray<VendaListagemRow>): {
  vendas: CommercialMetric;
  animais: CommercialMetric;
  peso: CommercialMetric;
  valor: CommercialMetric;
} {
  if (vendas.length === 0) {
    return {
      vendas: { kind: "known", value: 0 },
      animais: { kind: "known", value: 0 },
      peso: { kind: "known", value: 0 },
      valor: { kind: "known", value: 0 },
    };
  }

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

/** Mesma sequência da tabela de Vendas — sem a coluna Ações. */
export const VENDAS_LISTAGEM_EXPORT_HEADERS = [
  "Data",
  "Comprador",
  "Animais",
  "Peso",
  "R$/kg médio",
  "Valor Total",
  "Status",
] as const;

export const VENDAS_LISTAGEM_PDF_HEADERS = VENDAS_LISTAGEM_EXPORT_HEADERS;

function moedaListagem(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function linhaPdfVendasListagem(venda: VendaListagemRow): string[] {
  const precoMedio = precoMedioKgVendaListagem(venda);
  const pesoNumero = venda.pesoTotal == null || venda.pesoTotal === "" ? NaN : Number(venda.pesoTotal);
  const valor = parseValorOperacao(venda.valorTotalNumero ?? venda.valorTotal);
  return [
    formatDateBR(venda.data),
    String(venda.comprador ?? "").trim() || "—",
    String(venda.quantidade ?? venda.quantidadeAnimais ?? ""),
    Number.isFinite(pesoNumero) ? `${pesoNumero.toLocaleString("pt-BR")} kg` : "—",
    precoMedio != null ? moedaListagem(precoMedio) : "—",
    valor != null ? moedaListagem(valor) : "—",
    labelStatusVenda(venda.status),
  ];
}

function metricaOuTraco(
  metrica: { kind: "known"; value: number } | { kind: "unknown" },
  formatar: (valor: number) => string,
): string {
  return metrica.kind === "known" ? formatar(metrica.value) : "—";
}

/** Mesmo recorte do rodapé da listagem: efetivo só concluída; Cancelada soma o histórico. */
export function linhaTotaisExportVendasListagem(
  vendas: ReadonlyArray<VendaListagemRow>,
  statusFiltro?: string | null,
): string[] {
  const modo = modoTotaisRodapeVendas(statusFiltro);
  const resumo = resumirVendasListagem(vendasParaTotaisRodape(vendas, statusFiltro));
  const excluidas = vendas.filter(venda => venda.status === "cancelado").length;
  const rotulo =
    modo === "canceladas" ? "Totais (canceladas)" : modo === "pendentes" ? "Totais (pendentes)" : "Totais";
  return [
    rotulo,
    "",
    metricaOuTraco(resumo.animais, valor => valor.toLocaleString("pt-BR")),
    metricaOuTraco(resumo.peso, valor => `${valor.toLocaleString("pt-BR")} kg`),
    "",
    metricaOuTraco(resumo.valor, moedaListagem),
    modo === "efetivo" && excluidas > 0 ? "Canceladas não incluídas nos totais" : "",
  ];
}

export function linhasExportVendasListagem(
  vendas: ReadonlyArray<VendaListagemRow>,
  statusFiltro?: string | null,
): string[][] {
  const detalhe = vendas.map(linhaPdfVendasListagem);
  if (detalhe.length === 0) return detalhe;
  return [...detalhe, linhaTotaisExportVendasListagem(vendas, statusFiltro)];
}
