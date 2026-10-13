import { MSG_TRANSFERENCIA_MESMA_FAZENDA } from "./estoqueCapital";

export const ESTOQUE_OPERACAO_TIPO_TRANSFERENCIA = "Transferência";
export const ESTOQUE_OPERACAO_MOTIVO_TRANSFERENCIA = "Transferência";
export { MSG_TRANSFERENCIA_MESMA_FAZENDA };

export type EstoqueDestinoOpcao = { value: string; label: string };

/** Destino da transferência: remove a fazenda de origem da lista. */
export function opcoesEstoqueDestinoTransferencia(
  fazendas: readonly EstoqueDestinoOpcao[],
  fazendaOrigemId: string | number | null | undefined,
): EstoqueDestinoOpcao[] {
  const origem = String(fazendaOrigemId ?? "").trim();
  if (!origem) return [...fazendas];
  return fazendas.filter(f => String(f.value) !== origem);
}

/** Se a origem mudar e o destino ficar igual a ela, limpa o destino. */
export function limparDestinoSeIgualOrigem(
  fazendaOrigemId: string | number | null | undefined,
  fazendaDestinoId: string | number | null | undefined,
): string {
  const origem = String(fazendaOrigemId ?? "").trim();
  const dest = String(fazendaDestinoId ?? "").trim();
  if (!dest) return "";
  if (origem && dest === origem) return "";
  return dest;
}

export function transferenciaPodeSalvarDestino(
  fazendaOrigemId: string | number | null | undefined,
  fazendaDestinoId: string | number | null | undefined,
): boolean {
  const dest = String(fazendaDestinoId ?? "").trim();
  return Boolean(dest) && limparDestinoSeIgualOrigem(fazendaOrigemId, dest) === dest;
}

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
    return MSG_TRANSFERENCIA_MESMA_FAZENDA;
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
