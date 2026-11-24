/**
 * Primeiro titular de um banco novo. Não cria o segundo e não aceita o arquivo antigo.
 * A senha não entra neste plano.
 */

export function avaliarBancoDoTitular(entrada: {
  banco: string;
  confirmouBancoNovo: boolean;
}): { ok: true } | { ok: false; motivo: "banco_operacional" | "confirmacao_ausente" } {
  const banco = entrada.banco.trim().toLowerCase();
  if (!banco || banco === "fazenda_digital") return { ok: false, motivo: "banco_operacional" };
  if (!entrada.confirmouBancoNovo) return { ok: false, motivo: "confirmacao_ausente" };
  return { ok: true };
}

export function planejarTitularInicial(entrada: {
  jaExistePrincipal: boolean;
  name: string;
  email: string;
  senhaInformada: boolean;
}): { ok: true; name: string; email: string; papel: "principal" } | { ok: false; motivo: string } {
  if (entrada.jaExistePrincipal) return { ok: false, motivo: "titular_existente" };
  const name = entrada.name.trim();
  const email = entrada.email.trim().toLowerCase();
  if (!name || name.length > 255) return { ok: false, motivo: "nome_invalido" };
  if (!email.includes("@") || email.length > 255) return { ok: false, motivo: "email_invalido" };
  if (!entrada.senhaInformada) return { ok: false, motivo: "senha_ausente" };
  return { ok: true, name, email, papel: "principal" };
}
