export const MSG_VENDA_CANCELAR_COM_RECEBIMENTO_UI =
  "Cancelamento indisponível: esta venda possui recebimento financeiro.";

export function podeExibirCancelarVenda(input: {
  status?: string | null;
  temItens?: boolean;
  temRecebimentoEfetivo?: boolean;
}): boolean {
  return input.status === "concluido" && Boolean(input.temItens) && !input.temRecebimentoEfetivo;
}

export function deveExibirAvisoCancelamentoRecebimento(input: {
  status?: string | null;
  temRecebimentoEfetivo?: boolean;
}): boolean {
  return input.status === "concluido" && Boolean(input.temRecebimentoEfetivo);
}
