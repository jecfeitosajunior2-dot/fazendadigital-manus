import type { AvaliacaoExclusaoLote } from "@shared/loteExclusaoBloqueada";

export type DeleteConfirmState = {
  loteId: number;
  nomeLote: string;
  fazendaNome: string | null;
  fazendaId?: number | null;
};

export type DeleteBlockedState = {
  loteId: number;
  nomeLote: string;
  qtdAnimais: number;
  fazendaId?: number | null;
};

export type InativarHistoricoState = {
  loteId: number;
  nomeLote: string;
  fazendaId?: number | null;
};

export function avaliacaoParaDeleteBlocked(avaliacao: AvaliacaoExclusaoLote): DeleteBlockedState {
  return {
    loteId: avaliacao.loteId,
    nomeLote: avaliacao.nomeLote,
    qtdAnimais: avaliacao.qtdAnimais,
    fazendaId: avaliacao.fazendaId,
  };
}

export function avaliacaoParaDeleteConfirm(avaliacao: AvaliacaoExclusaoLote): DeleteConfirmState {
  return {
    loteId: avaliacao.loteId,
    nomeLote: avaliacao.nomeLote,
    fazendaNome: avaliacao.fazendaNome,
    fazendaId: avaliacao.fazendaId,
  };
}

export function avaliacaoParaInativarHistorico(avaliacao: AvaliacaoExclusaoLote): InativarHistoricoState {
  return {
    loteId: avaliacao.loteId,
    nomeLote: avaliacao.nomeLote,
    fazendaId: avaliacao.fazendaId,
  };
}
