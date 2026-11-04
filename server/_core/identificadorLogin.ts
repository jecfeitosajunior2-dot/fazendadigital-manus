/** Tira só espaços das pontas do e-mail ou do identificador. A senha não passa por aqui. */
export function identificadorDeLogin(valor: string): string {
  return valor.trim();
}
