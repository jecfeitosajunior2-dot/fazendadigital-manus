/** Exibe apenas lotes vinculados à fazenda selecionada. */
export function filtrarLotesPorFazenda<T extends { fazendaId?: number | null }>(
  lotes: T[],
  fazendaId?: number | string | null,
): T[] {
  if (!fazendaId) return lotes;
  const fid = Number(fazendaId);
  if (!Number.isFinite(fid)) return lotes;
  return lotes.filter(l => l.fazendaId != null && Number(l.fazendaId) === fid);
}
