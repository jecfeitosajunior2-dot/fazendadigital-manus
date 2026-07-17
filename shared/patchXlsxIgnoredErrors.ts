import JSZip from "jszip";

/** Converte índice de coluna (0 = A) para letra Excel. */
export function exportColLetter(colIndex: number): string {
  let n = colIndex + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Intervalo de células de dados.
 *  @param dataStartRow linha Excel 1-based da primeira linha de dados (padrão 2 = após cabeçalho na linha 1).
 */
export function exportDataColRange(
  colIndex: number,
  dataRowCount: number,
  dataStartRow = 2,
): string {
  const col = exportColLetter(colIndex);
  const lastRow = dataStartRow + dataRowCount - 1;
  return `${col}${dataStartRow}:${col}${lastRow}`;
}

/**
 * Remove o triângulo verde "Número armazenado como texto" do Excel
 * (ignoredErrors / numberStoredAsText no OOXML).
 */
export async function patchXlsxIgnoreNumberStoredAsText(
  buffer: ArrayBuffer,
  sqrefs: string[],
): Promise<ArrayBuffer> {
  if (sqrefs.length === 0) return buffer;

  const zip = await JSZip.loadAsync(buffer);
  const sheetPath = Object.keys(zip.files).find(p => /^xl\/worksheets\/sheet\d+\.xml$/i.test(p));
  if (!sheetPath) return buffer;

  const file = zip.file(sheetPath);
  if (!file) return buffer;

  let xml = await file.async("string");
  const errorsXml = sqrefs
    .map(ref => `<ignoredError sqref="${ref}" numberStoredAsText="1"/>`)
    .join("");

  if (xml.includes("<ignoredErrors>")) {
    xml = xml.replace(
      /<ignoredErrors>([\s\S]*?)<\/ignoredErrors>/,
      (_match, inner: string) => `<ignoredErrors>${inner}${errorsXml}</ignoredErrors>`,
    );
  } else {
    xml = xml.replace("</worksheet>", `<ignoredErrors>${errorsXml}</ignoredErrors></worksheet>`);
  }

  zip.file(sheetPath, xml);
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}
