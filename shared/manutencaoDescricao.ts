/** Mensagem padrão de validação da descrição do serviço. */
export const MSG_DESCRICAO_SERVICO_OBRIGATORIA =
  "Informe a descrição do serviço realizado.";

/** Fallback visual na listagem/exportação — não grava no banco. */
export const DESC_SERVICO_FALLBACK_LISTAGEM = "Serviço não informado";

const DESC_INVALIDAS = new Set(
  [
    "-",
    ".",
    "/",
    "n/a",
    "na",
    "nao informado",
    "não informado",
    "corretiva",
    "preventiva",
    "preditiva",
    "revisao",
    "revisão",
    "manutencao corretiva",
    "manutenção corretiva",
    "manutencao preventiva",
    "manutenção preventiva",
    "manutencao preditiva",
    "manutenção preditiva",
    "manutencao registrada",
    "manutenção registrada",
    "sem descricao do servico",
    "sem descrição do serviço",
    "servico nao informado",
    "serviço não informado",
  ].map(s => s.toLowerCase()),
);

/** Normaliza a descrição (trim). */
export function normalizeDescricaoServico(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Descrição válida: tem conteúdo útil e não é só o tipo / placeholder genérico.
 */
export function isDescricaoServicoValida(value: unknown): boolean {
  const d = normalizeDescricaoServico(value);
  if (!d) return false;
  if (DESC_INVALIDAS.has(d.toLowerCase())) return false;
  // Exige ao menos letra ou número (rejeita só sinais/pontuação).
  if (!/[a-zA-ZÀ-ÿ0-9]/.test(d)) return false;
  return true;
}

/** Texto da listagem/exportação; fallback só visual para registros antigos. */
export function descricaoServicoParaListagem(value: unknown): string {
  const d = normalizeDescricaoServico(value);
  if (isDescricaoServicoValida(d)) return d;
  return DESC_SERVICO_FALLBACK_LISTAGEM;
}
