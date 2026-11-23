import {
  MANUT_STATUS_CONCLUIDA,
  manutencaoEstaEstornada,
} from "./manutencaoEstoque";

export const MSG_MANUT_EXCLUSAO_ESTORNADA =
  "Manutenção estornada não pode ser excluída. O histórico é preservado.";

export const MSG_MANUT_EXCLUSAO_CONCLUIDA =
  "Manutenção concluída não pode ser excluída. Use Estornar manutenção para cancelar e preservar o histórico.";

export const MSG_MANUT_EXCLUSAO_BLOQUEADA =
  "A manutenção não é apagada. O histórico fica guardado.";

export function manutencaoEstaConcluida(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() === MANUT_STATUS_CONCLUIDA;
}

/** Menu da lista: estorno não depende de consumo de estoque. */
export function acoesMenuManutencao(status: string | null | undefined): {
  podeEstornar: boolean;
  podeExcluir: boolean;
} {
  if (manutencaoEstaEstornada(status)) {
    return { podeEstornar: false, podeExcluir: false };
  }
  return { podeEstornar: true, podeExcluir: false };
}

export function recusarExclusaoManutencao(
  status: string | null | undefined,
): { recusar: false } | { recusar: true; message: string } {
  if (manutencaoEstaEstornada(status)) {
    return { recusar: true, message: MSG_MANUT_EXCLUSAO_ESTORNADA };
  }
  if (manutencaoEstaConcluida(status)) {
    return { recusar: true, message: MSG_MANUT_EXCLUSAO_CONCLUIDA };
  }
  return { recusar: true, message: MSG_MANUT_EXCLUSAO_BLOQUEADA };
}
