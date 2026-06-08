import { toast } from "sonner";

export type ExportRow = (string | number | null | undefined)[];

function escapeCell(value: unknown): string {
  // Numbers are exported without quotes so Excel treats them as numeric values
  // regardless of the system locale (avoids "150,00" being read as 150000 in US locale)
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function exportListSpreadsheet(
  headers: string[],
  rows: ExportRow[],
  filename: string
) {
  if (rows.length === 0) {
    toast.error("Nenhum dado para exportar");
    return;
  }
  const lines = rows.map(r => r.map(escapeCell).join(";"));
  const csv = `\uFEFF${[headers.join(";"), ...lines].join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("Planilha exportada!");
}

export function exportListPdf(
  title: string,
  headers: string[],
  rows: ExportRow[],
  options?: { alignRightFrom?: number }
) {
  if (rows.length === 0) {
    toast.error("Nenhum dado para exportar");
    return;
  }
  const alignRightFrom = options?.alignRightFrom ?? headers.length;
  const head = headers
    .map((h, i) =>
      `<th style="text-align:${i >= alignRightFrom ? "right" : "left"}">${h}</th>`
    )
    .join("");
  const body = rows
    .map(r =>
      `<tr>${r
        .map((cell, i) =>
          `<td style="text-align:${i >= alignRightFrom ? "right" : "left"}">${String(cell ?? "")}</td>`
        )
        .join("")}</tr>`
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px}h1{font-size:18px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:8px}
    th{background:#f5f5f5}</style></head><body>
    <h1>${title}</h1>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Permita pop-ups para exportar PDF");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}
