export type AnimalBrincoRef = {
  id: number;
  brinco?: string | null;
  status?: string | null;
};

export function normalizeBrincoKey(brinco: string | null | undefined): string {
  return (brinco ?? "").trim().toLowerCase();
}

export function resolveEffectiveStatus(
  explicitStatus?: string | null,
  fallbackStatus?: string | null,
): string {
  const raw = (explicitStatus ?? fallbackStatus ?? "ativo").trim().toLowerCase();
  return raw || "ativo";
}

export function findActiveBrincoConflict(
  lista: AnimalBrincoRef[],
  brinco: string | null | undefined,
  options?: { excludeAnimalId?: number; effectiveStatus?: string },
): AnimalBrincoRef | null {
  const key = normalizeBrincoKey(brinco);
  if (!key) return null;

  const status = resolveEffectiveStatus(options?.effectiveStatus);
  if (status !== "ativo") return null;

  for (const animal of lista) {
    if (options?.excludeAnimalId != null && animal.id === options.excludeAnimalId) continue;
    if (resolveEffectiveStatus(animal.status) !== "ativo") continue;
    if (normalizeBrincoKey(animal.brinco) === key) return animal;
  }

  return null;
}

export function buildBrincoAtivoConflitoMessage(
  brinco: string,
  _conflito?: AnimalBrincoRef,
): string {
  const label = brinco.trim();
  return `O brinco "${label}" já está sendo usado por outro animal ativo. Para usar esse número, altere o brinco do animal atual ou inative o registro anterior.`;
}

export function validarBrincoAtivoImportacao(options: {
  brinco: string;
  statusEfetivo: string;
  brincosAtivosBanco: Set<string>;
  brincosAtivosPlanilha: Set<string>;
}): { campo: "brinco"; mensagem: string } | null {
  const { brinco, statusEfetivo, brincosAtivosBanco, brincosAtivosPlanilha } = options;
  if (resolveEffectiveStatus(statusEfetivo) !== "ativo") return null;

  const key = normalizeBrincoKey(brinco);
  if (!key) return null;

  if (brincosAtivosPlanilha.has(key)) {
    return {
      campo: "brinco",
      mensagem: `Brinco "${brinco}" duplicado entre animais ativos na planilha`,
    };
  }

  if (brincosAtivosBanco.has(key)) {
    return {
      campo: "brinco",
      mensagem: buildBrincoAtivoConflitoMessage(brinco),
    };
  }

  brincosAtivosPlanilha.add(key);
  return null;
}
