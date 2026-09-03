/**
 * Exclusão de animal: só cadastro limpo.
 * Histórico operacional (pesagem, saúde, reprodução, baixa, venda…) bloqueia —
 * o caminho é Manejo → Baixa, não a lixeira.
 * Lote no cadastro e peso de entrada não contam como histórico.
 */

export const MSG_ANIMAL_EXCLUSAO_BLOQUEADA =
  "Animal com histórico não pode ser excluído. Use Manejo → Baixa para tirá-lo da operação.";

export const TOOLTIP_ANIMAL_EXCLUIR = "Excluir animal";
export const TOOLTIP_ANIMAL_EXCLUIR_BLOQUEADO = MSG_ANIMAL_EXCLUSAO_BLOQUEADA;

export type AnimalExclusaoFlags = {
  statusNaoAtivo?: boolean;
  temHistoricoOperacional?: boolean;
};

export function isAnimalExclusaoBloqueada(flags: AnimalExclusaoFlags): boolean {
  return Boolean(flags.statusNaoAtivo || flags.temHistoricoOperacional);
}

export function animalStatusNaoAtivo(status?: string | null): boolean {
  return (status ?? "ativo").trim().toLowerCase() !== "ativo";
}

/** IDs vindos de tabelas de vínculo — a união com os IDs pedidos define o bloqueio. */
export type AnimalHistoricoIdBags = {
  pesagemIds?: Iterable<number | null | undefined>;
  saudeIds?: Iterable<number | null | undefined>;
  reproducaoFemeaIds?: Iterable<number | null | undefined>;
  reproducaoMachoIds?: Iterable<number | null | undefined>;
  baixaIds?: Iterable<number | null | undefined>;
  movimentacaoLoteIds?: Iterable<number | null | undefined>;
  historicoBrincoIds?: Iterable<number | null | undefined>;
  vendaIds?: Iterable<number | null | undefined>;
  /** maeId dos filhos — o pai/mãe na lista fica bloqueado. */
  maeDeIds?: Iterable<number | null | undefined>;
  paiDeIds?: Iterable<number | null | undefined>;
  partoCriaIds?: Iterable<number | null | undefined>;
  semenMachoIds?: Iterable<number | null | undefined>;
};

export function collectBlockedAnimalIds(
  wantedIds: number[],
  bags: AnimalHistoricoIdBags,
): Set<number> {
  const wanted = new Set(wantedIds);
  const blocked = new Set<number>();
  const add = (ids?: Iterable<number | null | undefined>) => {
    if (!ids) return;
    for (const id of ids) {
      if (id != null && wanted.has(id)) blocked.add(id);
    }
  };

  add(bags.pesagemIds);
  add(bags.saudeIds);
  add(bags.reproducaoFemeaIds);
  add(bags.reproducaoMachoIds);
  add(bags.baixaIds);
  add(bags.movimentacaoLoteIds);
  add(bags.historicoBrincoIds);
  add(bags.vendaIds);
  add(bags.maeDeIds);
  add(bags.paiDeIds);
  add(bags.partoCriaIds);
  add(bags.semenMachoIds);

  return blocked;
}
