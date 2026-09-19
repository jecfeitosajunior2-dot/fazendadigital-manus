import { formatDateBR } from "@/lib/date-utils";
import { labelStatusVenda } from "@/lib/vendasListagem";
import type { ExportReportInfoLine } from "@shared/buildExportSpreadsheet";
import {
  FORMA_PRECIFICACAO_VENDA_LABEL,
  isFormaPrecificacaoVenda,
} from "@shared/vendaComercial";

export const VENDA_DETALHE_EXPORT_SISTEMA = "Fazenda Digital";
export const VENDA_DETALHE_EXPORT_TITULO = "Relatório de Venda";

export type VendaDetalheExportDocumento = {
  tipo: string;
};

export type VendaDetalheExportItem = {
  animalId: number;
  brincoSnapshot?: string | null;
  loteNomeSnapshot?: string | null;
  pesoVenda?: number | string | null;
  precoUnitario: number | string;
  valorItem: number | string;
};

export type VendaDetalheExportInput = {
  id: number;
  userId?: number | null;
  status?: string | null;
  data: unknown;
  fazendaNome?: string | null;
  comprador?: string | null;
  formaPrecificacao?: string | null;
  totais: {
    quantidade: number;
    pesoTotal: number | null;
    valorTotal: number;
    precoMedioKg?: number | null;
  };
  itens: VendaDetalheExportItem[];
  documentos?: VendaDetalheExportDocumento[] | null;
  canceladoEm?: unknown;
  canceladoPorNome?: string | null;
  motivoCancelamento?: string | null;
};

export type VendaExportCampo = {
  label: string;
  value: string;
  emphasize?: boolean;
};

export type VendaPdfReportBlock =
  | { type: "fields"; items: VendaExportCampo[] }
  | { type: "metrics"; items: VendaExportCampo[] }
  | { type: "divider" }
  | { type: "text"; text: string };

function money(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function textoOuTraco(value: unknown): string {
  const t = String(value ?? "").trim();
  return t || "—";
}

function formatDateTimeBR(value: unknown): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

export function cabecalhoPrecoUnitarioVenda(forma?: string | null): string {
  if (forma === "cabeca") return "R$/cabeça";
  if (forma === "arroba") return "R$/@";
  if (forma === "kg") return "R$/kg";
  return "Preço";
}

export function rotuloFormaPrecificacaoVenda(forma?: string | null): string {
  return isFormaPrecificacaoVenda(forma) ? FORMA_PRECIFICACAO_VENDA_LABEL[forma] : "—";
}

export function temDocumentoVenda(
  documentos: VendaDetalheExportDocumento[] | null | undefined,
  tipo: "gta" | "nota_fiscal",
): boolean {
  return (documentos ?? []).some(doc => doc.tipo === tipo);
}

export function rotuloDocumentoVenda(tipo: "gta" | "nota_fiscal", anexado: boolean): string {
  if (tipo === "nota_fiscal") return anexado ? "Anexada" : "Não anexada";
  return anexado ? "Anexado" : "Não anexado";
}

export function podeExportarVendaDetalhe(
  userId: number | null | undefined,
  vendaUserId: number | null | undefined,
): boolean {
  return Number.isFinite(userId) && Number(userId) > 0 && Number(userId) === Number(vendaUserId);
}

export function nomeArquivoVendaDetalhe(
  venda: Pick<VendaDetalheExportInput, "id" | "data">,
  ext: "pdf" | "xlsx",
): string {
  const dataBr = formatDateBR(venda.data);
  const dataPart = dataBr === "—" ? "sem-data" : dataBr.replace(/\//g, "-");
  return `Venda-${venda.id}-${dataPart}.${ext}`;
}

export function nomeAbaExcelVendaDetalhe(vendaId: number): string {
  return `Venda ${vendaId}`.slice(0, 31);
}

export function buildVendaDetalheExportHeaders(forma?: string | null): string[] {
  return ["Brinco", "Lote", "Peso do embarque", cabecalhoPrecoUnitarioVenda(forma), "Valor"];
}

export function buildVendaDetalheExportRows(venda: VendaDetalheExportInput): Array<Array<string | number>> {
  if (!venda.itens.length) {
    return [["—", "—", "—", "—", "—"]];
  }
  return venda.itens.map(item => [
    textoOuTraco(item.brincoSnapshot) === "—" ? `#${item.animalId}` : String(item.brincoSnapshot).trim(),
    textoOuTraco(item.loteNomeSnapshot),
    item.pesoVenda != null && Number.isFinite(Number(item.pesoVenda))
      ? `${Number(item.pesoVenda).toLocaleString("pt-BR")} kg`
      : "—",
    money(item.precoUnitario),
    money(item.valorItem),
  ]);
}

export function buildVendaDetalheExportContexto(venda: VendaDetalheExportInput): string {
  return [
    `Venda ${venda.id}`,
    labelStatusVenda(venda.status),
    formatDateBR(venda.data),
    textoOuTraco(venda.fazendaNome),
    textoOuTraco(venda.comprador),
    rotuloFormaPrecificacaoVenda(venda.formaPrecificacao),
  ].join(" · ");
}

export function buildVendaDetalheExportTotais(venda: VendaDetalheExportInput): string {
  const partes = [
    `${venda.totais.quantidade} ${venda.totais.quantidade === 1 ? "animal" : "animais"}`,
    venda.totais.pesoTotal != null ? `${venda.totais.pesoTotal.toLocaleString("pt-BR")} kg` : "—",
  ];
  if (venda.formaPrecificacao === "kg" && venda.totais.precoMedioKg != null) {
    partes.push(`${money(venda.totais.precoMedioKg)}/kg`);
  }
  partes.push(money(venda.totais.valorTotal));
  return partes.join(" · ");
}

export function buildVendaDetalheExportCancelamento(venda: VendaDetalheExportInput): string | null {
  if (venda.status !== "cancelado") return null;
  return [
    `Cancelada em ${formatDateTimeBR(venda.canceladoEm)}`,
    textoOuTraco(venda.canceladoPorNome),
    textoOuTraco(venda.motivoCancelamento),
  ].join(" · ");
}

export function buildVendaDetalheExportSubtitlesExcel(venda: VendaDetalheExportInput): string[] {
  const linhas = [
    buildVendaDetalheExportContexto(venda),
    buildVendaDetalheExportTotais(venda),
  ];
  const cancelamento = buildVendaDetalheExportCancelamento(venda);
  if (cancelamento) linhas.push(cancelamento);
  return linhas;
}

export function buildVendaDetalheExportCamposIdentificacao(venda: VendaDetalheExportInput): ExportReportInfoLine[] {
  return [
    { label: "Venda", value: String(venda.id) },
    { label: "Status", value: labelStatusVenda(venda.status) },
    { label: "Data", value: formatDateBR(venda.data) },
    { label: "Fazenda", value: textoOuTraco(venda.fazendaNome) },
    { label: "Comprador", value: textoOuTraco(venda.comprador) },
    { label: "Forma de precificação", value: rotuloFormaPrecificacaoVenda(venda.formaPrecificacao) },
  ];
}

export function buildVendaDetalheExportCamposResumo(venda: VendaDetalheExportInput): ExportReportInfoLine[] {
  const linhas: ExportReportInfoLine[] = [
    { label: "Animais", value: String(venda.totais.quantidade) },
    {
      label: "Peso total",
      value: venda.totais.pesoTotal != null ? `${venda.totais.pesoTotal.toLocaleString("pt-BR")} kg` : "—",
    },
  ];
  if (venda.formaPrecificacao === "kg" && venda.totais.precoMedioKg != null) {
    linhas.push({ label: "R$/kg médio", value: money(venda.totais.precoMedioKg) });
  }
  linhas.push({ label: "Valor total", value: money(venda.totais.valorTotal) });
  return linhas;
}

export function buildVendaDetalheExportCamposCancelamento(
  venda: VendaDetalheExportInput,
): ExportReportInfoLine[] {
  if (venda.status !== "cancelado") return [];
  return [
    { label: "Cancelada em", value: formatDateTimeBR(venda.canceladoEm) },
    { label: "Cancelada por", value: textoOuTraco(venda.canceladoPorNome) },
    { label: "Motivo do cancelamento", value: textoOuTraco(venda.motivoCancelamento) },
  ];
}

/** Identificação + resumo + cancelamento, sem GTA/NF. */
export function buildVendaDetalheExportIdentificacao(venda: VendaDetalheExportInput): ExportReportInfoLine[] {
  return [
    ...buildVendaDetalheExportCamposIdentificacao(venda),
    ...buildVendaDetalheExportCamposResumo(venda),
    ...buildVendaDetalheExportCamposCancelamento(venda),
  ];
}

export function buildVendaDetalhePdfReportBlocks(venda: VendaDetalheExportInput): VendaPdfReportBlock[] {
  const identificacao = buildVendaDetalheExportCamposIdentificacao(venda);
  const resumo = buildVendaDetalheExportCamposResumo(venda);
  const cancelamento = buildVendaDetalheExportCamposCancelamento(venda);
  const campo = (label: string) => identificacao.find(item => item.label === label)!;
  const blocks: VendaPdfReportBlock[] = [
    {
      type: "fields",
      items: [campo("Data"), campo("Fazenda"), campo("Comprador")],
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

export function serializarIdentificacaoVendaDetalhe(linhas: ExportReportInfoLine[]): string {
  return linhas.map(l => `${l.label}: ${l.value}`).join("\n");
}

export function serializarPdfReportBlocks(blocks: VendaPdfReportBlock[]): string {
  return blocks
    .flatMap(block => {
      if (block.type === "divider") return ["---"];
      if (block.type === "text") return [block.text];
      return block.items.map(item => `${item.label}: ${item.value}`);
    })
    .join("\n");
}
