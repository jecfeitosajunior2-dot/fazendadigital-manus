import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { EXPORT_HEADERS, EXPORT_VALOR_COL_INDEX } from "../shared/importacaoBenfeitorias";
import { montarLinhaExportacaoBenfeitoria, montarLinhaPdfBenfeitoria, BENFEITORIA_EXPORT_COLUMN_ALIGNS, BENFEITORIA_EXPORT_COLUMN_NUM_FMTS, BENFEITORIA_EXPORT_INTEGER_COL_INDEXES, BENFEITORIA_EXPORT_VIDA_UTIL_NUM_FMT, BENFEITORIA_PDF_HEADERS, formatVidaUtilListagem } from "../shared/benfeitoriaCampos";
import { buildExportSpreadsheetWorkbook, buildExportSpreadsheetBuffer } from "../shared/buildExportSpreadsheet";
import { formatMoedaBrlExcel } from "../shared/parseMoedaBr";

function parseValorDecimalBanco(val: string | number | null | undefined): number | null {
  if (val == null || val === "") return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const n = parseFloat(String(val).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function valorCellRef(rowIndex: number): string {
  const col = String.fromCharCode("A".charCodeAt(0) + EXPORT_VALOR_COL_INDEX);
  return `${col}${rowIndex + 1}`;
}

describe("Exportação de benfeitorias — planilha formatada", () => {
  const benfeitorias = [
    {
      nome: "Curral",
      tipo: "Curral",
      ano: 2025,
      estado: "Bom",
      valorBanco: "100.00",
      vidaUtil: "15",
      observacoes: "Poço artesiano",
    },
    {
      nome: "Casa",
      tipo: "Casa",
      ano: 2026,
      estado: "Ótimo",
      valorBanco: "100.00",
      vidaUtil: "25",
      observacoes: "",
    },
  ];

  const rows = benfeitorias.map(b =>
    montarLinhaExportacaoBenfeitoria(
      {
        nome: b.nome,
        tipo: b.tipo,
        anoConstrucao: b.ano,
        vidaUtil: b.vidaUtil,
        estado: b.estado,
        valorEstimado: b.valorBanco,
        observacoes: b.observacoes,
      },
      parseValorDecimalBanco,
    ),
  ) as (string | number)[][];

  async function buildSheet() {
    const wb = await buildExportSpreadsheetWorkbook(EXPORT_HEADERS, rows, {
      currencyColIndexes: [EXPORT_VALOR_COL_INDEX],
      integerColIndexes: BENFEITORIA_EXPORT_INTEGER_COL_INDEXES,
      columnNumFmts: BENFEITORIA_EXPORT_COLUMN_NUM_FMTS,
      columnAligns: BENFEITORIA_EXPORT_COLUMN_ALIGNS,
    });
    return wb.getWorksheet("Dados")!;
  }

  it("grava o valor formatado como moeda BRL legível (R$ 100,00)", async () => {
    const ws = await buildSheet();
    expect(ws.getCell(valorCellRef(1)).type).toBe(ExcelJS.ValueType.String);
    expect(ws.getCell(valorCellRef(1)).value).toBe("R$ 100,00");
    expect(ws.getCell(valorCellRef(2)).value).toBe("R$ 100,00");
    expect(String(ws.getCell(valorCellRef(1)).value)).toMatch(/^R\$ /);
  });

  it("ano de construção é exportado como número (sem aviso de texto no Excel)", async () => {
    const ws = await buildSheet();
    expect(ws.getCell("C2").type).toBe(ExcelJS.ValueType.Number);
    expect(ws.getCell("C2").value).toBe(2025);
    expect(ws.getCell("C3").value).toBe(2026);
    expect(ws.getCell("C2").numFmt).toBe("0");
  });

  it("vida útil numérica é exportada como número com sufixo anos", async () => {
    const ws = await buildSheet();
    expect(ws.getCell("D2").type).toBe(ExcelJS.ValueType.Number);
    expect(ws.getCell("D2").value).toBe(15);
    expect(ws.getCell("D2").numFmt).toBe(BENFEITORIA_EXPORT_VIDA_UTIL_NUM_FMT);
    expect(ws.getCell("D3").value).toBe(25);
  });

  it("vida útil 1 usa formato singular (1 ano) na planilha", async () => {
    const r = [
      montarLinhaExportacaoBenfeitoria(
        {
          nome: "Galinheiro",
          tipo: "Galpão",
          anoConstrucao: 2024,
          vidaUtil: "1",
          estado: "Ruim",
          valorEstimado: "15000.00",
        },
        parseValorDecimalBanco,
      ),
    ] as (string | number)[][];
    const wb = await buildExportSpreadsheetWorkbook(EXPORT_HEADERS, r, {
      currencyColIndexes: [EXPORT_VALOR_COL_INDEX],
      integerColIndexes: BENFEITORIA_EXPORT_INTEGER_COL_INDEXES,
      columnNumFmts: BENFEITORIA_EXPORT_COLUMN_NUM_FMTS,
    });
    const ws = wb.getWorksheet("Dados")!;
    expect(ws.getCell("D2").value).toBe(1);
    expect(ws.getCell("D2").numFmt).toBe('[=1]0 " ano";0 " anos"');
  });

  it("formatVidaUtilListagem: 1 ano no singular, 2+ no plural", () => {
    expect(formatVidaUtilListagem("1")).toBe("1 ano");
    expect(formatVidaUtilListagem("2")).toBe("2 anos");
    expect(formatVidaUtilListagem("10")).toBe("10 anos");
  });

  it("exporta todas as colunas incluindo Observações", () => {
    expect(EXPORT_HEADERS).toEqual([
      "Nome",
      "Tipo",
      "Ano de Construção",
      "Vida Útil",
      "Estado",
      "Valor",
      "Observações",
    ]);
    expect(rows[0]).toEqual(["Curral", "Curral", 2025, 15, "Bom", 100, "Poço artesiano"]);
  });

  it("valor alto exibe R$ 100.000,00 (não R$ 100000,000)", async () => {
    const r = [
      montarLinhaExportacaoBenfeitoria(
        {
          nome: "Galpão",
          tipo: "Galpão",
          anoConstrucao: 2020,
          vidaUtil: "20",
          estado: "Bom",
          valorEstimado: "100000.00",
        },
        parseValorDecimalBanco,
      ),
    ] as (string | number)[][];
    const wb = await buildExportSpreadsheetWorkbook(EXPORT_HEADERS, r, {
      currencyColIndexes: [EXPORT_VALOR_COL_INDEX],
      integerColIndexes: BENFEITORIA_EXPORT_INTEGER_COL_INDEXES,
      columnAligns: BENFEITORIA_EXPORT_COLUMN_ALIGNS,
    });
    const ws = wb.getWorksheet("Dados")!;
    expect(ws.getCell(valorCellRef(1)).value).toBe("R$ 100.000,00");
  });

  it("normaliza valor já em texto para R$ padronizado", async () => {
    const r = [["Item", "", "2020", "", "Bom", "100.000,00", ""]] as (string | number)[][];
    const wb = await buildExportSpreadsheetWorkbook(
      ["Nome", "Tipo", "Ano de Construção", "Vida Útil", "Estado", "Valor", "Observações"],
      r,
      { currencyColIndexes: [5] },
    );
    const ws = wb.getWorksheet("Dados")!;
    expect(ws.getCell("F2").value).toBe("R$ 100.000,00");
  });

  it("round-trip: valor permanece texto R$ 100.000,00 (não número formatado)", async () => {
    const r = [
      montarLinhaExportacaoBenfeitoria(
        {
          nome: "Galpão",
          tipo: "Galpão",
          anoConstrucao: 2020,
          vidaUtil: "20",
          estado: "Bom",
          valorEstimado: "100000.00",
        },
        parseValorDecimalBanco,
      ),
    ] as (string | number)[][];
    const buffer = await buildExportSpreadsheetBuffer(EXPORT_HEADERS, r, {
      currencyColIndexes: [EXPORT_VALOR_COL_INDEX],
      integerColIndexes: BENFEITORIA_EXPORT_INTEGER_COL_INDEXES,
      columnAligns: BENFEITORIA_EXPORT_COLUMN_ALIGNS,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet("Dados")!;
    expect(ws.getCell(valorCellRef(1)).type).toBe(ExcelJS.ValueType.String);
    expect(ws.getCell(valorCellRef(1)).value).toBe("R$ 100.000,00");
    expect(ws.getCell(valorCellRef(1)).numFmt).toBe("@");
  });

  it("aplica alinhamento centralizado em todas as colunas", async () => {
    const ws = await buildSheet();
    expect(ws.getCell("A2").alignment?.horizontal).toBe("center");
    expect(ws.getCell("C2").alignment?.horizontal).toBe("center");
    expect(ws.getCell(valorCellRef(1)).alignment?.horizontal).toBe("center");
    expect(ws.getCell("G2").alignment?.horizontal).toBe("center");
    expect(ws.getCell("A1").alignment?.horizontal).toBe("center");
    expect(ws.getCell("A1").font?.bold).toBe(true);
  });

  it("monta linha PDF com formatação igual à lista", () => {
    const linha = montarLinhaPdfBenfeitoria(
      {
        nome: "Curral",
        tipo: "Curral",
        anoConstrucao: 2025,
        vidaUtil: "15",
        estado: "Bom",
        valorEstimado: "100.00",
        observacoes: "Poço artesiano",
      },
      parseValorDecimalBanco,
    );
    expect(linha.slice(0, 5)).toEqual(["Curral", "Curral", "2025", "15 anos", "Bom"]);
    expect(linha[5].replace(/\u00A0/g, " ")).toBe("R$ 100,00");
    expect(linha).toHaveLength(6);
    expect(BENFEITORIA_PDF_HEADERS).toEqual([
      "Nome",
      "Tipo",
      "Ano de Construção",
      "Vida Útil",
      "Estado",
      "Valor",
    ]);
  });

  it("não infla outros valores realistas (1500, 150000, 99999.99)", async () => {
    const casos: Array<[string, number]> = [
      ["1500.00", 1500],
      ["150000.00", 150000],
      ["99999.99", 99999.99],
    ];
    for (const [banco, esperado] of casos) {
      const r = [
        montarLinhaExportacaoBenfeitoria(
          {
            nome: "B",
            tipo: "Galpão",
            anoConstrucao: 2020,
            vidaUtil: "10",
            estado: "Bom",
            valorEstimado: banco,
          },
          parseValorDecimalBanco,
        ),
      ] as (string | number)[][];
      const wb = await buildExportSpreadsheetWorkbook(EXPORT_HEADERS, r, {
        currencyColIndexes: [EXPORT_VALOR_COL_INDEX],
      });
      const ws = wb.getWorksheet("Dados")!;
      expect(ws.getCell(valorCellRef(1)).value).toBe(formatMoedaBrlExcel(esperado));
      expect(String(ws.getCell(valorCellRef(1)).value)).not.toMatch(/^\$/);
    }
  });
});
