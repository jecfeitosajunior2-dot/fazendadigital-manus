/**
 * Resolução do animal principal em `reproducao.create`.
 *
 * A coluna persistida `femeaId` guarda o animal alvo do registro (legacy name).
 * O contrato tRPC aceita `animalId` (preferencial) com fallback em `femeaId` (legado).
 */
export function resolveReproducaoAnimalId(input: {
  animalId?: number;
  femeaId?: number;
}): number | null {
  const id = input.animalId ?? input.femeaId;
  if (id == null || !Number.isFinite(id)) return null;
  return id;
}

/** `machoId` na persistência: reprodutor em eventos femininos; animal principal em eventos masculinos. */
export function resolveReproducaoMachoIdPersistido(
  animalPrincipalSexo: string | null | undefined,
  animalId: number,
  machoIdInput?: number | null,
): number | undefined {
  if (animalPrincipalSexo === "macho") return animalId;
  return machoIdInput ?? undefined;
}

/** Cobertura realizada com seleção de matrizes — evento do reprodutor (macho principal). */
export function isCoberturaRealizadaMacho(
  tipo: string,
  animalPrincipalSexo: string | null | undefined,
): boolean {
  return tipo.trim() === "Cobertura realizada" && animalPrincipalSexo === "macho";
}
