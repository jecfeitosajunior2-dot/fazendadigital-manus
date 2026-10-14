import { formatPhoneBR } from "./utils";

/**
 * Apresenta o telefone da OS ou do cadastro com a máscara brasileira.
 * Números sem máscara e já mascarados são normalizados.
 * Texto histórico sem dígitos (ex.: e-mail antigo em "Contato") permanece na leitura.
 */
export function telefonePrestadorParaExibicao(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (!/\d/.test(raw)) return raw;
  return formatPhoneBR(raw);
}

/** Lê só o telefone do cadastro de Pessoas — não usa e-mail. */
export function telefoneDoCadastroPessoa(telefone: string | null | undefined): string {
  return telefonePrestadorParaExibicao(telefone);
}

/** Seleção explícita do prestador: preenche com o telefone do cadastro. */
export function telefoneAoSelecionarPrestador(telefoneCadastro: string | null | undefined): string {
  return telefoneDoCadastroPessoa(telefoneCadastro);
}

/**
 * Sincronização passiva (abrir OS / voltar do cadastro):
 * preserva o telefone já gravado na OS; só completa se o campo estiver vazio.
 */
export function telefoneAoSincronizarPrestador(input: {
  telefoneOs: string | null | undefined;
  telefoneCadastro: string | null | undefined;
}): string {
  const atual = telefonePrestadorParaExibicao(input.telefoneOs);
  if (atual) return atual;
  return telefoneDoCadastroPessoa(input.telefoneCadastro);
}

/** Valor gravado somente na OS — o cadastro de Pessoas não é alterado. */
export function telefonePrestadorParaOs(value: string | null | undefined): string | undefined {
  const atual = String(value ?? "").trim();
  return atual || undefined;
}
