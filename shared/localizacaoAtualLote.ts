import { isEntradaPastoFutura, normalizarDataISO } from "./entradaPastoDisplay";

export type MovimentacaoPastoLoteRef = {
  pastoDestinoId?: number | null;
  dataEntrada: string;
  dataSaida?: string | null;
};

export type LocalizacaoAtualLote = {
  pastoId: number | null;
  dataEntradaPasto: string | null;
};

export function isEntradaPastoVigente(
  dataEntrada: string | null | undefined,
  hojeISO: string,
): boolean {
  const entrada = normalizarDataISO(dataEntrada ?? null);
  if (!entrada) return false;
  return !isEntradaPastoFutura(entrada, hojeISO);
}

/** Movimentação visível no histórico — ignora entradas futuras (legado). */
export function movimentacaoExibivelHistorico(
  row: { dataEntrada: string; dataSaida?: string | null },
  hojeISO: string,
): boolean {
  return isEntradaPastoVigente(row.dataEntrada, hojeISO);
}

/**
 * Onde o lote está hoje no mapa operacional.
 * Prioriza movimentação aberta com entrada <= hoje; senão campos do lote se vigentes.
 */
export function resolverLocalizacaoAtualLote(
  lote: { pastoAtualId?: number | null; dataEntradaPasto?: string | null },
  movimentacoes: MovimentacaoPastoLoteRef[],
  hojeISO: string,
): LocalizacaoAtualLote {
  const abertasVigentes = movimentacoes
    .filter(
      m =>
        m.dataSaida == null
        && m.pastoDestinoId != null
        && isEntradaPastoVigente(m.dataEntrada, hojeISO),
    )
    .sort((a, b) => b.dataEntrada.localeCompare(a.dataEntrada));

  if (abertasVigentes.length > 0) {
    const mov = abertasVigentes[0];
    return {
      pastoId: Number(mov.pastoDestinoId),
      dataEntradaPasto: normalizarDataISO(mov.dataEntrada),
    };
  }

  if (
    lote.pastoAtualId != null
    && isEntradaPastoVigente(lote.dataEntradaPasto, hojeISO)
  ) {
    return {
      pastoId: Number(lote.pastoAtualId),
      dataEntradaPasto: normalizarDataISO(lote.dataEntradaPasto ?? null),
    };
  }

  return { pastoId: null, dataEntradaPasto: null };
}

export function agruparLotesPorLocalizacaoVigente<
  T extends { id: number; pastoAtualId?: number | null; dataEntradaPasto?: string | null },
>(
  lotes: T[],
  movimentacoesPorLote: Map<number, MovimentacaoPastoLoteRef[]>,
  hojeISO: string,
): {
  porPasto: Map<number, T[]>;
  semSubdivisao: T[];
  localizacaoPorLoteId: Map<number, LocalizacaoAtualLote>;
} {
  const porPasto = new Map<number, T[]>();
  const semSubdivisao: T[] = [];
  const localizacaoPorLoteId = new Map<number, LocalizacaoAtualLote>();

  for (const lote of lotes) {
    const loc = resolverLocalizacaoAtualLote(
      lote,
      movimentacoesPorLote.get(lote.id) ?? [],
      hojeISO,
    );
    localizacaoPorLoteId.set(lote.id, loc);
    if (loc.pastoId != null) {
      const arr = porPasto.get(loc.pastoId) ?? [];
      arr.push(lote);
      porPasto.set(loc.pastoId, arr);
    } else {
      semSubdivisao.push(lote);
    }
  }

  return { porPasto, semSubdivisao, localizacaoPorLoteId };
}
