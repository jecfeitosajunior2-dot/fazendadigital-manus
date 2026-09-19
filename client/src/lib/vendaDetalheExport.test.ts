import { describe, expect, it } from "vitest";
import { buildExportSpreadsheetWorkbook } from "@shared/buildExportSpreadsheet";
import {
  VENDA_DETALHE_EXPORT_SISTEMA,
  VENDA_DETALHE_EXPORT_TITULO,
  buildVendaDetalheExportHeaders,
  buildVendaDetalheExportRows,
  buildVendaDetalheExportSubtitlesExcel,
  buildVendaDetalhePdfReportBlocks,
  cabecalhoPrecoUnitarioVenda,
  nomeAbaExcelVendaDetalhe,
  nomeArquivoVendaDetalhe,
  podeExportarVendaDetalhe,
  serializarPdfReportBlocks,
  temDocumentoVenda,
  type VendaDetalheExportInput,
} from "./vendaDetalheExport";

const vendaConcluida: VendaDetalheExportInput = {
  id: 1,
  userId: 1,
  status: "concluido",
  data: "2026-09-19",
  fazendaNome: "Fazenda J",
  comprador: "Frigorífico São Paulo",
  formaPrecificacao: "kg",
  totais: {
    quantidade: 2,
    pesoTotal: 450,
    valorTotal: 4612.5,
    precoMedioKg: 10.25,
  },
  itens: [
    {
      animalId: 25,
      brincoSnapshot: "801",
      loteNomeSnapshot: null,
      pesoVenda: 200,
      precoUnitario: 10.25,
      valorItem: 2050,
    },
    {
      animalId: 26,
      brincoSnapshot: "802",
      loteNomeSnapshot: null,
      pesoVenda: 250,
      precoUnitario: 10.25,
      valorItem: 2562.5,
    },
  ],
  documentos: [{ tipo: "nota_fiscal" }],
};

const vendaCancelada: VendaDetalheExportInput = {
  ...vendaConcluida,
  id: 44,
  status: "cancelado",
  canceladoEm: "2026-09-20T15:30:00.000Z",
  canceladoPorNome: "Administrador",
  motivoCancelamento: "Digitação incorreta do comprador",
};

describe("exportação da ficha da venda", () => {
  it("PDF/Excel de venda concluída usam os dados reais da venda e dos itens", () => {
    const excel = buildVendaDetalheExportSubtitlesExcel(vendaConcluida).join("\n");
    const rows = buildVendaDetalheExportRows(vendaConcluida);

    expect(VENDA_DETALHE_EXPORT_SISTEMA).toBe("Fazenda Digital");
    expect(VENDA_DETALHE_EXPORT_TITULO).toBe("Relatório de Venda");
    expect(excel).toBe(
      [
        "Venda 1 · Concluída · 19/09/2026 · Fazenda J · Frigorífico São Paulo · R$/kg vivo",
        "2 animais · 450 kg · R$ 10,25/kg · R$ 4.612,50",
      ].join("\n"),
    );
    expect(rows).toEqual([
      ["801", "—", "200 kg", "R$ 10,25", "R$ 2.050,00"],
      ["802", "—", "250 kg", "R$ 10,25", "R$ 2.562,50"],
    ]);
  });

  it("PDF organiza identificação em colunas e resumo em métricas", () => {
    const blocks = buildVendaDetalhePdfReportBlocks(vendaConcluida);
    const texto = serializarPdfReportBlocks(blocks);
    expect(blocks[0]).toMatchObject({
      type: "fields",
      items: [
        { label: "Data", value: "19/09/2026" },
        { label: "Fazenda", value: "Fazenda J" },
        { label: "Comprador", value: "Frigorífico São Paulo" },
      ],
    });
    expect(blocks[1]).toMatchObject({
      type: "fields",
      items: [{ label: "Forma de precificação", value: "R$/kg vivo" }],
    });
    expect(blocks.some(block => block.type === "metrics")).toBe(true);
    expect(texto).toContain("Animais: 2");
    expect(texto).toContain("Peso total: 450 kg");
    expect(texto).toContain("R$/kg médio: R$ 10,25");
    expect(texto).toContain("Valor total: R$ 4.612,50");
    expect(texto).not.toContain("GTA");
    expect(texto).not.toContain("Nota Fiscal");
  });

  it("cabeçalho de preço respeita a modalidade", () => {
    expect(buildVendaDetalheExportHeaders("kg")).toEqual([
      "Brinco",
      "Lote",
      "Peso do embarque",
      "R$/kg",
      "Valor",
    ]);
    expect(cabecalhoPrecoUnitarioVenda("cabeca")).toBe("R$/cabeça");
    expect(buildVendaDetalheExportHeaders("cabeca")[3]).toBe("R$/cabeça");
    expect(buildVendaDetalheExportHeaders("arroba")[3]).toBe("R$/@");
    expect(
      buildVendaDetalheExportSubtitlesExcel({
        ...vendaConcluida,
        formaPrecificacao: "cabeca",
        totais: { ...vendaConcluida.totais, precoMedioKg: null },
      }).join("\n"),
    ).not.toContain("/kg");
  });

  it("não lista GTA/NF nem caminho de storage nas exportações", () => {
    const texto = buildVendaDetalheExportSubtitlesExcel(vendaConcluida).join("\n");
    const pdf = serializarPdfReportBlocks(buildVendaDetalhePdfReportBlocks(vendaConcluida));
    expect(temDocumentoVenda(vendaConcluida.documentos, "gta")).toBe(false);
    expect(temDocumentoVenda(vendaConcluida.documentos, "nota_fiscal")).toBe(true);
    expect(texto).not.toContain("GTA");
    expect(texto).not.toContain("Nota Fiscal");
    expect(pdf).not.toContain("GTA");
    expect(pdf).not.toContain("Nota Fiscal");
    expect(texto).not.toContain("manus-storage");
    expect(texto).not.toContain("storage_path");
    expect(texto).not.toContain("venda_doc_");
  });

  it("venda cancelada mantém valores e inclui o cancelamento", () => {
    const texto = buildVendaDetalheExportSubtitlesExcel(vendaCancelada).join("\n");
    const pdf = serializarPdfReportBlocks(buildVendaDetalhePdfReportBlocks(vendaCancelada));
    const rows = buildVendaDetalheExportRows(vendaCancelada);
    expect(texto).toContain("Cancelada");
    expect(texto).toContain("Administrador");
    expect(texto).toContain("Digitação incorreta do comprador");
    expect(texto).toContain("4.612,50");
    expect(pdf).toContain("Cancelada em:");
    expect(pdf).toContain("Cancelada por: Administrador");
    expect(pdf).toContain("Motivo: Digitação incorreta do comprador");
    expect(rows[0]?.[0]).toBe("801");
    expect(rows[0]?.[4]).toBe("R$ 2.050,00");
  });

  it("usuário sem acesso não exporta venda de outro usuário", () => {
    expect(podeExportarVendaDetalhe(1, 1)).toBe(true);
    expect(podeExportarVendaDetalhe(1, 99)).toBe(false);
    expect(podeExportarVendaDetalhe(null, 1)).toBe(false);
    const outra = buildVendaDetalheExportSubtitlesExcel({ ...vendaConcluida, id: 99, userId: 7 }).join("\n");
    expect(outra).toContain("Venda 99");
    expect(outra).not.toContain("Venda 1");
  });

  it("nomes dos arquivos são claros e sem UUID/storage", () => {
    expect(nomeArquivoVendaDetalhe(vendaConcluida, "pdf")).toBe("Venda-1-19-09-2026.pdf");
    expect(nomeArquivoVendaDetalhe(vendaConcluida, "xlsx")).toBe("Venda-1-19-09-2026.xlsx");
    expect(nomeAbaExcelVendaDetalhe(1)).toBe("Venda 1");
    expect(nomeArquivoVendaDetalhe(vendaConcluida, "pdf")).not.toMatch(/[0-9a-f]{16}/);
  });

  it("exportação é só leitura — builders não mutam a venda", () => {
    const snapshot = structuredClone(vendaConcluida);
    buildVendaDetalheExportRows(vendaConcluida);
    buildVendaDetalheExportSubtitlesExcel(vendaConcluida);
    buildVendaDetalhePdfReportBlocks(vendaConcluida);    expect(vendaConcluida).toEqual(snapshot);
    expect(vendaConcluida.status).toBe("concluido");
    expect(vendaConcluida.totais.valorTotal).toBe(4612.5);
  });

  it("Excel volta ao cabeçalho corrido e à tabela em texto", async () => {
    const subtitles = buildVendaDetalheExportSubtitlesExcel(vendaConcluida);
    const wb = await buildExportSpreadsheetWorkbook(
      buildVendaDetalheExportHeaders("kg"),
      buildVendaDetalheExportRows(vendaConcluida),
      {
        reportTitle: VENDA_DETALHE_EXPORT_TITULO,
        reportSubtitles: subtitles,
        sheetName: nomeAbaExcelVendaDetalhe(1),
        allowEmpty: true,
        autoFilter: false,
      },
    );
    const ws = wb.getWorksheet("Venda 1");
    expect(ws).toBeTruthy();
    expect(ws!.getRow(1).getCell(1).value).toBe("Relatório de Venda");
    expect(ws!.getRow(2).getCell(1).value).toBe(
      "Venda 1 · Concluída · 19/09/2026 · Fazenda J · Frigorífico São Paulo · R$/kg vivo",
    );
    expect(ws!.getRow(3).getCell(1).value).toBe("2 animais · 450 kg · R$ 10,25/kg · R$ 4.612,50");
    expect(ws!.getRow(5).getCell(1).value).toBe("Brinco");
    expect(ws!.getRow(6).getCell(1).value).toBe("801");
    expect(ws!.getRow(6).getCell(3).value).toBe("200 kg");
    expect(ws!.getRow(6).getCell(4).value).toBe("R$ 10,25");
    expect(ws!.getRow(6).getCell(5).value).toBe("R$ 2.050,00");
    expect(ws!.getRow(7).getCell(3).value).toBe("250 kg");
    expect(ws!.getRow(7).getCell(5).value).toBe("R$ 2.562,50");

    const buf = await wb.xlsx.writeBuffer();
    expect(buf.byteLength).toBeGreaterThan(100);
  });
});
