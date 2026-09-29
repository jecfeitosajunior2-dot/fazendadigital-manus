import { formatDateBR } from "@/lib/date-utils";
import { labelStatusComercialCompra } from "@shared/compraIdentificacao";
import type { ExportReportInfoLine } from "@shared/buildExportSpreadsheet";

export const COMPRA_DETALHE_EXPORT_SISTEMA = "Fazenda Digital";
export const COMPRA_DETALHE_EXPORT_TITULO = "Relatório de Compra";

export const COMPRA_DETALHE_EXPORT_HEADERS = ["Brinco", "Lote", "Peso de entrada"] as const;

export type CompraDetalheExportAnimal = {
  animalId: number;
  brincoVisual?: string | null;
  loteNome?: string | null;
  pesoKg?: number | null;
};

export type CompraDetalheExportInput = {
  id: number;
  status?: string | null;
  statusComercialLabel?: string | null;
  data: unknown;
  fazendaNome?: string | null;
  fornecedor?: string | null;
  formaLabel?: string | null;
  animais?: ReadonlyArray<CompraDetalheExportAnimal>;
  identificacao: {
    comprados: number;
    identificados: number;
    pendentes: number;
    pesoAdquirido?: number | null;
  };
  valores: {
    custoTotal?: number | null;
    custoMedioKg?: number | null;
  };
  canceladoEm?: unknown;
  canceladoPorNome?: string | null;
  motivoCancelamento?: string | null;
};

export type CompraExportCampo = {
  label: string;
  value: string;
  emphasize?: boolean;
};

export type CompraPdfReportBlock =
  | { type: "fields"; items: CompraExportCampo[] }
  | { type: "metrics"; items: CompraExportCampo[] }
  | { type: "divider" }
  | { type: "text"; text: string };

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function textoOuTraco(value: unknown): string {
  const t = String(value ?? "").trim();
  return t || "—";
}

function peso(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  return `${value.toLocaleString("pt-BR")} kg`;
}

function qtd(value: number): string {
  return value.toLocaleString("pt-BR");
}

function formatDateTimeBR(value: unknown): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

export function nomeArquivoCompraDetalhe(
  compra: Pick<CompraDetalheExportInput, "id" | "data">,
  ext: "pdf" | "xlsx",
): string {
  const dataBr = formatDateBR(compra.data);
  const dataPart = dataBr === "—" ? "sem-data" : dataBr.replace(/\//g, "-");
  return `Compra-${compra.id}-${dataPart}.${ext}`;
}

export function nomeAbaExcelCompraDetalhe(compraId: number): string {
  return `Compra ${compraId}`.slice(0, 31);
}

export function buildCompraDetalheExportHeaders(): string[] {
  return [...COMPRA_DETALHE_EXPORT_HEADERS];
}

export function rotuloBrincoCompraDetalhe(animal: CompraDetalheExportAnimal): string {
  const brinco = String(animal.brincoVisual ?? "").trim();
  return brinco || `#${animal.animalId}`;
}

export function toCompraDetalheExportAnimal(item: {
  animalId: number;
  brincoVisual?: string | null;
  loteNome?: string | null;
  pesoKg?: number | null;
}): CompraDetalheExportAnimal {
  return {
    animalId: item.animalId,
    brincoVisual: item.brincoVisual,
    loteNome: item.loteNome,
    pesoKg: item.pesoKg ?? null,
  };
}

export function buildCompraDetalheExportRows(
  compra: CompraDetalheExportInput,
): Array<Array<string | number>> {
  const animais = compra.animais ?? [];
  if (!animais.length) return [["—", "—", "—"]];
  return animais.map(animal => [
    rotuloBrincoCompraDetalhe(animal),
    textoOuTraco(animal.loteNome),
    peso(animal.pesoKg),
  ]);
}

export function buildCompraDetalheExportContexto(compra: CompraDetalheExportInput): string {
  return [
    `Compra ${compra.id}`,
    textoOuTraco(compra.statusComercialLabel || labelStatusComercialCompra(compra.status)),
    formatDateBR(compra.data),
    textoOuTraco(compra.fazendaNome),
    textoOuTraco(compra.fornecedor),
    textoOuTraco(compra.formaLabel),
  ].join(" · ");
}

export function buildCompraDetalheExportTotais(compra: CompraDetalheExportInput): string {
  const partes = [
    `${qtd(compra.identificacao.comprados)} ${compra.identificacao.comprados === 1 ? "animal" : "animais"}`,
    peso(compra.identificacao.pesoAdquirido),
  ];
  if (compra.valores.custoMedioKg != null) {
    partes.push(`${money(compra.valores.custoMedioKg)}/kg`);
  }
  partes.push(money(compra.valores.custoTotal));
  return partes.join(" · ");
}

export function buildCompraDetalheExportCancelamento(compra: CompraDetalheExportInput): string | null {
  if (compra.status !== "cancelado") return null;
  return [
    `Cancelada em ${formatDateTimeBR(compra.canceladoEm)}`,
    textoOuTraco(compra.canceladoPorNome),
    textoOuTraco(compra.motivoCancelamento),
  ].join(" · ");
}

export function buildCompraDetalheExportSubtitlesExcel(compra: CompraDetalheExportInput): string[] {
  const linhas = [buildCompraDetalheExportContexto(compra), buildCompraDetalheExportTotais(compra)];
  const cancelamento = buildCompraDetalheExportCancelamento(compra);
  if (cancelamento) linhas.push(cancelamento);
  return linhas;
}

export function buildCompraDetalheExportCamposIdentificacao(
  compra: CompraDetalheExportInput,
): ExportReportInfoLine[] {
  return [
    { label: "Compra", value: String(compra.id) },
    {
      label: "Status",
      value: textoOuTraco(compra.statusComercialLabel || labelStatusComercialCompra(compra.status)),
    },
    { label: "Data", value: formatDateBR(compra.data) },
    { label: "Fazenda", value: textoOuTraco(compra.fazendaNome) },
    { label: "Fornecedor", value: textoOuTraco(compra.fornecedor) },
    { label: "Forma de precificação", value: textoOuTraco(compra.formaLabel) },
  ];
}

export function buildCompraDetalheExportCamposResumo(compra: CompraDetalheExportInput): ExportReportInfoLine[] {
  return [
    { label: "Animais", value: qtd(compra.identificacao.comprados) },
    { label: "Peso adquirido", value: peso(compra.identificacao.pesoAdquirido) },
    { label: "R$/kg médio", value: money(compra.valores.custoMedioKg) },
    { label: "Valor total", value: money(compra.valores.custoTotal) },
  ];
}

export function buildCompraDetalheExportCamposCancelamento(
  compra: CompraDetalheExportInput,
): ExportReportInfoLine[] {
  if (compra.status !== "cancelado") return [];
  return [
    { label: "Cancelada em", value: formatDateTimeBR(compra.canceladoEm) },
    { label: "Cancelada por", value: textoOuTraco(compra.canceladoPorNome) },
    { label: "Motivo do cancelamento", value: textoOuTraco(compra.motivoCancelamento) },
  ];
}

export function buildCompraDetalhePdfReportBlocks(compra: CompraDetalheExportInput): CompraPdfReportBlock[] {
  const identificacao = buildCompraDetalheExportCamposIdentificacao(compra);
  const resumo = buildCompraDetalheExportCamposResumo(compra);
  const cancelamento = buildCompraDetalheExportCamposCancelamento(compra);
  const campo = (label: string) => identificacao.find(item => item.label === label)!;
  const blocks: CompraPdfReportBlock[] = [
    {
      type: "fields",
      items: [campo("Data"), campo("Fazenda"), campo("Fornecedor")],
    },
    {
      type: "fields",
      items: [campo("Forma de precificação")],
    },
  ];
  if (cancelamento.length) {
    blocks.push({
      type: "fields",
      items: cancelamento.map(item => ({
        label: item.label === "Motivo do cancelamento" ? "Motivo" : item.label,
        value: item.value,
      })),
    });
  }
  blocks.push({ type: "divider" });
  blocks.push({
    type: "metrics",
    items: resumo.map(item => ({
      label: item.label,
      value: item.value,
      emphasize: item.label === "Valor total",
    })),
  });
  blocks.push({ type: "divider" });
  return blocks;
}

export function serializarPdfReportBlocks(blocks: CompraPdfReportBlock[]): string {
  return blocks
    .flatMap(block => {
      if (block.type === "divider") return ["---"];
      if (block.type === "text") return [block.text];
      return block.items.map(item => `${item.label}: ${item.value}`);
    })
    .join("\n");
}
