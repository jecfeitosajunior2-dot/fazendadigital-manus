import bcrypt from "bcryptjs";

/** Mensagem única: não informa se o usuário existe ou se a senha está errada. */
export const MSG_LOGIN_INVALIDO = "Usuário ou senha inválidos.";

const HASH_BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function hashDeSenhaValido(hash: string | null | undefined): hash is string {
  if (!hash) return false;
  return HASH_BCRYPT.test(hash.trim());
}

export async function senhaConfereComHash(
  hash: string | null | undefined,
  senha: string,
): Promise<boolean> {
  if (!hashDeSenhaValido(hash)) return false;
  if (!senha) return false;
  try {
    return await bcrypt.compare(senha, hash);
  } catch {
    return false;
  }
}
