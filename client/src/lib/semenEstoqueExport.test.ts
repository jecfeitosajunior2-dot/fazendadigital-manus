import { describe, expect, it } from "vitest";
import {
  SEMEN_ESTOQUE_EXPORT_HEADERS,
  buildSemenEstoqueExportRows,
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
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r[1])).toEqual(["28-GE", "Sem lote"]);
    expect(rows[0]?.[5]).toBe(450);
    expect(rows[1]?.[5]).toBe(800);
  });

  it("E) exporta todos os filtrados, não só a página", () => {
    const filtrados = Array.from({ length: 25 }, (_, i) => item({ partida: `P-${i + 1}` }));
    const { exportCount, pageCount } = semenEstoqueExportIgnoresPagination(filtrados, 1, 10);
    expect(pageCount).toBe(10);
    expect(exportCount).toBe(25);
    expect(buildSemenEstoqueExportRows(filtrados)).toHaveLength(25);
  });

  it("F) preserva a ordem operacional da lista filtrada", () => {
    const ordered = [
      item({ partida: "RECENTE" }),
      item({ partida: "ANTIGA" }),
    ];
    expect(buildSemenEstoqueExportRows(ordered).map(r => r[1])).toEqual(["RECENTE", "ANTIGA"]);
  });

  it("G) lista vazia não gera linhas", () => {
    expect(buildSemenEstoqueExportRows([])).toEqual([]);
    expect(semenEstoqueExportDisabled({ hasFazenda: true, loading: false, totalItems: 0 })).toBe(true);
    expect(semenEstoqueExportDisabledTitle({ hasFazenda: true, totalItems: 0 })).toBe(
      "Nenhum dado para exportar.",
    );
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
});
