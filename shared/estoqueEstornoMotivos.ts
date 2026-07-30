/** Códigos internos de motivo de estorno de saída automática de abastecimento. */
export const MOTIVO_ESTORNO_ORIGEM_COMBUSTIVEL_ALTERADA = "origem_combustivel_alterada";
export const MOTIVO_ESTORNO_ABASTECIMENTO = "abastecimento_estornado";

export type MotivoEstornoAbastecimentoCodigo =
  | typeof MOTIVO_ESTORNO_ORIGEM_COMBUSTIVEL_ALTERADA
  | typeof MOTIVO_ESTORNO_ABASTECIMENTO;

/**
 * Classifica o motivo gravado (código novo ou texto legado).
 */
export function classificarMotivoEstornoAbastecimento(
  motivo: string | null | undefined,
): MotivoEstornoAbastecimentoCodigo | "outro" {
  const raw = (motivo || "").trim();
  if (!raw) return "outro";

  const head = raw.split(" — ")[0]?.trim() || raw;
  const lower = head.toLowerCase();

  if (
    head === MOTIVO_ESTORNO_ORIGEM_COMBUSTIVEL_ALTERADA ||
    lower.includes("origem_combustivel_alterada") ||
    /origem\s+alterada/i.test(head)
  ) {
    return MOTIVO_ESTORNO_ORIGEM_COMBUSTIVEL_ALTERADA;
  }

  if (
    head === MOTIVO_ESTORNO_ABASTECIMENTO ||
    lower.includes("abastecimento_estornado") ||
    /estorno\s+do\s+abastecimento/i.test(head) ||
    /^abastecimento\s+estornado\.?$/i.test(head)
  ) {
    return MOTIVO_ESTORNO_ABASTECIMENTO;
  }

  return "outro";
}

/** Texto amigável para o detalhe expandido (com pontuação final). */
export function textoMotivoEstornoAbastecimentoDetalhe(
  motivo: string | null | undefined,
): string | null {
  const cls = classificarMotivoEstornoAbastecimento(motivo);
  if (cls === MOTIVO_ESTORNO_ORIGEM_COMBUSTIVEL_ALTERADA) {
    return "Origem do combustível alterada para Compra externa / Posto.";
  }
  if (cls === MOTIVO_ESTORNO_ABASTECIMENTO) {
    return "Abastecimento estornado.";
  }
  const t = (motivo || "").trim();
  return t || null;
}

/** Texto curto para o bloco de auditoria de estorno (sem forçar ponto final). */
export function rotuloMotivoEstornoAbastecimento(
  motivo: string | null | undefined,
): string | null {
  const detalhe = textoMotivoEstornoAbastecimentoDetalhe(motivo);
  if (!detalhe) return null;
  return detalhe.replace(/\.$/, "");
}
