/** Entrada bruta de movimentação lote ↔ subdivisão. */
export type LotePastoMovInput = {
  id: number;
  loteId: number;
  pastoOrigemId?: number | null;
  pastoDestinoId?: number | null;
  dataEntrada: string;
  dataSaida?: string | null;
  observacoes?: string | null;
};

/** Transferência individual de animal entre lotes. */
export type AnimalLoteMovInput = {
  id: number;
  loteOrigemId?: number | null;
  loteDestinoId: number;
  pastoOrigemId?: number | null;
  pastoDestinoId?: number | null;
  dataMovimentacao: string;
  usuarioNome?: string | null;
  observacoes?: string | null;
  loteOrigemNome?: string | null;
  loteDestinoNome?: string | null;
  fazendaOrigemId?: number | null;
  fazendaDestinoId?: number | null;
};

export type HistoricoSubdivisaoAnimalRow = {
  /** Chave estável para listas React. */
  id: string;
  sourceId: number;
  tipo: "lote_pasto" | "transferencia_lote";
  dataEntrada: string;
  dataSaida?: string | null;
  pastoOrigemId?: number | null;
  pastoDestinoId?: number | null;
  pastoOrigemNome?: string | null;
  pastoDestinoNome?: string | null;
  observacoes?: string | null;
  responsavel?: string | null;
  loteId?: number | null;
  loteOrigemId?: number | null;
  loteOrigemNome?: string | null;
  loteDestinoNome?: string | null;
  fazendaOrigemId?: number | null;
  fazendaDestinoId?: number | null;
  fazendaOrigemNome?: string | null;
  fazendaDestinoNome?: string | null;
};

type LotePeriod = {
  loteId: number;
  fromInclusive: string | null;
  toExclusive: string | null;
};

function compareDates(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Períodos em que o animal esteve em cada lote (com base nas transferências). */
export function buildLotePeriodsForAnimal(
  currentLoteId: number | null,
  transfers: AnimalLoteMovInput[],
): LotePeriod[] {
  const sorted = [...transfers].sort((a, b) =>
    compareDates(a.dataMovimentacao, b.dataMovimentacao),
  );

  if (sorted.length === 0) {
    return currentLoteId ? [{ loteId: currentLoteId, fromInclusive: null, toExclusive: null }] : [];
  }

  const periods: LotePeriod[] = [];
  const firstOrigem = sorted[0].loteOrigemId;
  if (firstOrigem != null && firstOrigem > 0) {
    periods.push({
      loteId: firstOrigem,
      fromInclusive: null,
      toExclusive: sorted[0].dataMovimentacao,
    });
  }

  for (let i = 0; i < sorted.length; i++) {
    periods.push({
      loteId: sorted[i].loteDestinoId,
      fromInclusive: sorted[i].dataMovimentacao,
      toExclusive: i + 1 < sorted.length ? sorted[i + 1].dataMovimentacao : null,
    });
  }

  return periods;
}

export function dateInLotePeriod(date: string, period: LotePeriod): boolean {
  if (period.fromInclusive && compareDates(date, period.fromInclusive) < 0) return false;
  if (period.toExclusive && compareDates(date, period.toExclusive) >= 0) return false;
  return true;
}

function resolvePastoNome(
  pastoId: number | null | undefined,
  pastoMap: Record<number, string>,
): string | null {
  if (!pastoId) return null;
  return pastoMap[pastoId] ?? null;
}

/**
 * Monta o histórico de subdivisões do animal:
 * - movimentações de subdivisão dos lotes em que esteve;
 * - trocas de lote (sempre, mesmo sem mudança de pasto).
 */
export function buildHistoricoSubdivisaoAnimal(input: {
  currentLoteId: number | null;
  transfers: AnimalLoteMovInput[];
  lotePastoMovs: LotePastoMovInput[];
  pastoMap: Record<number, string>;
  loteNomeMap?: Record<number, string>;
  fazendaNomeMap?: Record<number, string>;
}): HistoricoSubdivisaoAnimalRow[] {
  const { currentLoteId, transfers, lotePastoMovs, pastoMap, loteNomeMap = {}, fazendaNomeMap = {} } = input;
  const periods = buildLotePeriodsForAnimal(currentLoteId, transfers);
  const relevantLoteIds = new Set(periods.map(p => p.loteId));
  const rows: HistoricoSubdivisaoAnimalRow[] = [];

  for (const mov of lotePastoMovs) {
    if (!relevantLoteIds.has(mov.loteId)) continue;
    const applies = periods.some(
      p => p.loteId === mov.loteId && dateInLotePeriod(mov.dataEntrada, p),
    );
    if (!applies) continue;

    rows.push({
      id: `lote-pasto-${mov.id}`,
      sourceId: mov.id,
      tipo: "lote_pasto",
      dataEntrada: mov.dataEntrada,
      dataSaida: mov.dataSaida ?? null,
      pastoOrigemId: mov.pastoOrigemId ?? null,
      pastoDestinoId: mov.pastoDestinoId ?? null,
      pastoOrigemNome: resolvePastoNome(mov.pastoOrigemId, pastoMap),
      pastoDestinoNome: resolvePastoNome(mov.pastoDestinoId, pastoMap),
      observacoes: mov.observacoes?.trim() || null,
      responsavel: null,
      loteId: mov.loteId,
    });
  }

  for (const transfer of transfers) {
    const origemId = transfer.pastoOrigemId ?? null;
    const destinoId = transfer.pastoDestinoId ?? null;
    const loteOrigemNome =
      transfer.loteOrigemNome?.trim() ||
      (transfer.loteOrigemId != null && transfer.loteOrigemId > 0
        ? loteNomeMap[transfer.loteOrigemId] ?? null
        : null);
    const loteDestinoNome =
      transfer.loteDestinoNome?.trim() || loteNomeMap[transfer.loteDestinoId] || null;

    rows.push({
      id: `transfer-${transfer.id}`,
      sourceId: transfer.id,
      tipo: "transferencia_lote",
      dataEntrada: transfer.dataMovimentacao,
      dataSaida: null,
      pastoOrigemId: origemId,
      pastoDestinoId: destinoId,
      pastoOrigemNome: resolvePastoNome(origemId, pastoMap),
      pastoDestinoNome: resolvePastoNome(destinoId, pastoMap),
      observacoes: transfer.observacoes?.trim() || null,
      responsavel: transfer.usuarioNome?.trim() || null,
      loteId: transfer.loteDestinoId,
      loteOrigemId: transfer.loteOrigemId ?? null,
      loteOrigemNome,
      loteDestinoNome,
      fazendaOrigemId: transfer.fazendaOrigemId ?? null,
      fazendaDestinoId: transfer.fazendaDestinoId ?? null,
      fazendaOrigemNome:
        transfer.fazendaOrigemId != null ? fazendaNomeMap[transfer.fazendaOrigemId] ?? null : null,
      fazendaDestinoNome:
        transfer.fazendaDestinoId != null ? fazendaNomeMap[transfer.fazendaDestinoId] ?? null : null,
    });
  }

  rows.sort((a, b) => {
    const byDate = compareDates(b.dataEntrada, a.dataEntrada);
    if (byDate !== 0) return byDate;
    if (a.tipo === b.tipo) return b.sourceId - a.sourceId;
    return a.tipo === "transferencia_lote" ? -1 : 1;
  });

  return rows;
}
