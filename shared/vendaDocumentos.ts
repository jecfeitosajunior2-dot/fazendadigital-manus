export const VENDA_DOCUMENTO_TIPOS = ["gta", "nota_fiscal"] as const;
export type VendaDocumentoTipo = (typeof VENDA_DOCUMENTO_TIPOS)[number];

export const VENDA_DOCUMENTO_TIPO_LABEL: Record<VendaDocumentoTipo, string> = {
  gta: "GTA",
  nota_fiscal: "Nota Fiscal",
};

export const VENDA_DOCUMENTO_MAX_BYTES = 10 * 1024 * 1024;
