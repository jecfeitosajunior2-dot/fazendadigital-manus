import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  buildExportSpreadsheetBuffer,
  buildExportSpreadsheetWorkbook,
} from "../shared/buildExportSpreadsheet";
import { exportDataColRange, exportColLetter } from "../shared/patchXlsxIgnoredErrors";

describe("patchXlsxIgnoredErrors", () => {
  it("converte índice de coluna para letra", () => {
    expect(exportColLetter(0)).toBe("A");
    expect(exportColLetter(1)).toBe("B");
    expect(exportColLetter(25)).toBe("Z");
    expect(exportColLetter(26)).toBe("AA");
  });

  it("monta intervalo de dados sem incluir cabeçalho", () => {
    expect(exportDataColRange(0, 3)).toBe("A2:A4");
  });
});

describe("buildExportSpreadsheetBuffer", () => {
  it("inclui ignoredErrors para colunas texto (brinco/RFID)", async () => {
    const headers = ["Brinco", "Nº RFID", "Dias"];
    const rows = [
      ["01", "0002", 506],
      ["07", "", 186],
    ];

    const buffer = await buildExportSpreadsheetBuffer(headers, rows, {
      textColIndexes: [0, 1],
      integerColIndexes: [2],
    });

    const zip = await JSZip.loadAsync(buffer);
    const sheetPath = Object.keys(zip.files).find(p => /^xl\/worksheets\/sheet1\.xml$/i.test(p));
    expect(sheetPath).toBeTruthy();
    const xml = await zip.file(sheetPath!)!.async("string");
    expect(xml).toContain("<ignoredErrors>");
    expect(xml).toContain('sqref="A2:A3"');
    expect(xml).toContain('sqref="B2:B3"');
    expect(xml).toContain('numberStoredAsText="1"');
  });

  it("preserva brinco com zero à esquerda e dias como número", async () => {
    const wb = await buildExportSpreadsheetWorkbook(
      ["Brinco", "Dias"],
      [["01", 506]],
      { textColIndexes: [0], integerColIndexes: [1] },
    );
    const ws = wb.getWorksheet("Dados")!;
    expect(ws.getCell("A2").value).toBe("01");
    expect(ws.getCell("A2").numFmt).toBe("@");
    expect(ws.getCell("B2").value).toBe(506);
    expect(ws.getCell("B2").numFmt).toBe("0");
  });
});
