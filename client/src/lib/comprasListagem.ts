/** Apresentação da listagem de Compras — filtros no padrão de Vendas, domínio próprio. */

import { formatDateBR } from "./date-utils";
import { FILTRO_TODOS, modoTotaisRodapeVendas, type ModoTotaisRodapeVendas } from "./vendasListagem";
import {
  normalizeOperacaoData,
  parseQuantidadeOperacao,
  parseValorOperacao,
  type CommercialMetric,
} from "./compraVendaResumo";
import { contarIdentificacao, labelStatusComercialCompra } from "@shared/compraIdentificacao";
import { calcularCustoMedioKg } from "@shared/compraComercial";
import { COMPRA_VENDA_COMPRAS_PATH } from "./compraVendaCompradores";

export { FILTRO_TODOS };

/** Recorte operacional — não é o status comercial Pendente. */
export const FILTRO_IDENTIFICACAO_PENDENTE = "pendente";

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
  custoTotal?: string | number | null;
  /** Peso comercial/adquirido persistido na Compra — não é pesagem do Recebimento. */
  pesoTotal?: string | number | null;
  status?: string | null;
  observacoes?: string | null;
  podeCancelar?: boolean;
  /** Animais já vinculados à Compra — vem do `compras.list`, não é quantidade comercial. */
  identificados?: number | null;
};

export type FiltrosComprasListagem = {
  busca?: string;
  periodoDe?: string;
  periodoAte?: string;
  fornecedorId?: number | string | null;
  status?: string;
  fazendaId?: number | null;
  identificacao?: string;
};

export type FiltrosComprasTela = {
  periodoDe: string;
  periodoAte: string;
  fornecedorId: string;
  status: string;
  identificacao: string;
};

export function filtrosSecundariosComprasVazios(): FiltrosComprasTela {
  return { periodoDe: "", periodoAte: "", fornecedorId: "", status: "", identificacao: "" };
}

export function compraTemIdentificacaoPendente(compra: CompraListagemRow): boolean {
  if (compra.status !== "concluido") return false;
  const comprados = parseQuantidadeOperacao(compra) ?? 0;
  const identificados = Math.max(0, Math.floor(Number(compra.identificados)) || 0);
  return contarIdentificacao({ comprados, identificados }).pendentes > 0;
}

export function opcoesIdentificacaoCompra(): Array<{ value: string; label: string }> {
  return [
    { value: FILTRO_TODOS, label: "Todas" },
    { value: FILTRO_IDENTIFICACAO_PENDENTE, label: "Identificação pendente" },
  ];
}

export function filtrosComprasDaQuery(search: string): FiltrosComprasTela | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const identificacao = params.get("identificacao") === FILTRO_IDENTIFICACAO_PENDENTE
    ? FILTRO_IDENTIFICACAO_PENDENTE
    : "";
  const periodoDe = params.get("de")?.trim() ?? "";
  const periodoAte = params.get("ate")?.trim() ?? "";
  if (!identificacao && !periodoDe && !periodoAte) return null;
  return {
    ...filtrosSecundariosComprasVazios(),
    periodoDe,
    periodoAte,
    identificacao,
  };
}

export function compraVendaComprasListagemPath(opts?: {
  identificacao?: string;
  de?: string;
  ate?: string;
}): string {
  const params = new URLSearchParams();
  if (opts?.identificacao === FILTRO_IDENTIFICACAO_PENDENTE) {
    params.set("identificacao", FILTRO_IDENTIFICACAO_PENDENTE);
  }
  if (opts?.de?.trim()) params.set("de", opts.de.trim());
  if (opts?.ate?.trim()) params.set("ate", opts.ate.trim());
  const qs = params.toString();
  return qs ? `${COMPRA_VENDA_COMPRAS_PATH}?${qs}` : COMPRA_VENDA_COMPRAS_PATH;
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
    if (filtros.identificacao === FILTRO_IDENTIFICACAO_PENDENTE && !compraTemIdentificacaoPendente(compra)) {
      return false;
    }
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

/** Mesma ordenação da coluna Data de Vendas: data civil, desempate por id. */
export function ordenarComprasListagemPorData(
  compras: ReadonlyArray<CompraListagemRow>,
  sortAsc: boolean,
): CompraListagemRow[] {
  const list = [...compras];
  list.sort((a, b) => {
    const da = normalizeOperacaoData(a.data) ?? "";
    const db = normalizeOperacaoData(b.data) ?? "";
    let cmp = da.localeCompare(db);
    if (cmp === 0) cmp = b.id - a.id;
    return sortAsc ? cmp : -cmp;
  });
  return list;
}

export type ModoTotaisRodapeCompras = ModoTotaisRodapeVendas;

/** Mesmo recorte do rodapé de Vendas: efetivo / canceladas / pendentes. */
export function modoTotaisRodapeCompras(statusFiltro?: string | null): ModoTotaisRodapeCompras {
  return modoTotaisRodapeVendas(statusFiltro);
}

/**
 * Recorte do rodapé: efetivo só `concluido`.
 * Cancelada/Pendente só entram quando o filtro de status pede explicitamente esse recorte.
 */
export function comprasParaTotaisRodape(
  compras: ReadonlyArray<CompraListagemRow>,
  statusFiltro?: string | null,
): CompraListagemRow[] {
  const modo = modoTotaisRodapeCompras(statusFiltro);
  if (modo === "canceladas") return compras.filter(compra => compra.status === "cancelado");
  if (modo === "pendentes") return compras.filter(compra => compra.status === "pendente");
  return compras.filter(compra => compra.status === "concluido");
}

/** Só o peso comercial persistido na Compra. Ignora qualquer campo de pesagem zootécnica. */
export function pesoComercialCompraListagem(compra: CompraListagemRow): number | null {
  if (compra.pesoTotal == null || compra.pesoTotal === "") return null;
  const n = Number(compra.pesoTotal);
  return Number.isFinite(n) ? n : null;
}

/** Total comercial da Compra: custoTotal (animais + frete + outros) ou valorTotal persistido. */
export function valorComercialCompraListagem(compra: CompraListagemRow): number | null {
  const bruto =
    compra.custoTotal != null && String(compra.custoTotal).trim() !== ""
      ? compra.custoTotal
      : compra.valorTotal;
  return parseValorOperacao(bruto);
}

export function resumirComprasListagem(compras: ReadonlyArray<CompraListagemRow>): {
  compras: CommercialMetric;
  animais: CommercialMetric;
  peso: CommercialMetric;
  valor: CommercialMetric;
} {
  if (compras.length === 0) {
    return {
      compras: { kind: "known", value: 0 },
      animais: { kind: "known", value: 0 },
      peso: { kind: "known", value: 0 },
      valor: { kind: "known", value: 0 },
    };
  }

  const pesos = compras.map(pesoComercialCompraListagem).filter((n): n is number => n != null);
  const animais = compras.map(compra => parseQuantidadeOperacao(compra));
  const valores = compras.map(valorComercialCompraListagem);

  return {
    compras: { kind: "known", value: compras.length },
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

export function formatarQuantidadeRodapeCompras(metrica: CommercialMetric): string {
  return metrica.kind === "known" ? metrica.value.toLocaleString("pt-BR") : "—";
}

export function formatarPesoRodapeCompras(metrica: CommercialMetric): string {
  return metrica.kind === "known" ? `${metrica.value.toLocaleString("pt-BR")} kg` : "—";
}

export function formatarValorRodapeCompras(metrica: CommercialMetric): string {
  return metrica.kind === "known"
    ? metrica.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";
}

/** Apresentação civil dd/mm/aaaa — não altera o valor persistido. */
export function formatarDataCompraListagem(data: unknown): string {
  return formatDateBR(data);
}

export const COMPRAS_LISTAGEM_CABECALHOS = [
  "Data",
  "Fornecedor",
  "Animais",
  "Peso",
  "R$/kg médio",
  "Valor Total",
  "Status",
  "Ações",
] as const;

/**
 * Custo efetivo médio por kg: custoTotal (animais + frete + outros) / peso comercial.
 * Não usa preço negociado (`precoUnitario`). Sem peso válido, não divide.
 */
export function custoMedioKgCompraListagem(compra: CompraListagemRow): number | null {
  const custo = valorComercialCompraListagem(compra);
  const peso = pesoComercialCompraListagem(compra);
  if (custo == null) return null;
  return calcularCustoMedioKg(custo, peso);
}

export function formatarAnimaisCelulaCompras(compra: CompraListagemRow): string {
  const qtd = parseQuantidadeOperacao(compra);
  return qtd == null ? "—" : qtd.toLocaleString("pt-BR");
}

export function formatarPesoCelulaCompras(compra: CompraListagemRow): string {
  const peso = pesoComercialCompraListagem(compra);
  if (peso == null || peso <= 0) return "—";
  return `${peso.toLocaleString("pt-BR")} kg`;
}

export function formatarMoedaCelulaCompras(valor: number | null): string {
  if (valor == null) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Nome-base do arquivo no padrão de Vendas: compras-nome-da-fazenda */
export function nomeArquivoExportComprasListagem(fazendaNome?: string | null): string {
  const slug = String(fazendaNome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `compras-${slug}` : "compras";
}

export function linhaCelulasComprasListagem(compra: CompraListagemRow): string[] {
  return [
    formatarDataCompraListagem(compra.data),
    String(compra.fornecedor ?? "").trim() || "—",
    formatarAnimaisCelulaCompras(compra),
    formatarPesoCelulaCompras(compra),
    formatarMoedaCelulaCompras(custoMedioKgCompraListagem(compra)),
    formatarMoedaCelulaCompras(valorComercialCompraListagem(compra)),
    labelStatusComercialCompra(compra.status),
  ];
}

/** Mesma sequência da tabela de Compras — sem a coluna Ações. */
export const COMPRAS_LISTAGEM_EXPORT_HEADERS = [
  "Data",
  "Fornecedor",
  "Animais",
  "Peso",
  "R$/kg médio",
  "Valor Total",
  "Status",
] as const;

function metricaOuTraco(
  metrica: { kind: "known"; value: number } | { kind: "unknown" },
  formatar: (valor: number) => string,
): string {
  return metrica.kind === "known" ? formatar(metrica.value) : "—";
}

/** Mesmo recorte do rodapé da listagem: efetivo só concluída; Cancelada soma o histórico. */
export function linhaTotaisExportComprasListagem(
  compras: ReadonlyArray<CompraListagemRow>,
  statusFiltro?: string | null,
): string[] {
  const modo = modoTotaisRodapeCompras(statusFiltro);
  const resumo = resumirComprasListagem(comprasParaTotaisRodape(compras, statusFiltro));
  const excluidas = compras.filter(compra => compra.status === "cancelado").length;
  const rotulo =
    modo === "canceladas" ? "Totais (canceladas)" : modo === "pendentes" ? "Totais (pendentes)" : "Totais";
  return [
    rotulo,
    "",
    metricaOuTraco(resumo.animais, valor => valor.toLocaleString("pt-BR")),
    metricaOuTraco(resumo.peso, valor => `${valor.toLocaleString("pt-BR")} kg`),
    "",
    metricaOuTraco(resumo.valor, formatarMoedaCelulaCompras),
    modo === "efetivo" && excluidas > 0 ? "Canceladas não incluídas nos totais" : "",
  ];
}

export function linhasExportComprasListagem(
  compras: ReadonlyArray<CompraListagemRow>,
  statusFiltro?: string | null,
): string[][] {
  const detalhe = compras.map(linhaCelulasComprasListagem);
  if (detalhe.length === 0) return detalhe;
  return [...detalhe, linhaTotaisExportComprasListagem(compras, statusFiltro)];
}
