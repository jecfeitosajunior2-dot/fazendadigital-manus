/**
 * Data civil YYYY-MM-DD para coluna DATE.
 * Não usar `new Date("2026-09-23")`: em UTC-3 isso vira 22/09.
 */
export function dataCivilParaColunaDate(iso: string): string {
  const dataISO = String(iso).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) {
    throw new Error("Data civil inválida.");
  }
  return dataISO;
}
