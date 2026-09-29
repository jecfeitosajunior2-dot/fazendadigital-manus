/**
 * Painel comercial da Visão Geral — reusa regras das listas.
 * Não calcula lucro, margem nem resultado Vendas − Compras.
 */

import { calcularCustoMedioCabeca, calcularCustoMedioKg } from "@shared/compraComercial";
import { contarIdentificacao } from "@shared/compraIdentificacao";
import {
  comprasParaTotaisRodape,
  pesoComercialCompraListagem,
  valorComercialCompraListagem,
  type CompraListagemRow,
} from "./comprasListagem";
import {
  vendasParaTotaisRodape,
  type VendaListagemRow,
} from "./vendasListagem";
import {
  formatarMetricaValor,
  normalizeOperacaoData,
  operacaoNoPeriodo,
  parseQuantidadeOperacao,
  parseValorOperacao,
  type CommercialMetric,
} from "./compraVendaResumo";
import { parseLocalDate, toLocalDateISO } from "./date-utils";

export const LIMITE_OPERACOES_RECENTES_PAINEL = 5;
export const LIMITE_DIAS_SERIE_DIARIA_PAINEL = 45;

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export type PainelPeriodo = { de: string; ate: string };

export type PainelOperacaoLinha = {
  id: number;
  data: string;
  parceiro: string;
  animais: CommercialMetric;
  peso: CommercialMetric;
  valor: CommercialMetric;
};

export type PainelComercialLado = {
  valor: CommercialMetric;
  animais: CommercialMetric;
  peso: CommercialMetric;
  custoMedioKg: CommercialMetric;
  recentes: PainelOperacaoLinha[];
};

export type PainelPerfilOperacoes = {
  operacoes: number;
  animaisPorOperacao: CommercialMetric;
  pesoMedioPorAnimal: CommercialMetric;
  medioPorAnimal: CommercialMetric;
  medioPorKg: CommercialMetric;
};

export type PainelGranularidadeSerie = "dia" | "mes";

export type PainelPontoSerie = {
  chave: string;
  label: string;
  labelTooltip: string;
  compras: number;
  vendas: number;
};

export type PainelSerieTemporal = {
  granularidade: PainelGranularidadeSerie;
  pontos: PainelPontoSerie[];
  temOperacao: boolean;
};

export type PainelAtencaoCompras = {
  comprasComRecebimentoPendente: number;
  animaisPendentes: number;
  destinoRecebimentoId: number | null;
};

export type PainelAtencaoDestino =
  | { tipo: "recebimento"; compraId: number }
  | { tipo: "lista-compras" }
  | null;

export function destinoAtencaoRecebimento(atencao: PainelAtencaoCompras): PainelAtencaoDestino {
  if (atencao.comprasComRecebimentoPendente <= 0) return null;
  if (atencao.destinoRecebimentoId != null) {
    return { tipo: "recebimento", compraId: atencao.destinoRecebimentoId };
  }
  return { tipo: "lista-compras" };
}

export function destinoAtencaoIdentificacao(atencao: PainelAtencaoCompras): PainelAtencaoDestino {
  if (atencao.animaisPendentes <= 0) return null;
  if (atencao.destinoRecebimentoId != null) {
    return { tipo: "recebimento", compraId: atencao.destinoRecebimentoId };
  }
  return { tipo: "lista-compras" };
}

export function destinoAtencaoPendencia(atencao: PainelAtencaoCompras): PainelAtencaoDestino {
  return destinoAtencaoRecebimento(atencao);
}

export function resumoAtencaoPendencia(atencao: PainelAtencaoCompras): string {
  const compras = atencao.comprasComRecebimentoPendente;
  const animais = atencao.animaisPendentes;
  const compraLabel = compras === 1 ? "compra" : "compras";
  const animalLabel = animais === 1 ? "animal" : "animais";
  return `${compras.toLocaleString("pt-BR")} ${compraLabel} · ${animais.toLocaleString("pt-BR")} ${animalLabel}`;
}

export function tituloAtencaoPendencia(): string {
  return "Aguardando entrada";
}

export function textoAtencaoPendencia(atencao: PainelAtencaoCompras): string {
  if (atencao.comprasComRecebimentoPendente <= 0) {
    return "Nenhuma compra aguardando entrada no rebanho.";
  }
  return "Animais comprados que ainda não deram entrada individual no rebanho.";
}

export function rotuloAcaoAtencaoPainel(destino: PainelAtencaoDestino): string | null {
  if (!destino) return null;
  if (destino.tipo === "recebimento") return "Continuar recebimento →";
  return "Ver compras →";
}

/** Só apresentação do eixo X. Não remove dias sem operação. */
export function intervaloTicksEixoXPainel(
  qtdPontos: number,
  granularidade: PainelGranularidadeSerie,
  compacto: boolean,
): number {
  if (granularidade === "mes" || qtdPontos <= (compacto ? 5 : 8)) return 0;
  const alvos = compacto ? 5 : 8;
  return Math.max(1, Math.ceil(qtdPontos / alvos) - 1);
}

/** Só apresentação do eixo Y. Não altera valores das barras. */
export function formatarEixoYValorPainel(valor: number): string {
  const n = Number(valor);
  if (!Number.isFinite(n) || n === 0) return "R$ 0";
  const sinal = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const mi = abs / 1_000_000;
    const arred = abs >= 10_000_000 ? Math.round(mi) : Math.round(mi * 10) / 10;
    return `${sinal}R$ ${arred.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  }
  if (abs >= 1000) {
    const mil = abs / 1000;
    const arred = abs >= 10_000 ? Math.round(mil) : Math.round(mil * 10) / 10;
    return `${sinal}R$ ${arred.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return `${sinal}R$ ${Math.round(abs).toLocaleString("pt-BR")}`;
}

/** Tooltip: valor completo. Não altera as barras nem o eixo. */
export function linhasTooltipSeriePainel(ponto: {
  labelTooltip?: string;
  compras?: number;
  vendas?: number;
}): { data: string; compras: string; vendas: string } {
  return {
    data: ponto.labelTooltip ?? "",
    compras: `Compras: ${formatarMetricaValor({ kind: "known", value: Number(ponto.compras) || 0 })}`,
    vendas: `Vendas: ${formatarMetricaValor({ kind: "known", value: Number(ponto.vendas) || 0 })}`,
  };
}

function metricaZero(): CommercialMetric {
  return { kind: "known", value: 0 };
}

function metricaDe(n: number | null): CommercialMetric {
  return n == null ? { kind: "unknown" } : { kind: "known", value: n };
}

function arredondarPesoPainel(n: number): number {
  return Math.round(n * 100) / 100;
}

function somarConhecidos(valores: Array<number | null>): CommercialMetric {
  if (!valores.length) return metricaZero();
  if (valores.some(v => v == null)) return { kind: "unknown" };
  return { kind: "known", value: valores.reduce<number>((acc, v) => acc + (v ?? 0), 0) };
}

function somarPesosComerciais(pesos: Array<number | null>): CommercialMetric {
  const conhecidos = pesos.filter((n): n is number => n != null);
  if (!conhecidos.length) return metricaZero();
  return { kind: "known", value: arredondarPesoPainel(conhecidos.reduce((a, b) => a + b, 0)) };
}

/** Σ valor / Σ peso das operações com peso > 0. Sem denominador, não divide. */
export function mediaPonderadaKgPainel(
  pares: ReadonlyArray<{ valor: number | null; peso: number | null }>,
): CommercialMetric {
  let somaValor = 0;
  let somaPeso = 0;
  for (const par of pares) {
    if (par.valor == null || par.peso == null || par.peso <= 0) continue;
    somaValor += par.valor;
    somaPeso += par.peso;
  }
  const medio = calcularCustoMedioKg(somaValor, somaPeso);
  return medio == null ? { kind: "unknown" } : { kind: "known", value: medio };
}

function pesoComercialVendaPainel(venda: VendaListagemRow): number | null {
  if (venda.pesoTotal == null || venda.pesoTotal === "") return null;
  const n = Number(venda.pesoTotal);
  return Number.isFinite(n) ? n : null;
}

function valorComercialVendaPainel(venda: VendaListagemRow): number | null {
  return parseValorOperacao(venda.valorTotalNumero ?? venda.valorTotal);
}

function ordenarRecentes<T extends { id: number; data?: string | null }>(
  rows: ReadonlyArray<T>,
): T[] {
  return [...rows].sort((a, b) => {
    const da = String(a.data ?? "");
    const db = String(b.data ?? "");
    if (da !== db) return db.localeCompare(da);
    return b.id - a.id;
  });
}

function noPeriodoEfetivo<T extends { data?: string | null; status?: string | null }>(
  rows: ReadonlyArray<T>,
  periodo: PainelPeriodo,
  recortarEfetivo: (lista: T[]) => T[],
): T[] {
  const noPeriodo = rows.filter(row => operacaoNoPeriodo(row.data, periodo.de, periodo.ate));
  return recortarEfetivo(noPeriodo);
}

export function comprasEfetivasDoPeriodo(
  compras: ReadonlyArray<CompraListagemRow>,
  periodo: PainelPeriodo,
): CompraListagemRow[] {
  return noPeriodoEfetivo(compras, periodo, lista => comprasParaTotaisRodape(lista));
}

export function vendasEfetivasDoPeriodo(
  vendas: ReadonlyArray<VendaListagemRow>,
  periodo: PainelPeriodo,
): VendaListagemRow[] {
  return noPeriodoEfetivo(vendas, periodo, lista => vendasParaTotaisRodape(lista));
}

function animaisPorOperacaoPainel(animais: Array<number | null>, operacoes: number): CommercialMetric {
  if (operacoes <= 0) return { kind: "unknown" };
  if (animais.some(n => n == null)) return { kind: "unknown" };
  const soma = animais.reduce<number>((acc, n) => acc + (n ?? 0), 0);
  if (!Number.isFinite(soma)) return { kind: "unknown" };
  return { kind: "known", value: Math.round((soma / operacoes) * 10) / 10 };
}

function mediaMesmoConjunto(
  pares: ReadonlyArray<{ numerador: number | null; denominador: number | null }>,
  arredondar: (n: number) => number,
): CommercialMetric {
  let somaNum = 0;
  let somaDen = 0;
  for (const par of pares) {
    if (par.numerador == null || par.denominador == null || par.denominador <= 0) continue;
    if (!Number.isFinite(par.numerador) || !Number.isFinite(par.denominador)) continue;
    somaNum += par.numerador;
    somaDen += par.denominador;
  }
  if (somaDen <= 0) return { kind: "unknown" };
  const medio = arredondar(somaNum / somaDen);
  return Number.isFinite(medio) ? { kind: "known", value: medio } : { kind: "unknown" };
}

export function formatarMediaQuantidadePainel(metric: CommercialMetric): string {
  if (metric.kind === "unknown") return "—";
  const arred = Math.round(metric.value * 10) / 10;
  return Number.isInteger(arred)
    ? arred.toLocaleString("pt-BR")
    : arred.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function perfilDeOperacoes(
  rows: ReadonlyArray<{ valor: number | null; animais: number | null; peso: number | null }>,
): PainelPerfilOperacoes {
  const medioPorKg = mediaPonderadaKgPainel(rows.map(row => ({ valor: row.valor, peso: row.peso })));
  return {
    operacoes: rows.length,
    animaisPorOperacao: animaisPorOperacaoPainel(rows.map(row => row.animais), rows.length),
    pesoMedioPorAnimal: mediaMesmoConjunto(
      rows.map(row => ({ numerador: row.peso != null && row.peso > 0 ? row.peso : null, denominador: row.animais })),
      arredondarPesoPainel,
    ),
    medioPorAnimal: mediaMesmoConjunto(
      rows.map(row => ({ numerador: row.valor, denominador: row.animais })),
      n => calcularCustoMedioCabeca(n, 1) ?? n,
    ),
    medioPorKg,
  };
}

export function resumirPerfilComprasPainel(
  compras: ReadonlyArray<CompraListagemRow>,
  periodo: PainelPeriodo,
): PainelPerfilOperacoes {
  return perfilDeOperacoes(
    comprasEfetivasDoPeriodo(compras, periodo).map(compra => ({
      valor: valorComercialCompraListagem(compra),
      animais: parseQuantidadeOperacao(compra),
      peso: pesoComercialCompraListagem(compra),
    })),
  );
}

export function resumirPerfilVendasPainel(
  vendas: ReadonlyArray<VendaListagemRow>,
  periodo: PainelPeriodo,
): PainelPerfilOperacoes {
  return perfilDeOperacoes(
    vendasEfetivasDoPeriodo(vendas, periodo).map(venda => ({
      valor: valorComercialVendaPainel(venda),
      animais: parseQuantidadeOperacao(venda),
      peso: pesoComercialVendaPainel(venda),
    })),
  );
}

function contarDiasCivis(de: string, ate: string): number {
  const inicio = parseLocalDate(de);
  const fim = parseLocalDate(ate);
  if (!inicio || !fim || inicio > fim) return 0;
  return Math.round((fim.getTime() - inicio.getTime()) / 86_400_000) + 1;
}

export function granularidadeSeriePainel(periodo: PainelPeriodo): PainelGranularidadeSerie {
  const dias = contarDiasCivis(periodo.de, periodo.ate);
  return dias > 0 && dias <= LIMITE_DIAS_SERIE_DIARIA_PAINEL ? "dia" : "mes";
}

function labelMesPainel(anoMes: string): string {
  const [ano, mes] = anoMes.split("-");
  const idx = Number(mes) - 1;
  const nome = MESES_PT[idx] ?? mes;
  return `${nome}/${ano}`;
}

function labelDiaCurto(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  return `${match[3]}/${match[2]}`;
}

function labelDiaTooltip(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function eixosSeriePainel(periodo: PainelPeriodo, granularidade: PainelGranularidadeSerie): PainelPontoSerie[] {
  const inicio = parseLocalDate(periodo.de);
  const fim = parseLocalDate(periodo.ate);
  if (!inicio || !fim || inicio > fim) return [];

  if (granularidade === "dia") {
    const pontos: PainelPontoSerie[] = [];
    const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
    const ultimo = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
    while (cursor <= ultimo) {
      const iso = toLocalDateISO(cursor);
      pontos.push({
        chave: iso,
        label: labelDiaCurto(iso),
        labelTooltip: labelDiaTooltip(iso),
        compras: 0,
        vendas: 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return pontos;
  }

  const pontos: PainelPontoSerie[] = [];
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const ultimo = new Date(fim.getFullYear(), fim.getMonth(), 1);
  while (cursor <= ultimo) {
    const chave = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    pontos.push({
      chave,
      label: labelMesPainel(chave),
      labelTooltip: labelMesPainel(chave),
      compras: 0,
      vendas: 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return pontos;
}

function chaveSerie(data: unknown, granularidade: PainelGranularidadeSerie): string | null {
  const iso = normalizeOperacaoData(data);
  if (!iso) return null;
  return granularidade === "dia" ? iso : iso.slice(0, 7);
}

function somarValorNoPonto(pontos: Map<string, PainelPontoSerie>, chave: string, lado: "compras" | "vendas", valor: number | null) {
  if (valor == null || !Number.isFinite(valor)) return;
  const ponto = pontos.get(chave);
  if (!ponto) return;
  ponto[lado] += valor;
}

export function agruparSeriesTemporaisPainel(
  compras: ReadonlyArray<CompraListagemRow>,
  vendas: ReadonlyArray<VendaListagemRow>,
  periodo: PainelPeriodo,
): PainelSerieTemporal {
  const granularidade = granularidadeSeriePainel(periodo);
  const eixos = eixosSeriePainel(periodo, granularidade);
  const mapa = new Map(eixos.map(ponto => [ponto.chave, { ...ponto }]));
  const comprasEfetivas = comprasEfetivasDoPeriodo(compras, periodo);
  const vendasEfetivas = vendasEfetivasDoPeriodo(vendas, periodo);

  for (const compra of comprasEfetivas) {
    const chave = chaveSerie(compra.data, granularidade);
    if (chave) somarValorNoPonto(mapa, chave, "compras", valorComercialCompraListagem(compra));
  }
  for (const venda of vendasEfetivas) {
    const chave = chaveSerie(venda.data, granularidade);
    if (chave) somarValorNoPonto(mapa, chave, "vendas", valorComercialVendaPainel(venda));
  }

  return {
    granularidade,
    pontos: eixos.map(eixo => mapa.get(eixo.chave) ?? eixo),
    temOperacao: comprasEfetivas.length + vendasEfetivas.length > 0,
  };
}

function identificadosDaCompra(compra: CompraListagemRow): number {
  return Math.max(0, Math.floor(Number(compra.identificados)) || 0);
}

export function resumirAtencaoComprasPainel(
  compras: ReadonlyArray<CompraListagemRow>,
  periodo: PainelPeriodo,
): PainelAtencaoCompras {
  const efetivas = comprasEfetivasDoPeriodo(compras, periodo);
  const idsRecebimento: number[] = [];
  let animaisPendentes = 0;

  for (const compra of efetivas) {
    const comprados = parseQuantidadeOperacao(compra) ?? 0;
    const { pendentes } = contarIdentificacao({
      comprados,
      identificados: identificadosDaCompra(compra),
    });
    if (pendentes > 0) {
      idsRecebimento.push(compra.id);
      animaisPendentes += pendentes;
    }
  }

  return {
    comprasComRecebimentoPendente: idsRecebimento.length,
    animaisPendentes,
    destinoRecebimentoId: idsRecebimento.length === 1 ? idsRecebimento[0]! : null,
  };
}

export function resumirPainelCompras(
  compras: ReadonlyArray<CompraListagemRow>,
  periodo: PainelPeriodo,
  limiteRecentes = LIMITE_OPERACOES_RECENTES_PAINEL,
): PainelComercialLado {
  const efetivas = comprasEfetivasDoPeriodo(compras, periodo);
  const valores = efetivas.map(valorComercialCompraListagem);
  const animais = efetivas.map(compra => parseQuantidadeOperacao(compra));
  const pesos = efetivas.map(pesoComercialCompraListagem);
  const recentes = ordenarRecentes(efetivas)
    .slice(0, limiteRecentes)
    .map(compra => ({
      id: compra.id,
      data: String(compra.data ?? ""),
      parceiro: String(compra.fornecedor ?? "").trim() || "—",
      animais: metricaDe(parseQuantidadeOperacao(compra)),
      peso: metricaDe(pesoComercialCompraListagem(compra)),
      valor: metricaDe(valorComercialCompraListagem(compra)),
    }));

  return {
    valor: somarConhecidos(valores),
    animais: somarConhecidos(animais),
    peso: somarPesosComerciais(pesos),
    custoMedioKg: mediaPonderadaKgPainel(
      efetivas.map(compra => ({
        valor: valorComercialCompraListagem(compra),
        peso: pesoComercialCompraListagem(compra),
      })),
    ),
    recentes,
  };
}

export function resumirPainelVendas(
  vendas: ReadonlyArray<VendaListagemRow>,
  periodo: PainelPeriodo,
  limiteRecentes = LIMITE_OPERACOES_RECENTES_PAINEL,
): PainelComercialLado {
  const efetivas = vendasEfetivasDoPeriodo(vendas, periodo);
  const valores = efetivas.map(valorComercialVendaPainel);
  const animais = efetivas.map(venda => parseQuantidadeOperacao(venda));
  const pesos = efetivas.map(pesoComercialVendaPainel);
  const recentes = ordenarRecentes(efetivas)
    .slice(0, limiteRecentes)
    .map(venda => ({
      id: venda.id,
      data: String(venda.data ?? ""),
      parceiro: String(venda.comprador ?? "").trim() || "—",
      animais: metricaDe(parseQuantidadeOperacao(venda)),
      peso: metricaDe(pesoComercialVendaPainel(venda)),
      valor: metricaDe(valorComercialVendaPainel(venda)),
    }));

  return {
    valor: somarConhecidos(valores),
    animais: somarConhecidos(animais),
    peso: somarPesosComerciais(pesos),
    custoMedioKg: mediaPonderadaKgPainel(
      efetivas.map(venda => ({
        valor: valorComercialVendaPainel(venda),
        peso: pesoComercialVendaPainel(venda),
      })),
    ),
    recentes,
  };
}
