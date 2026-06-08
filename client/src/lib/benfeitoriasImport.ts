import * as XLSX from "xlsx";

export const BENFEITORIAS_TEMPLATE_HEADERS = [
  "Benfeitoria",
  "Fazenda",
  "Ano de Construção",
  "Vida Útil",
  "Valor(R$)",
] as const;

export const BENFEITORIAS_TEMPLATE_EXAMPLE = [
  "Galpão de Máquinas",
  "Fazenda Volta Grande",
  2020,
  15,
  "150.000,00",
];

export type BenfeitoriaImportRow = {
  line: number;
  nome: string;
  fazendaNome: string;
  fazendaId: number | null;
  anoConstrucao: number | null;
  vidaUtil: string;
  valorEstimado: string;
  valid: boolean;
  errors: string[];
};

function normHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseValorImport(val: unknown): string {
  if (val == null || val === "") return "";
  if (typeof val === "number" && !Number.isNaN(val)) return val.toFixed(2);
  const v = String(val).trim();
  if (!v) return "";
  if (v.includes(",")) {
    const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
    return Number.isNaN(n) ? "" : n.toFixed(2);
  }
  const n = parseFloat(v);
  return Number.isNaN(n) ? "" : n.toFixed(2);
}

function sheetToMatrix(file: ArrayBuffer): string[][] {
  const wb = XLSX.read(file, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  return rows.map(r => (Array.isArray(r) ? r : []).map(c => String(c ?? "").trim()));
}

function parseCsvText(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  return lines.map(line => {
    const sep = line.includes(";") ? ";" : ",";
    return line.split(sep).map(c => c.replace(/^"|"$/g, "").trim());
  });
}

function findHeaderIndex(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const n = normHeader(h);
    if (n.includes("benfeitoria") || n === "nome") map.nome = i;
    else if (n === "fazenda") map.fazenda = i;
    else if (n.includes("ano")) map.ano = i;
    else if (n.includes("vida")) map.vida = i;
    else if (n.includes("valor")) map.valor = i;
  });
  return map;
}

export function downloadBenfeitoriasTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    [...BENFEITORIAS_TEMPLATE_HEADERS],
    [...BENFEITORIAS_TEMPLATE_EXAMPLE],
  ]);
  ws["!cols"] = [{ wch: 28 }, { wch: 24 }, { wch: 18 }, { wch: 12 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Benfeitorias");
  XLSX.writeFile(wb, "Modelo Importação (Benfeitorias).xlsx");
}

export function parseBenfeitoriasFile(
  buffer: ArrayBuffer,
  fazendas: { id: number; nome: string }[],
  isCsv = false
): BenfeitoriaImportRow[] {
  const matrix = isCsv
    ? parseCsvText(new TextDecoder("utf-8").decode(buffer))
    : sheetToMatrix(buffer);

  if (matrix.length < 2) return [];

  const headerRowIdx = matrix.findIndex(row =>
    row.some(c => normHeader(c).includes("benfeitoria") || normHeader(c) === "fazenda")
  );
  if (headerRowIdx < 0) return [];

  const idx = findHeaderIndex(matrix[headerRowIdx]);
  if (idx.nome == null || idx.fazenda == null || idx.ano == null) return [];

  const fazendaMap = new Map(
    fazendas.map(f => [normHeader(f.nome), f.id])
  );

  const rows: BenfeitoriaImportRow[] = [];

  for (let i = headerRowIdx + 1; i < matrix.length; i++) {
    const row = matrix[i];
    const nome = String(row[idx.nome] ?? "").trim();
    const fazendaNome = String(row[idx.fazenda] ?? "").trim();
    const anoRaw = String(row[idx.ano] ?? "").trim();
    const vidaUtil = idx.vida != null ? String(row[idx.vida] ?? "").trim() : "";
    const valorEstimado = idx.valor != null ? parseValorImport(row[idx.valor]) : "";

    if (!nome && !fazendaNome && !anoRaw) continue;

    const errors: string[] = [];
    if (!nome) errors.push("Benfeitoria obrigatória");
    if (!fazendaNome) errors.push("Fazenda obrigatória");

    const fazendaId = fazendaMap.get(normHeader(fazendaNome)) ?? null;
    if (fazendaNome && fazendaId == null) errors.push(`Fazenda "${fazendaNome}" não encontrada`);

    const ano = anoRaw ? parseInt(anoRaw.replace(/\D/g, ""), 10) : NaN;
    if (!anoRaw || Number.isNaN(ano)) errors.push("Ano de construção inválido");

    rows.push({
      line: i + 1,
      nome,
      fazendaNome,
      fazendaId,
      anoConstrucao: Number.isNaN(ano) ? null : ano,
      vidaUtil,
      valorEstimado,
      valid: errors.length === 0,
      errors,
    });
  }

  return rows;
}
