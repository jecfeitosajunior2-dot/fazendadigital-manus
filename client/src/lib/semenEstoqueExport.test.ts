import { describe, expect, it } from "vitest";
import {
  SEMEN_ESTOQUE_EXPORT_COLUMN_ALIGNS,
  SEMEN_ESTOQUE_EXPORT_HEADERS,
  SEMEN_ESTOQUE_EXPORT_TOTAIS_LABEL,
  SEMEN_ESTOQUE_PDF_COLUMN_ALIGNS,
  SEMEN_ESTOQUE_TITULO,
  buildSemenEstoqueExportFooterRow,
  buildSemenEstoqueExportRows,
  isSemenEstoqueExportTotaisRow,
  semenEstoqueExportDisabled,
  semenEstoqueExportDisabledTitle,
  semenEstoqueExportFilenameBase,
  semenEstoqueExportIgnoresPagination,
  type SemenEstoqueExportItem,
} from "./semenEstoqueExport";

function item(partial: Partial<SemenEstoqueExportItem> & Pick<SemenEstoqueExportItem, "partida">): SemenEstoqueExportItem {
  return {
    reprodutorDisplay: partial.reprodutorDisplay ?? partial.partida,
    partida: partial.partida,
    centralOrigem: partial.centralOrigem ?? "GE",
    saldoDoses: partial.saldoDoses ?? 3,
    custoUnitario: partial.custoUnitario ?? "150.00",
    statusLabel: partial.statusLabel ?? "Disponível",
    valorAtualEstoque: partial.valorAtualEstoque,
  };
}

describe("buildSemenEstoqueExportRows", () => {
  it("D) exporta somente o conjunto filtrado recebido", () => {
    const disponiveis = [
      item({ partida: "28-GE", saldoDoses: 3, custoUnitario: "150.00" }),
      item({ partida: "Sem lote", reprodutorDisplay: "GSC-7117", saldoDoses: 4, custoUnitario: "200.00" }),
    ];
    const rows = buildSemenEstoqueExportRows(disponiveis);
    const dataRows = rows.filter(r => !isSemenEstoqueExportTotaisRow(r));
    expect(dataRows).toHaveLength(2);
    expect(dataRows.map(r => r[1])).toEqual(["28-GE", "Sem lote"]);
    expect(dataRows[0]?.[5]).toBe(450);
    expect(dataRows[1]?.[5]).toBe(800);
    expect(rows.at(-1)?.[0]).toBe(SEMEN_ESTOQUE_EXPORT_TOTAIS_LABEL);
    expect(rows.at(-1)?.[5]).toBe(1250);
  });

  it("E) exporta todos os filtrados, não só a página", () => {
    const filtrados = Array.from({ length: 25 }, (_, i) => item({ partida: `P-${i + 1}` }));
    const { exportCount, pageCount } = semenEstoqueExportIgnoresPagination(filtrados, 1, 10);
    expect(pageCount).toBe(10);
    expect(exportCount).toBe(25);
    expect(buildSemenEstoqueExportRows(filtrados).filter(r => !isSemenEstoqueExportTotaisRow(r))).toHaveLength(25);
  });

  it("F) preserva a ordem operacional da lista filtrada", () => {
    const ordered = [
      item({ partida: "RECENTE" }),
      item({ partida: "ANTIGA" }),
    ];
    expect(
      buildSemenEstoqueExportRows(ordered)
        .filter(r => !isSemenEstoqueExportTotaisRow(r))
        .map(r => r[1]),
    ).toEqual(["RECENTE", "ANTIGA"]);
  });

  it("G) lista vazia não gera linhas", () => {
    expect(buildSemenEstoqueExportRows([])).toEqual([]);
    expect(semenEstoqueExportDisabled({ hasFazenda: true, loading: false, totalItems: 0 })).toBe(true);
    expect(semenEstoqueExportDisabledTitle({ hasFazenda: true, totalItems: 0 })).toBe(
      "Nenhum dado para exportar.",
    );
  });

  it("título da tela e da exportação usa Sêmen com S maiúsculo", () => {
    expect(SEMEN_ESTOQUE_TITULO).toBe("Estoque de Sêmen");
    expect(SEMEN_ESTOQUE_TITULO).not.toBe("Estoque de sêmen");
  });

  it("usa os cabeçalhos da tela gerencial", () => {
    expect([...SEMEN_ESTOQUE_EXPORT_HEADERS]).toEqual([
      "Reprodutor",
      "Partida",
      "Central",
      "Saldo",
      "Custo por dose",
      "Valor em estoque",
      "Status",
    ]);
    expect([...SEMEN_ESTOQUE_EXPORT_COLUMN_ALIGNS]).toEqual(
      SEMEN_ESTOQUE_EXPORT_HEADERS.map(() => "center"),
    );
    expect([...SEMEN_ESTOQUE_PDF_COLUMN_ALIGNS]).toEqual(
      SEMEN_ESTOQUE_EXPORT_HEADERS.map(() => "center"),
    );
  });

  it("rodapé soma o valor total em estoque do conjunto filtrado", () => {
    const items = [
      item({ partida: "A", saldoDoses: 6, custoUnitario: "100.00", valorAtualEstoque: 600 }),
      item({ partida: "B", saldoDoses: 4, custoUnitario: "200.00", valorAtualEstoque: 800 }),
    ];
    const footer = buildSemenEstoqueExportFooterRow(items);
    expect(footer[0]).toBe("Valor total em estoque");
    expect(footer[5]).toBe(1400);
    expect(isSemenEstoqueExportTotaisRow(footer)).toBe(true);
    expect(buildSemenEstoqueExportRows([])).toEqual([]);
  });

  it("nome do arquivo inclui a fazenda", () => {
    expect(semenEstoqueExportFilenameBase("Fazenda J")).toBe("estoque-semen-fazenda-j");
  });

  it("valor em estoque usa o consolidado atual, não saldo × custo visual", () => {
    const rows = buildSemenEstoqueExportRows([
      item({
        partida: "P-10FAZ",
        saldoDoses: 3,
        custoUnitario: "83.33",
        valorAtualEstoque: 250,
      }),
    ]);
    expect(rows[0]?.[4]).toBe(83.33);
    expect(rows[0]?.[5]).toBe(250);
    expect(rows[0]?.[5]).not.toBe(249.99);
  });

  it("saldo zero exporta valor 0 e mantém custo/dose", () => {
    const rows = buildSemenEstoqueExportRows([
      item({ partida: "ESG", saldoDoses: 0, custoUnitario: "100.00", statusLabel: "Esgotado" }),
    ]);
    expect(rows[0]?.[3]).toBe(0);
    expect(rows[0]?.[4]).toBe(100);
    expect(rows[0]?.[5]).toBe(0);
  });

  it("gera a planilha com reprodutor centralizado e valor total no rodapé", async () => {
    const { buildExportSpreadsheetWorkbook } = await import("@shared/buildExportSpreadsheet");
    const items = [
      item({
        partida: "P-10FAZ",
        reprodutorDisplay: "P-10 FAZENDA",
        saldoDoses: 6,
        custoUnitario: "100.00",
        valorAtualEstoque: 600,
      }),
      item({
        partida: "GSC-71170",
        reprodutorDisplay: "GSC-71170",
        saldoDoses: 4,
        custoUnitario: "200.00",
        valorAtualEstoque: 800,
      }),
    ];
    const rows = buildSemenEstoqueExportRows(items);
    const wb = await buildExportSpreadsheetWorkbook(
      [...SEMEN_ESTOQUE_EXPORT_HEADERS],
      rows,
      {
        reportTitle: `Fazenda J — ${SEMEN_ESTOQUE_TITULO}`,
        blankAfterMeta: false,
        autoFilter: false,
        plainHeader: true,
        footerRowCount: 1,
        sheetName: SEMEN_ESTOQUE_TITULO,
        columnAligns: [...SEMEN_ESTOQUE_EXPORT_COLUMN_ALIGNS],
      },
    );
    const ws = wb.getWorksheet(SEMEN_ESTOQUE_TITULO)!;
    expect(ws.getCell("A3").value).toBe("P-10 FAZENDA");
    expect(ws.getCell("A3").alignment?.horizontal).toBe("center");
    expect(ws.getCell("A4").alignment?.horizontal).toBe("center");
    expect(ws.getCell("A5").value).toBe(SEMEN_ESTOQUE_EXPORT_TOTAIS_LABEL);
    expect(ws.getCell("F5").value).toBe(1400);
  });
});
