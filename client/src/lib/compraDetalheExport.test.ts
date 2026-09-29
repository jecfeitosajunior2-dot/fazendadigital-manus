import { describe, expect, it } from "vitest";
import {
  COMPRA_DETALHE_EXPORT_SISTEMA,
  COMPRA_DETALHE_EXPORT_TITULO,
  buildCompraDetalheExportHeaders,
  buildCompraDetalheExportRows,
  buildCompraDetalheExportSubtitlesExcel,
  buildCompraDetalhePdfReportBlocks,
  nomeAbaExcelCompraDetalhe,
  nomeArquivoCompraDetalhe,
  rotuloBrincoCompraDetalhe,
  serializarPdfReportBlocks,
  type CompraDetalheExportInput,
} from "./compraDetalheExport";

const semNbsp = (texto: string) => texto.replace(/\u00a0/g, " ");

const compraConcluida: CompraDetalheExportInput = {
  id: 2,
  status: "concluido",
  statusComercialLabel: "Concluída",
  data: "2026-09-28",
  fazendaNome: "Fazenda J",
  fornecedor: "Casa do Fazendeiro Veterinária",
  formaLabel: "R$/kg vivo",
  identificacao: {
    comprados: 2,
    identificados: 2,
    pendentes: 0,
    pesoAdquirido: 377,
  },
  animais: [
    { animalId: 101, brincoVisual: "801", loteNome: "Novilhos", pesoKg: 186 },
    { animalId: 102, brincoVisual: "802", loteNome: null, pesoKg: 191 },
  ],
  valores: {
    custoTotal: 4664.25,
    custoMedioKg: 12.37,
  },
};

const compraCancelada: CompraDetalheExportInput = {
  ...compraConcluida,
  id: 8,
  status: "cancelado",
  statusComercialLabel: "Cancelada",
  animais: [],
  canceladoEm: "2026-09-28T15:30:00.000Z",
  canceladoPorNome: "Administrador",
  motivoCancelamento: "Lançamento em duplicidade",
};

describe("exportação da ficha da compra", () => {
  it("PDF/Excel usam o resumo comercial e uma linha por animal recebido", () => {
    expect(COMPRA_DETALHE_EXPORT_SISTEMA).toBe("Fazenda Digital");
    expect(COMPRA_DETALHE_EXPORT_TITULO).toBe("Relatório de Compra");
    expect(buildCompraDetalheExportHeaders()).toEqual(["Brinco", "Lote", "Peso de entrada"]);
    expect(nomeArquivoCompraDetalhe(compraConcluida, "pdf")).toBe("Compra-2-28-09-2026.pdf");
    expect(nomeAbaExcelCompraDetalhe(2)).toBe("Compra 2");
    expect(rotuloBrincoCompraDetalhe({ animalId: 99, brincoVisual: "" })).toBe("#99");
    expect(semNbsp(buildCompraDetalheExportSubtitlesExcel(compraConcluida).join("\n"))).toBe(
      [
        "Compra 2 · Concluída · 28/09/2026 · Fazenda J · Casa do Fazendeiro Veterinária · R$/kg vivo",
        "2 animais · 377 kg · R$ 12,37/kg · R$ 4.664,25",
      ].join("\n"),
    );
    expect(buildCompraDetalheExportRows(compraConcluida)).toEqual([
      ["801", "Novilhos", "186 kg"],
      ["802", "—", "191 kg"],
    ]);
    expect(buildCompraDetalheExportRows(compraConcluida).some(linha => linha[0] === "Total")).toBe(false);
    expect(buildCompraDetalheExportRows(compraCancelada)).toEqual([["—", "—", "—"]]);
  });

  it("PDF organiza identificação e resumo no padrão da venda", () => {
    const blocks = buildCompraDetalhePdfReportBlocks(compraConcluida);
    const texto = semNbsp(serializarPdfReportBlocks(blocks));
    expect(blocks[0]).toMatchObject({
      type: "fields",
      items: [
        { label: "Data", value: "28/09/2026" },
        { label: "Fazenda", value: "Fazenda J" },
        { label: "Fornecedor", value: "Casa do Fazendeiro Veterinária" },
      ],
    });
    expect(texto).toContain("Animais: 2");
    expect(texto).toContain("Peso adquirido: 377 kg");
    expect(texto).toContain("R$/kg médio: R$ 12,37");
    expect(texto).toContain("Valor total: R$ 4.664,25");
    expect(texto).not.toContain("Identificados");
    expect(texto).not.toContain("Pendentes");
    expect(texto).not.toContain("GTA");
  });

  it("compra cancelada inclui o bloco de cancelamento", () => {
    const excel = buildCompraDetalheExportSubtitlesExcel(compraCancelada);
    expect(excel[2]).toContain("Administrador");
    expect(excel[2]).toContain("Lançamento em duplicidade");
    const texto = serializarPdfReportBlocks(buildCompraDetalhePdfReportBlocks(compraCancelada));
    expect(texto).toContain("Motivo: Lançamento em duplicidade");
  });
});
