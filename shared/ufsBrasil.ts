export const UFS_BRASIL = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export type UfBrasil = (typeof UFS_BRASIL)[number];

export function normalizeUfBrasil(value?: string | null): string | null {
  const uf = String(value ?? "").trim().toUpperCase();
  if (!uf) return null;
  return (UFS_BRASIL as readonly string[]).includes(uf) ? uf : null;
}
