/**
 * Utilitários de data sem regressão de timezone (UTC-3 Brasil).
 *
 * O problema: `new Date("2026-06-03")` interpreta a string como UTC meia-noite.
 * Em UTC-3 isso vira 02/06 às 21h, exibindo o dia anterior.
 *
 * Solução: parsear strings "YYYY-MM-DD" manualmente, sem passar pelo construtor Date.
 */

/**
 * Formata um valor de data para "DD/MM/YYYY" sem regressão de timezone.
 * Aceita string "YYYY-MM-DD", objeto Date ou qualquer valor com toString().
 * Retorna "—" para valores nulos/inválidos.
 */
export function formatDateBR(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";

  // Se for Date nativo, converter para ISO e extrair a parte da data
  const str =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value).trim();

  // Parse manual de "YYYY-MM-DD" ou "YYYY-MM-DDThh:mm:ss..."
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${d}/${m}/${y}`;
  }

  // Fallback para outros formatos (ex: timestamps numéricos)
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

/**
 * Converte um valor de data para objeto Date sem regressão de timezone.
 * Strings "YYYY-MM-DD" são tratadas como data local (não UTC).
 */
export function parseLocalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value;

  const str = String(value).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Formata Date local como "YYYY-MM-DD" sem deslocamento UTC. */
export function toLocalDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Retorna o 1º e o último dia do mês de referência (YYYY-MM-DD, horário local). */
export function periodoMesAtual(reference = new Date()) {
  const de = toLocalDateISO(new Date(reference.getFullYear(), reference.getMonth(), 1));
  const ate = toLocalDateISO(new Date(reference.getFullYear(), reference.getMonth() + 1, 0));
  return { de, ate };
}
