/**
 * Mensagens e tipos do fluxo de exclusão/inativação de Lote.
 * `LOTE_EXCLUSAO_PODE_REMOVER_ANIMAIS` deve refletir se a UI oferece retirar animal do Lote.
 */
export const LOTE_EXCLUSAO_PODE_REMOVER_ANIMAIS = false;

export type LoteExclusaoSituacao =
  | "bloqueado_animais"
  | "pode_excluir";

export type AvaliacaoExclusaoLote = {
  situacao: LoteExclusaoSituacao;
  loteId: number;
  nomeLote: string;
  fazendaId: number | null;
  fazendaNome: string | null;
  qtdAnimais: number;
};

export function mensagemExclusaoLoteBloqueada(nomeLote: string, qtdAnimais: number): string {
  const nome = nomeLote.trim() || "—";
  if (LOTE_EXCLUSAO_PODE_REMOVER_ANIMAIS) {
    if (qtdAnimais === 1) {
      return `O Lote "${nome}" possui 1 animal vinculado. Transfira ou remova esse animal antes de excluir o Lote.`;
    }
    return `O Lote "${nome}" possui ${qtdAnimais} animais vinculados. Transfira ou remova esses animais antes de excluir o Lote.`;
  }
  if (qtdAnimais === 1) {
    return `O Lote "${nome}" possui 1 animal vinculado. Transfira esse animal para outro Lote antes de excluir o Lote.`;
  }
  return `O Lote "${nome}" possui ${qtdAnimais} animais vinculados. Transfira esses animais para outro Lote antes de excluir o Lote.`;
}

export function mensagemLotePossuiHistorico(): string {
  return "O Lote possui movimentações registradas e não pode ser excluído. Você pode inativá-lo para impedir novos vínculos sem perder o histórico.";
}

export function mensagemExclusaoLoteSucesso(nomeLote: string): string {
  return `O Lote "${nomeLote.trim() || "—"}" foi excluído com sucesso.`;
}

export function mensagemInativacaoLoteSucesso(nomeLote: string): string {
  return `O Lote "${nomeLote.trim() || "—"}" foi inativado com sucesso.`;
}

export function parseExclusaoLoteBloqueada(
  message: string,
): { nomeLote: string; qtdAnimais: number } | null {
  const match = message.match(/O [Ll]ote "(.+)" possui (\d+) animal/);
  if (!match) return null;
  return { nomeLote: match[1], qtdAnimais: Number(match[2]) };
}

export function isMensagemLotePossuiHistorico(message: string): boolean {
  return message.includes("movimentações registradas") && message.includes("não pode ser excluído");
}

export function editarLoteAnimaisUrl(loteId: number, fazendaId?: number | null): string {
  const qs = new URLSearchParams({ id: String(loteId) });
  if (fazendaId != null && fazendaId > 0) {
    qs.set("fazendaId", String(fazendaId));
  }
  return `/rebanho/editar-lote?${qs.toString()}#animais-do-lote`;
}

export function textoConfirmacaoExclusaoLote(nomeLote: string, fazendaNome?: string | null): string {
  const nome = nomeLote.trim() || "—";
  const fazenda = (fazendaNome ?? "").trim();
  if (fazenda) {
    return `Tem certeza que deseja excluir o Lote "${nome}", da ${fazenda}?`;
  }
  return `Tem certeza que deseja excluir o Lote "${nome}"?`;
}

/** Texto completo do diálogo de confirmação (useConfirm / AlertDialog). */
export function descricaoConfirmacaoExclusaoLote(nomeLote: string, fazendaNome?: string | null): string {
  return `${textoConfirmacaoExclusaoLote(nomeLote, fazendaNome)}\n\nEsta ação não poderá ser desfeita.`;
}
