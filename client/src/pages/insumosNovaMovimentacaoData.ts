import { formatDateInputLocal } from "@/lib/date-utils";

/**
 * Data civil padrão da Nova Movimentação
 * (Entrada, Saída e Transferência compartilham o mesmo campo).
 */
export function dataInicialNovaMovimentacao(agora: Date = new Date()): string {
  return formatDateInputLocal(agora);
}
