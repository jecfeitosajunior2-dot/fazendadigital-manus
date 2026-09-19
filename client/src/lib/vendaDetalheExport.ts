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

export function buildVendaDetalheExportIdentificacao(venda: VendaDetalheExportInput): ExportReportInfoLine[] {
  const linhas: ExportReportInfoLine[] = [
    { label: "Venda", value: String(venda.id) },
    { label: "Status", value: labelStatusVenda(venda.status) },
    { label: "Data", value: formatDateBR(venda.data) },
    { label: "Fazenda", value: textoOuTraco(venda.fazendaNome) },
    { label: "Comprador", value: textoOuTraco(venda.comprador) },
    { label: "Forma de precificação", value: rotuloFormaPrecificacaoVenda(venda.formaPrecificacao) },
    {
      label: "Animais",
      value: String(venda.totais.quantidade),
    },
    {
      label: "Peso total",
      value:
        venda.totais.pesoTotal != null
          ? `${venda.totais.pesoTotal.toLocaleString("pt-BR")} kg`
          : "—",
    },
  ];

  if (venda.formaPrecificacao === "kg" && venda.totais.precoMedioKg != null) {
    linhas.push({ label: "R$/kg médio", value: money(venda.totais.precoMedioKg) });
  }

  linhas.push({ label: "Valor total", value: money(venda.totais.valorTotal) });
  linhas.push({
    label: "GTA",
    value: rotuloDocumentoVenda("gta", temDocumentoVenda(venda.documentos, "gta")),
  });
  linhas.push({
    label: "Nota Fiscal",
    value: rotuloDocumentoVenda("nota_fiscal", temDocumentoVenda(venda.documentos, "nota_fiscal")),
  });

  if (venda.status === "cancelado") {
    linhas.push(
      { label: "Cancelada em", value: formatDateTimeBR(venda.canceladoEm) },
      { label: "Cancelada por", value: textoOuTraco(venda.canceladoPorNome) },
      { label: "Motivo do cancelamento", value: textoOuTraco(venda.motivoCancelamento) },
    );
  }

  return linhas;
}

export function serializarIdentificacaoVendaDetalhe(linhas: ExportReportInfoLine[]): string {
  return linhas.map(l => `${l.label}: ${l.value}`).join("\n");
}
