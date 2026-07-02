export type AreaInputUnidade = "ha" | "m2";

/** Tipos em que a área não é obrigatória no cadastro. */
export const TIPOS_AREA_OPCIONAL = new Set([
  "Curral",
  "Sede",
  "Baia de Confinamento",
  "Área de manejo",
  "Outro",
]);

/** Tipos em que a área é obrigatória. */
export const TIPOS_AREA_OBRIGATORIA = new Set([
  "Pasto",
  "Piquete",
  "Invernada",
  "Potreiro",
]);

/** Tipos que, por padrão, não entram na soma da área da fazenda. */
export const TIPOS_INCLUIR_AREA_PADRAO_FALSE = new Set([
  "Curral",
  "Sede",
  "Baia de Confinamento",
  "Área de manejo",
]);

export function parseAreaInput(value: string): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function areaObrigatoriaParaTipo(tipo: string): boolean {
  if (TIPOS_AREA_OPCIONAL.has(tipo)) return false;
  if (TIPOS_AREA_OBRIGATORIA.has(tipo)) return true;
  return false;
}

export function incluirAreaPadraoParaTipo(tipo: string): boolean {
  return !TIPOS_INCLUIR_AREA_PADRAO_FALSE.has(tipo);
}

export function convertAreaInputToHectares(value: string, unit: AreaInputUnidade): number | null {
  if (!String(value ?? "").trim()) return null;
  const n = parseAreaInput(value);
  if (n === null) return null;
  return unit === "m2" ? n / 10_000 : n;
}

export function formatHectaresForStorage(ha: number): string {
  const rounded = Number(ha.toFixed(6));
  return String(rounded);
}

export function areaPlaceholderParaTipo(tipo: string, unit: AreaInputUnidade): string {
  if (TIPOS_AREA_OPCIONAL.has(tipo) || TIPOS_INCLUIR_AREA_PADRAO_FALSE.has(tipo)) {
    return unit === "m2" ? "Ex. 500" : "Ex. 0,05";
  }
  return unit === "m2" ? "Ex. 450000" : "Ex. 45";
}

export function areaDicaParaTipo(tipo: string): string | null {
  if (!TIPOS_AREA_OPCIONAL.has(tipo) && !TIPOS_INCLUIR_AREA_PADRAO_FALSE.has(tipo)) return null;
  return "Área opcional. Curral pequeno? Use m² (ex.: 500) ou ha (ex.: 0,05).";
}

export function tipoCostumaFicarForaAreaTotal(tipo: string): boolean {
  return TIPOS_INCLUIR_AREA_PADRAO_FALSE.has(tipo);
}

export function incluirAreaAvisoFormulario(tipo: string): string | null {
  if (!TIPOS_INCLUIR_AREA_PADRAO_FALSE.has(tipo)) return null;
  return "Currais e áreas de manejo costumam ficar fora da área total da fazenda.";
}

export function mensagemConfirmarIncluirAreaTotal(
  tipo: string,
  nome: string,
  areaHa: number | null,
): string {
  const areaFmt = areaHa !== null
    ? ` (${areaHa.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} ha)`
    : "";
  return `"${tipo}" normalmente não entra na soma da área da fazenda, porque não é pasto de pastejo.\n\nDeseja contar a área de "${nome}"${areaFmt} no total da fazenda mesmo assim?`;
}

export function tooltipIncluirAreaTotal(tipo: string): string {
  const base = "Marque se a área desta subdivisão deve entrar na soma da fazenda. Isso não tem relação com coordenadas ou mapa.";
  if (TIPOS_INCLUIR_AREA_PADRAO_FALSE.has(tipo)) {
    return `${base} Currais e áreas de manejo em geral não entram no total.`;
  }
  return base;
}
