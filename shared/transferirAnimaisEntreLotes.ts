/** Mensagens humanas da transferência entre lotes (Manejo Pontual e Editar Lote). */
export const MSG_TROCA_LOTE_MESMO_LOTE =
  "O animal já pertence a este lote. Selecione outro lote de destino.";

export const MSG_TROCA_LOTE_FAZENDA =
  "O lote de destino não pertence à mesma fazenda do animal.";

export const MSG_TROCA_LOTE_DESTINO_IGUAL_ORIGEM =
  "O lote de destino deve ser diferente do lote de origem.";

export const MSG_TROCA_LOTE_DATA_FUTURA =
  "A data da movimentação não pode ser futura.";

export const MSG_TROCA_LOTE_GENERICO =
  "Não foi possível concluir a troca de lote.";

export const MSG_TROCA_LOTE_DESTINO_INATIVO =
  "O lote de destino não está ativo.";

export const MSG_TROCA_LOTE_SEM_ANIMAIS_ORIGEM =
  "Nenhum animal selecionado pertence ao lote de origem.";

export const LABEL_SEM_LOTE = "Sem lote";
export const LABEL_SEM_LOTE_ATUAL = "Sem lote atual";
export const LABEL_TROCA_LOTE = "Troca de lote";

export function hojeISODateLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function assertDataMovimentacaoNaoFutura(
  dataMovimentacao: string,
  hojeISO = hojeISODateLocal(),
): { ok: true } | { ok: false; message: string } {
  if (!dataMovimentacao.trim()) {
    return { ok: false, message: "Data da movimentação é obrigatória." };
  }
  if (dataMovimentacao > hojeISO) {
    return { ok: false, message: MSG_TROCA_LOTE_DATA_FUTURA };
  }
  return { ok: true };
}

/** True quando o destino é o lote em que o animal já está. */
export function isMesmoLoteDestino(
  loteAtualId: number | null | undefined,
  loteDestinoId: number,
): boolean {
  return loteAtualId != null && loteAtualId > 0 && loteAtualId === loteDestinoId;
}

/**
 * Bloqueia fazendas diferentes quando ambos os lados têm fazenda conhecida.
 * Sem fazenda em um dos lados, não inventa incompatibilidade.
 */
export function isLoteDestinoMesmaFazenda(
  fazendaAnimalId: number | null | undefined,
  fazendaLoteDestinoId: number | null | undefined,
): boolean {
  if (fazendaAnimalId == null || fazendaLoteDestinoId == null) return true;
  return Number(fazendaAnimalId) === Number(fazendaLoteDestinoId);
}

export function labelHistoricoOrigemLote(
  loteOrigemId: number | null | undefined,
  loteOrigemNome?: string | null,
): string {
  if (loteOrigemId == null || loteOrigemId <= 0) return LABEL_SEM_LOTE;
  return loteOrigemNome?.trim() || "Lote";
}

export function formatLoteAtualDisplay(params: {
  temLote: boolean;
  loteNome?: string | null;
  pastoNome?: string | null;
  fazendaNome?: string | null;
}): { titulo: string; subtitulo?: string } {
  if (!params.temLote) return { titulo: LABEL_SEM_LOTE_ATUAL };
  const titulo = params.loteNome?.trim() || "Lote";
  const subtitulo = [params.fazendaNome?.trim(), params.pastoNome?.trim()]
    .filter(Boolean)
    .join(" · ");
  return subtitulo ? { titulo, subtitulo } : { titulo };
}

/** Rótulo de uma opção de Lote de destino: nome do lote e pasto, se houver. */
export function labelLoteDestinoComPasto(
  loteNome?: string | null,
  pastoNome?: string | null,
): string {
  const lote = loteNome?.trim() || "Lote";
  const pasto = pastoNome?.trim();
  return pasto ? `${lote} · ${pasto}` : lote;
}

/** Lotes que o usuário pode escolher como destino na Troca de Lote. */
export function filtrarLotesDestinoTroca<
  T extends { id: number; fazendaId?: number | null; ativo?: boolean | null },
>(
  lotes: T[],
  opts: { fazendaAnimalId?: number | null; loteAtualId?: number | null },
): T[] {
  return lotes.filter(l => {
    if (l.ativo === false) return false;
    if (opts.loteAtualId != null && opts.loteAtualId > 0 && l.id === opts.loteAtualId) {
      return false;
    }
    if (opts.fazendaAnimalId != null) {
      if (l.fazendaId == null) return false;
      if (Number(l.fazendaId) !== Number(opts.fazendaAnimalId)) return false;
    }
    return true;
  });
}

export function podeSalvarTrocaLote(input: {
  fazendaId?: number | null;
  animalId?: number | null;
  dataMovimentacao?: string | null;
  loteDestinoId?: number | null;
  loteAtualId?: number | null;
}): boolean {
  if (input.fazendaId == null || input.fazendaId <= 0) return false;
  if (input.animalId == null || input.animalId <= 0) return false;
  if (!input.dataMovimentacao?.trim()) return false;
  if (!assertDataMovimentacaoNaoFutura(input.dataMovimentacao).ok) return false;
  if (input.loteDestinoId == null || input.loteDestinoId <= 0) return false;
  if (isMesmoLoteDestino(input.loteAtualId, input.loteDestinoId)) return false;
  return true;
}

export function formatLinhaMovimentacaoTrocaLote(params: {
  loteOrigemId?: number | null;
  loteOrigemNome?: string | null;
  loteDestinoNome?: string | null;
}): string {
  const origem = labelHistoricoOrigemLote(params.loteOrigemId, params.loteOrigemNome);
  const destino = params.loteDestinoNome?.trim() || "Lote";
  return `${origem} → ${destino}`;
}

export function montarTooltipTrocaLote(params: {
  loteOrigemId?: number | null;
  loteOrigemNome?: string | null;
  loteDestinoNome?: string | null;
  dataFormatada?: string | null;
  responsavel?: string | null;
  observacoes?: string | null;
}): string {
  const linhas = [
    LABEL_TROCA_LOTE,
    `Lote anterior: ${labelHistoricoOrigemLote(params.loteOrigemId, params.loteOrigemNome)}`,
    `Novo lote: ${params.loteDestinoNome?.trim() || "Lote"}`,
  ];
  if (params.dataFormatada?.trim()) linhas.push(`Data: ${params.dataFormatada.trim()}`);
  if (params.responsavel?.trim()) linhas.push(`Responsável: ${params.responsavel.trim()}`);
  if (params.observacoes?.trim()) {
    linhas.push("");
    linhas.push("Observações:");
    linhas.push(params.observacoes.trim());
  }
  return linhas.join("\n");
}

/** Linha de pasto no Histórico de lotes (ex.: "Pasto 05 → Pasto 08" ou só o destino). */
export function formatLinhaPastoHistoricoLote(params: {
  pastoOrigemNome?: string | null;
  pastoDestinoNome?: string | null;
}): string | null {
  const origem = params.pastoOrigemNome?.trim() || "";
  const destino = params.pastoDestinoNome?.trim() || "";
  if (origem && destino && origem !== destino) return `${origem} → ${destino}`;
  if (destino) return destino;
  if (origem) return origem;
  return null;
}
