/** Dinheiro do novo núcleo financeiro. Sempre trabalha em centavos inteiros. */

export function toCentavos(valor: number | string): number {
  const n = typeof valor === "string" ? Number(valor.replace(",", ".")) : valor;
  if (!Number.isFinite(n)) return NaN;
  return Math.round((n + Number.EPSILON) * 100);
}

export function fromCentavos(centavos: number): number {
  return Math.round(centavos) / 100;
}

export function parseDinheiro(valor: number | string): number | null {
  const c = toCentavos(valor);
  if (!Number.isFinite(c)) return null;
  return fromCentavos(c);
}

export function dinheiroPositivo(valor: number | string): boolean {
  const c = toCentavos(valor);
  return Number.isFinite(c) && c > 0;
}

export function dinheiroNaoNegativo(valor: number | string): boolean {
  const c = toCentavos(valor);
  return Number.isFinite(c) && c >= 0;
}

export function somarDinheiro(...valores: Array<number | string>): number {
  return fromCentavos(valores.reduce<number>((acc, v) => acc + toCentavos(v), 0));
}

export function subtrairDinheiro(a: number | string, b: number | string): number {
  return fromCentavos(toCentavos(a) - toCentavos(b));
}

export function dinheiroIgual(a: number | string, b: number | string): boolean {
  return toCentavos(a) === toCentavos(b);
}

export function formatarDinheiroPersistido(valor: number | string): string {
  return fromCentavos(toCentavos(valor)).toFixed(2);
}
