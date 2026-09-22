/** Só dígitos — valor de comparação. A máscara fica na tela. */
export function normalizeCpfCnpj(value?: string | null): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function documentosCpfCnpjIguais(a?: string | null, b?: string | null): boolean {
  const da = normalizeCpfCnpj(a);
  const db = normalizeCpfCnpj(b);
  return da.length > 0 && da === db;
}

/** Compara o que o usuário digitou, inclusive vazio com vazio (edição de legado). */
export function mesmoDocumentoDigitado(a?: string | null, b?: string | null): boolean {
  return normalizeCpfCnpj(a) === normalizeCpfCnpj(b);
}

function todosDigitosIguais(digits: string): boolean {
  return digits.length > 0 && /^(\d)\1+$/.test(digits);
}

function digitoVerificador(base: string, pesos: readonly number[]): number {
  const soma = base.split("").reduce((acc, char, i) => acc + Number(char) * (pesos[i] ?? 0), 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function isCpfValido(value?: string | null): boolean {
  const digits = normalizeCpfCnpj(value);
  if (digits.length !== 11) return false;
  if (todosDigitosIguais(digits)) return false;
  const d1 = digitoVerificador(digits.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(digits.slice(0, 9) + String(d1), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${d1}${d2}`);
}

export function isCnpjValido(value?: string | null): boolean {
  const digits = normalizeCpfCnpj(value);
  if (digits.length !== 14) return false;
  if (todosDigitosIguais(digits)) return false;
  const d1 = digitoVerificador(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(digits.slice(0, 12) + String(d1), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${d1}${d2}`);
}

export function isCpfCnpjValido(value?: string | null): boolean {
  const digits = normalizeCpfCnpj(value);
  if (digits.length === 11) return isCpfValido(digits);
  if (digits.length === 14) return isCnpjValido(digits);
  return false;
}
