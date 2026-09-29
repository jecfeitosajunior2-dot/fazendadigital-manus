/**
 * Unicidade de RFID eletrônico de manejo — mesma ideia do brinco visual.
 * RFID é string (nunca Number/parseInt/parseFloat).
 * Reaproveitável: só animal ativo ocupa o chip. Morto/vendido/inativo libera.
 * SISBOV continua em campo separado e não entra nesta regra.
 */

import { resolveEffectiveStatus } from "./brincoAtivo";

export type AnimalRfidRef = {
  id: number;
  brincoEletronico?: string | null;
  status?: string | null;
};

export const MSG_RFID_ATIVO_CONFLITO =
  "Este RFID já está vinculado a outro animal ativo nesta fazenda.";

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
    if (resolveEffectiveStatus(animal.status) !== "ativo") continue;
    if (normalizeRfidKey(animal.brincoEletronico) === key) return animal;
  }
  return null;
}

export function buildRfidConflitoMessage(_conflito?: AnimalRfidRef | null): string {
  return MSG_RFID_ATIVO_CONFLITO;
}

/** Entre vários donos do mesmo chip, o vivo vem primeiro. Sem vivo, devolve o histórico. */
export function escolherAnimalPorRfid<T extends AnimalRfidRef>(
  lista: readonly T[],
  rfid: string | null | undefined,
): T | null {
  const key = normalizeRfidKey(rfid);
  if (!key) return null;

  let historico: T | null = null;
  for (const animal of lista) {
    if (normalizeRfidKey(animal.brincoEletronico) !== key) continue;
    if (resolveEffectiveStatus(animal.status) === "ativo") return animal;
    if (!historico) historico = animal;
  }
  return historico;
}

export function rfidOcupadoPorOutroAtivo(
  linked: AnimalRfidRef | null | undefined,
  options?: { excludeAnimalId?: number },
): boolean {
  if (!linked) return false;
  if (options?.excludeAnimalId != null && Number(linked.id) === Number(options.excludeAnimalId)) {
    return false;
  }
  return resolveEffectiveStatus(linked.status) === "ativo";
}
