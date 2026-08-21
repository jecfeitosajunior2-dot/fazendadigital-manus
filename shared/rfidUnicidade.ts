/**
 * Unicidade definitiva de RFID eletrônico.
 * RFID é string (nunca Number/parseInt/parseFloat).
 * Não reutilizável: qualquer outro animal (ativo ou inativo) com o mesmo RFID bloqueia.
 */

export type AnimalRfidRef = {
  id: number;
  brincoEletronico?: string | null;
  status?: string | null;
};

/** Comparação exata como string após trim (sem coerção numérica). */
export function normalizeRfidKey(rfid: string | null | undefined): string {
  return (rfid ?? "").trim();
}

export function findRfidConflict(
  lista: AnimalRfidRef[],
  rfid: string | null | undefined,
  options?: { excludeAnimalId?: number },
): AnimalRfidRef | null {
  const key = normalizeRfidKey(rfid);
  if (!key) return null;

  for (const animal of lista) {
    if (options?.excludeAnimalId != null && animal.id === options.excludeAnimalId) continue;
    if (normalizeRfidKey(animal.brincoEletronico) === key) return animal;
  }
  return null;
}

export function buildRfidConflitoMessage(conflito?: AnimalRfidRef | null): string {
  const status = (conflito?.status ?? "").trim().toLowerCase();
  if (status === "ativo") {
    return "Este RFID já está vinculado a outro animal ativo nesta fazenda.";
  }
  return "Este RFID já foi vinculado a outro animal e não pode ser reutilizado.";
}
