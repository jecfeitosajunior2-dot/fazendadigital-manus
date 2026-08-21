export type AnimalBrincoRef = {
  id: number;
  brinco?: string | null;
  status?: string | null;
  fazendaId?: number | null;
  loteId?: number | null;
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
  options?: {
    excludeAnimalId?: number;
    effectiveStatus?: string;
    /** Quando informado, só considera animais da mesma fazenda. */
    fazendaId?: number;
    /** Mapa lote → fazenda (mesma regra do rebanho). */
    loteFazendaById?: Map<number, number | null>;
  },
): AnimalBrincoRef | null {
  const key = normalizeBrincoKey(brinco);
  if (!key) return null;

  const status = resolveEffectiveStatus(options?.effectiveStatus);
  if (status !== "ativo") return null;

  const fazendaId = options?.fazendaId;
  const loteFazendaById = options?.loteFazendaById;

  for (const animal of lista) {
    if (options?.excludeAnimalId != null && animal.id === options.excludeAnimalId) continue;
    if (resolveEffectiveStatus(animal.status) !== "ativo") continue;
    if (fazendaId != null) {
      const mesmaFazendaDireta =
        animal.fazendaId != null && Number(animal.fazendaId) === Number(fazendaId);
      const mesmaFazendaLote =
        !mesmaFazendaDireta &&
        animal.loteId != null &&
        loteFazendaById != null &&
        loteFazendaById.get(Number(animal.loteId)) === Number(fazendaId);
      if (!mesmaFazendaDireta && !mesmaFazendaLote) continue;
    }
    if (normalizeBrincoKey(animal.brinco) === key) return animal;
  }

  return null;
}

export function buildBrincoAtivoConflitoMessage(
  brinco: string,
  _conflito?: AnimalBrincoRef,
): string {
  const label = brinco.trim();
  return `Já existe um animal ativo com o brinco visual ${label} nesta fazenda.`;
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
