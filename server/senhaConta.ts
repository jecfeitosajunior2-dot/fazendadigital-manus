/**
 * Plano da troca e da recuperação. A senha em claro não entra no resultado.
 */

export const SENHA_MIN = 8;
export const SENHA_MAX = 80;

export type MotivoTroca =
  | "sessao_invalida"
  | "senha_atual_incorreta"
  | "confirmacao_diferente"
  | "senha_invalida"
  | "senha_reutilizada";

export function avaliarTrocaSenha(entrada: {
  sessaoConfere: boolean;
  atualConfere: boolean;
  nova: string;
  confirmacao: string;
  novaRepeteAtual: boolean;
}): { ok: true } | { ok: false; motivo: MotivoTroca } {
  if (!entrada.sessaoConfere) return { ok: false, motivo: "sessao_invalida" };
  if (!entrada.atualConfere) return { ok: false, motivo: "senha_atual_incorreta" };
  if (entrada.nova !== entrada.confirmacao) return { ok: false, motivo: "confirmacao_diferente" };
  if (entrada.nova.length < SENHA_MIN || entrada.nova.length > SENHA_MAX) {
    return { ok: false, motivo: "senha_invalida" };
  }
  if (entrada.novaRepeteAtual) return { ok: false, motivo: "senha_reutilizada" };
  return { ok: true };
}

export function avaliarRecuperacao(entrada: {
  banco: string;
  acessoAdministrativo: boolean;
  confirmouProcedimento: boolean;
  titularAutorizou: boolean;
  email: string;
  senhaInformada: boolean;
  senhaTamanho: number;
}): { ok: true; email: string } | { ok: false; motivo: string } {
  const banco = entrada.banco.trim().toLowerCase();
  if (!banco || banco === "fazenda_digital") return { ok: false, motivo: "banco_operacional" };
  if (!entrada.acessoAdministrativo || !entrada.confirmouProcedimento || !entrada.titularAutorizou) {
    return { ok: false, motivo: "autorizacao_ausente" };
  }
  const email = entrada.email.trim().toLowerCase();
  if (!email.includes("@") || email.length > 255) return { ok: false, motivo: "email_invalido" };
  if (!entrada.senhaInformada || entrada.senhaTamanho < SENHA_MIN || entrada.senhaTamanho > SENHA_MAX) {
    return { ok: false, motivo: "senha_invalida" };
  }
  return { ok: true, email };
}
