import type { DescendenteRow } from "@shared/animalDescendentes";

export const DESCENDENTES_PREVIEW_LIMIT = 10;

export function formatDescendentesContagem(total: number): string {
  if (total === 0) return "0 filhos registrados";
  if (total === 1) return "1 filho registrado";
  return `${total} filhos registrados`;
}

export function formatDescendenteBrinco(brinco: string | null | undefined): string {
  const trimmed = brinco?.trim();
  return trimmed || "—";
}

export function formatDescendenteSexoCategoria(
  sexo: string | null | undefined,
  categoria: string | null | undefined,
): string {
  const parts: string[] = [];
  if (sexo === "macho") parts.push("Macho");
  else if (sexo === "femea") parts.push("Fêmea");
  else if (sexo?.trim()) parts.push(sexo.trim());
  if (categoria?.trim()) parts.push(categoria.trim());
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function formatDescendenteNascimento(dataNascimento: string | null | undefined): string {
  const trimmed = dataNascimento?.trim();
  return trimmed ? trimmed : "—";
}

export function sliceDescendentesPreview(
  rows: DescendenteRow[],
  showAll: boolean,
  limit: number = DESCENDENTES_PREVIEW_LIMIT,
): DescendenteRow[] {
  if (showAll || rows.length <= limit) return rows;
  return rows.slice(0, limit);
}
