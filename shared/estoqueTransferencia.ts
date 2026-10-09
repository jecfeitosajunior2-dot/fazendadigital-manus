export const ESTOQUE_OPERACAO_TIPO_TRANSFERENCIA = "Transferência";
export const ESTOQUE_OPERACAO_MOTIVO_TRANSFERENCIA = "Transferência";

export function isOperacaoTransferenciaInsumos(op: {
  tipo?: string | null;
  motivo?: string | null;
}): boolean {
  return (
    String(op.tipo ?? "") === ESTOQUE_OPERACAO_TIPO_TRANSFERENCIA
    || String(op.motivo ?? "") === ESTOQUE_OPERACAO_MOTIVO_TRANSFERENCIA
  );
}

export type TransferenciaInsumosItemInput = {
  estoqueOrigemId: number;
  quantidade: string;
};

export function validarTransferenciaInsumosInput(input: {
  fazendaOrigemId?: number;
  fazendaDestinoId?: number;
  itens?: TransferenciaInsumosItemInput[];
  dataOperacao?: string;
  idempotencyKey?: string;
}): string | null {
  if (!input.fazendaOrigemId || input.fazendaOrigemId <= 0) {
    return "Informe a fazenda de origem.";
  }
  if (!input.fazendaDestinoId || input.fazendaDestinoId <= 0) {
    return "Informe a fazenda de destino.";
  }
  if (input.fazendaOrigemId === input.fazendaDestinoId) {
    return "A fazenda de destino precisa ser diferente da origem.";
  }
  if (!input.dataOperacao || !/^\d{4}-\d{2}-\d{2}$/.test(input.dataOperacao.slice(0, 10))) {
    return "Informe a data da transferência.";
  }
  if (!input.idempotencyKey || input.idempotencyKey.trim().length < 8) {
    return "Chave de idempotência inválida.";
  }
  if (!input.itens?.length) {
    return "A transferência precisa ter pelo menos um item.";
  }
  for (const item of input.itens) {
    const q = Number(String(item.quantidade ?? "").replace(",", "."));
    if (!(item.estoqueOrigemId > 0) || !(q > 0)) {
      return "Informe produto e quantidade válidos para cada item.";
    }
  }
  return null;
}
