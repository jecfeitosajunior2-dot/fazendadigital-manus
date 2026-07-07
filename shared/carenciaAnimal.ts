/** Linha sanitária mínima para cálculo de carência do animal. */
export type CarenciaSaudeRow = {
  animalId: number;
  medicamento?: string | null;
  dataRegistro?: string | Date | null;
  proximaData?: string | Date | null;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Normaliza referência para o dia civil local (evita regressão com ISO UTC). */
function referenceDay(refDate: Date): Date {
  return new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
}

function parseDateOnly(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return startOfDay(value);
  const str = String(value).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function registrarFimCarencia(
  map: Map<number, Date>,
  animalId: number,
  fimRaw: Date,
  hoje: Date,
): void {
  const fim = startOfDay(fimRaw);
  if (fim < hoje) return;
  const atual = map.get(animalId);
  if (!atual || fim > atual) map.set(animalId, fim);
}

/**
 * Para cada animal, retorna a maior data final de carência ainda válida (>= hoje).
 * Considera proximaData do registro e dias de carência do estoque por medicamento.
 */
export function buildFimCarenciaPorAnimal(
  saudeRows: CarenciaSaudeRow[],
  medCarenciaDias: Map<string, number>,
  refDate: Date = new Date(),
): Map<number, Date> {
  const hoje = referenceDay(refDate);
  const fimPorAnimal = new Map<number, Date>();
  const vistos = new Set<string>();

  for (const s of saudeRows) {
    const chave = `${s.animalId}-${s.medicamento ?? ""}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const med = (s.medicamento || "").toLowerCase().trim();
    const dias = medCarenciaDias.get(med);
    if (dias && dias > 0 && s.dataRegistro) {
      const base = parseDateOnly(s.dataRegistro);
      if (base) {
        const fim = new Date(base);
        fim.setDate(fim.getDate() + dias);
        registrarFimCarencia(fimPorAnimal, s.animalId, fim, hoje);
      }
    }
  }

  for (const s of saudeRows) {
    if (!s.proximaData) continue;
    const fim = parseDateOnly(s.proximaData);
    if (fim) registrarFimCarencia(fimPorAnimal, s.animalId, fim, hoje);
  }

  return fimPorAnimal;
}

export function toDateOnlyISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isEmCarencia(fimCarenciaAte: Date | string | null | undefined, refDate: Date = new Date()): boolean {
  const fim = parseDateOnly(fimCarenciaAte);
  if (!fim) return false;
  return fim >= referenceDay(refDate);
}
