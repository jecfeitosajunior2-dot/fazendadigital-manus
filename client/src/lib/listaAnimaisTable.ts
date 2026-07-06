/** Formata peso em kg no padrão pt-BR (ex.: 200,0). Retorna "" se ausente. */
export function formatUltimoPesoKg(val: number | null | undefined): string {
  if (val === null || val === undefined) return "";
  return Number(val).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Indica se valor numérico da tabela deve exibir traço (—). */
export function shouldShowNumericDash(val: number | null | undefined): boolean {
  return val === null || val === undefined;
}

/** Classes do badge discreto para Em Carência = Sim (alerta sanitário). */
export const EM_CARENCIA_SIM_BADGE_CLASS =
  "inline-flex items-center justify-center px-2 py-0.5 rounded border border-amber-200/90 bg-amber-50 text-amber-700 text-[11px] font-medium";

/** Classes do texto neutro para Em Carência = Não. */
export const EM_CARENCIA_NAO_TEXT_CLASS = "text-gray-400 text-[11px]";

export function getEmCarenciaLabel(emCarencia: boolean): "Sim" | "Não" {
  return emCarencia ? "Sim" : "Não";
}

export function shouldHighlightEmCarencia(emCarencia: boolean): boolean {
  return emCarencia;
}
