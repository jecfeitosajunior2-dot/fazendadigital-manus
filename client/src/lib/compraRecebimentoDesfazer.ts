import {
  MSG_ESTORNO_RECEBIMENTO_FALHOU,
  type MotivoEstornoRecebimentoCompra,
} from "@shared/compraRecebimentoEstorno";

export const TOAST_DESFAZER_RECEBIMENTO_SUCESSO = "Recebimento desfeito com sucesso.";
export const TEXTO_BOTAO_DESFAZER_RECEBIMENTO = "Desfazer recebimento";
export const TEXTO_BOTAO_DESFAZENDO_RECEBIMENTO = "Desfazendo...";

export type PayloadDesfazerRecebimento = {
  recebimentoId: number;
  motivo: MotivoEstornoRecebimentoCompra;
  observacao: string | null;
};

export function botaoDesfazerRecebimentoHabilitado(opts: {
  formularioValido: boolean;
  pending: boolean;
}): boolean {
  return opts.formularioValido && !opts.pending;
}

export function deveAceitarCliqueDesfazerRecebimento(opts: {
  formularioValido: boolean;
  pending: boolean;
}): boolean {
  return botaoDesfazerRecebimentoHabilitado(opts);
}

export function montarPayloadDesfazerRecebimento(input: {
  recebimentoId: number;
  motivo: MotivoEstornoRecebimentoCompra;
  observacao: string | null;
}): PayloadDesfazerRecebimento {
  return {
    recebimentoId: input.recebimentoId,
    motivo: input.motivo,
    observacao: input.observacao,
  };
}

export function queriesParaInvalidarAposDesfazerRecebimento(compraId: number): {
  get: { id: number };
  listarRecebimentos: { compraId: number };
} {
  return {
    get: { id: compraId },
    listarRecebimentos: { compraId },
  };
}

export function deveFecharModalAposDesfazer(ok: boolean): boolean {
  return ok;
}

export function podeRemoverLinhaRecebimentoNaUi(fase: "antes_da_resposta" | "sucesso" | "erro"): boolean {
  return fase === "sucesso";
}

export function deveLimparUltimoRecebidoAposDesfazer(opts: {
  ultimoBrinco?: string | null;
  alvoBrinco?: string | null;
}): boolean {
  const a = String(opts.ultimoBrinco ?? "").trim();
  const b = String(opts.alvoBrinco ?? "").trim();
  return a.length > 0 && a === b;
}

export function mensagemErroDesfazerRecebimento(error: unknown): string {
  if (error instanceof Error) {
    const texto = error.message.trim();
    if (texto) return texto;
  }
  return MSG_ESTORNO_RECEBIMENTO_FALHOU;
}
