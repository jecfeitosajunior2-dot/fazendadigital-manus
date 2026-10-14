/**
 * Relógio civil vindo do MySQL (CAST AS CHAR / DATE_FORMAT).
 * Formato: YYYY-MM-DD HH:mm:ss
 *
 * Não usar `new Date` / toISOString / toLocale*: em UTC-3 isso
 * desloca o horário (19:25 vira 16:25).
 */

const RELÓGIO_CIVIL =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/;

export function formatRelogioCivilEstorno(civil: string | null | undefined): string {
  if (civil == null) return "—";
  const trimmed = String(civil).trim();
  if (!trimmed) return "—";
  const m = trimmed.match(RELÓGIO_CIVIL);
  if (!m) return "—";
  const [, y, mo, d, h, min] = m;
  if (h == null || min == null) return `${d}/${mo}/${y}`;
  return `${d}/${mo}/${y} às ${h}:${min}`;
}
