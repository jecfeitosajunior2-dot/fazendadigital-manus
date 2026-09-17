/**
 * Duas operações distintas no Controle de sêmen.
 * Não unificar: cada uma atua em um alvo diferente.
 */

/** Erro identificado numa movimentação específica do histórico. */
export const SEMEN_OP_CORRIGIR_LANCAMENTO_TITULO = "Corrigir Lançamento";
export const SEMEN_OP_CORRIGIR_LANCAMENTO_REGRA =
  "Sei qual movimentação está errada.";
export const SEMEN_OP_CORRIGIR_LANCAMENTO_TOOLTIP =
  "Corrigir especificamente este lançamento.";

/** Divergência do estado atual, sem apontar uma linha histórica. */
export const SEMEN_OP_AJUSTAR_ESTOQUE_TITULO = "Ajustar estoque";
export const SEMEN_OP_AJUSTAR_ESTOQUE_REGRA =
  "Sei que o estoque atual está errado, mas não devo alterar uma movimentação específica.";
export const SEMEN_OP_AJUSTAR_ESTOQUE_TOOLTIP =
  "Ajuste saldo ou custo atual sem alterar uma movimentação específica.";
export const SEMEN_OP_AJUSTAR_ESTOQUE_NAO_E_ENTRADA =
  "Ajuste não substitui Nova entrada. Compra e aquisição entram por Nova entrada.";
