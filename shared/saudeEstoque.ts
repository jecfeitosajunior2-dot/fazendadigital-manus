export const SAUDE_STATUS_ATIVO = "ativo";
export const SAUDE_STATUS_ESTORNADO = "estornado";

export const SAUDE_MOV_TIPO = "Saída";
export const SAUDE_MOV_MANEJO = "Sanitário";

export const MOTIVO_ESTORNO_SAUDE_PADRAO = "Estorno do manejo sanitário";

export const MSG_SAUDE_NAO_ENCONTRADO = "Registro sanitário não encontrado.";
export const MSG_SAUDE_ESTORNO_DUPLO = "Este manejo sanitário já foi estornado.";
export const MSG_SAUDE_ESTORNO_LEGADO =
  "Este manejo antigo não tem vínculo oficial com o estoque. O registro permanece no histórico. O estoque e o capital não podem ser estornados automaticamente — não inventamos o valor.";
export const MSG_SAUDE_VINCULO_INVALIDO =
  "A movimentação de estoque deste manejo não confere. O estorno foi bloqueado.";
export const MSG_SAUDE_MOV_JA_ESTORNADA =
  "A movimentação de estoque deste manejo já foi estornada.";
export const MSG_ESTORNO_GENERICO_SANITARIO =
  "Esta movimentação foi gerada por um manejo sanitário e deve ser estornada pelo módulo de Manejo Sanitário.";

export type SaudeStatus = typeof SAUDE_STATUS_ATIVO | typeof SAUDE_STATUS_ESTORNADO;

export type DecisaoEstornoSaude =
  | { kind: "ja_estornado" }
  | { kind: "com_estoque"; movimentacaoId: number }
  | { kind: "legado_bloqueado" }
  | { kind: "somente_registro" };

export function saudeRegistroEstaEstornado(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() === SAUDE_STATUS_ESTORNADO;
}

export function grupoMovimentacaoSaude(saudeId: number): string {
  return `saude-${saudeId}`;
}

export function grupoEstornoSaude(saudeId: number): string {
  return `e-saude-${saudeId}`;
}

export function destinoMovimentacaoSaude(animalId: number): string {
  return `Animal #${animalId}`;
}

/** Estimativa da tela. O SAVE congela o snapshot oficial. */
export function custoEstimadoManejoSanitarioUi(custoMedio: number, doseNaUnidadeRef: number): number {
  return Math.round(doseNaUnidadeRef * custoMedio * 100) / 100;
}

/**
 * Estorno automático de estoque só com vínculo oficial.
 * Sem estoqueMovimentacaoId: não inventa movimento nem capital.
 */
export function decidirEstornoSaude(row: {
  status?: string | null;
  estoqueMovimentacaoId?: number | string | null;
  estoqueId?: number | string | null;
  quantidadeConsumo?: string | number | null;
}): DecisaoEstornoSaude {
  if (saudeRegistroEstaEstornado(row.status)) {
    return { kind: "ja_estornado" };
  }

  const movId = Number(row.estoqueMovimentacaoId);
  if (Number.isInteger(movId) && movId > 0) {
    return { kind: "com_estoque", movimentacaoId: movId };
  }

  const estoqueId = Number(row.estoqueId);
  const qtd = Number(String(row.quantidadeConsumo ?? "").replace(",", "."));
  if (Number.isInteger(estoqueId) && estoqueId > 0 && Number.isFinite(qtd) && qtd > 0) {
    return { kind: "legado_bloqueado" };
  }

  return { kind: "somente_registro" };
}

function grupoIdESanitario(grupoId: string | null | undefined): boolean {
  const g = String(grupoId ?? "").trim();
  return /^saude-\d+$/.test(g) || /^e-saude-\d+$/.test(g);
}

/** Origem estruturada: campo manejo canônico ou grupo oficial saude-N. */
export function origemMovimentacaoESanitaria(mov: {
  manejo?: string | null;
  grupoId?: string | null;
}): boolean {
  if (String(mov.manejo ?? "").trim() === SAUDE_MOV_MANEJO) return true;
  return grupoIdESanitario(mov.grupoId);
}

/**
 * Estorno genérico de estoque não pode desfazer Sanitário.
 * Vínculo explícito (saude.estoqueMovimentacaoId) ou origem estruturada.
 */
export function deveBloquearEstornoGenericoSanitario(input: {
  movimentacoes: Array<{
    id?: number | null;
    manejo?: string | null;
    grupoId?: string | null;
  }>;
  movimentacaoIdsComVinculoSaude?: Iterable<number>;
}): boolean {
  if (input.movimentacoes.some(origemMovimentacaoESanitaria)) return true;
  const vinculos = new Set<number>();
  for (const raw of input.movimentacaoIdsComVinculoSaude ?? []) {
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0) vinculos.add(id);
  }
  if (vinculos.size === 0) return false;
  return input.movimentacoes.some((m) => {
    const id = Number(m.id);
    return Number.isInteger(id) && vinculos.has(id);
  });
}
