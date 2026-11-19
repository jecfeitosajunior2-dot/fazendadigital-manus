/**
 * A alocação muda o lote dentro da mesma fazenda.
 * A transferência muda o animal de uma fazenda para outra do mesmo titular.
 */

export const MSG_ALOCACAO_SO_MESMA_FAZENDA =
  "Esta tela só aloca animais dentro da mesma fazenda. Para mudar de fazenda, use Manejo → Movimentação do Animal → Transferência → Fazenda cadastrada.";

export function alocacaoPedeOutraFazenda(
  fazendaDestinoId: number | null,
  fazendasDosAnimais: Array<number | null | undefined>,
): boolean {
  if (fazendaDestinoId == null || fazendaDestinoId <= 0) return false;
  return fazendasDosAnimais.some((id) => id != null && id > 0 && id !== fazendaDestinoId);
}
