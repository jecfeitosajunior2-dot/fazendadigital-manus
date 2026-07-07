const META_PREFIX = "\n__fd_repro__";
const META_SUFFIX = "__end__";

export const REPRO_TIPOS_FEMEA = [
  "Cio",
  "Cobertura",
  "Inseminação",
  "Diagnóstico de prenhez",
  "Parto",
  "Aborto",
  "Desmama",
  "Outro",
] as const;

export const REPRO_TIPOS_MACHO = [
  "Cobertura realizada",
  "Exame andrológico",
  "Coleta de sêmen",
  "Uso como reprodutor",
  "Outro",
] as const;

export const REPRO_TIPOS_UNICO = [
  "Cio",
  "Cobertura",
  "Inseminação",
  "Diagnóstico de prenhez",
  "Parto",
  "Aborto",
  "Desmama",
  "Exame andrológico",
  "Coleta de sêmen",
  "Outro",
] as const;

export const REPRO_RESULTADOS = [
  "Realizado",
  "Positivo",
  "Negativo",
  "Inconclusivo",
  "Repetir",
  "Outro",
] as const;

export const REPRO_RESULTADOS_FEMEA = [
  "Realizado",
  "Positivo",
  "Negativo",
  "Prenha",
  "Vazia",
  "Inconclusivo",
  "Repetir",
  "Outro",
] as const;

export const REPRO_RESULTADOS_MACHO = [
  "Realizado",
  "Apto",
  "Inapto",
  "Positivo",
  "Negativo",
  "Inconclusivo",
  "Repetir",
  "Outro",
] as const;

const TIPOS_COM_PREVISAO_PARTO = new Set([
  "Cobertura",
  "Inseminação",
  "Diagnóstico de prenhez",
]);

export function getReproTipoOptions(sexo: string | null | undefined): readonly string[] {
  if (sexo === "femea") return REPRO_TIPOS_FEMEA;
  if (sexo === "macho") return REPRO_TIPOS_MACHO;
  return REPRO_TIPOS_UNICO;
}

export function getReproResultadoOptions(sexo: string | null | undefined): readonly string[] {
  if (sexo === "femea") return REPRO_RESULTADOS_FEMEA;
  if (sexo === "macho") return REPRO_RESULTADOS_MACHO;
  return REPRO_RESULTADOS;
}

export function getReproRelacionadoLabel(sexo: string | null | undefined): string {
  if (sexo === "femea") return "Reprodutor / Sêmen";
  if (sexo === "macho") return "Matriz / Lote atendido";
  return "Relacionado";
}

export function getReproRelacionadoPlaceholder(sexo: string | null | undefined): string {
  if (sexo === "femea") return "Ex: Touro 55, sêmen Nelore 123";
  if (sexo === "macho") return "Ex: Matriz 25, Lote Matrizes 01";
  return "Ex: Touro, matriz ou lote";
}

export function shouldShowPrevisaoPartoForm(sexo: string | null | undefined): boolean {
  return sexo !== "macho";
}

export function shouldCalcPrevisaoParto(
  tipo: string,
  sexo?: string | null,
): boolean {
  if (sexo === "macho") return false;
  return TIPOS_COM_PREVISAO_PARTO.has(tipo);
}

/** Soma 283 dias à data (YYYY-MM-DD) para previsão de parto bovino. */
export function calcPrevisaoParto283(dataISO: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return null;
  const [y, m, d] = dataISO.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + 283);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export type ReproObservacoesMeta = {
  observacoes: string | null;
  reprodutorSemen: string | null;
  responsavel: string | null;
};

export function packReproObservacoes(
  observacoes?: string | null,
  reprodutorSemen?: string | null,
  responsavel?: string | null,
): string | undefined {
  const obsTrim = observacoes?.trim() || "";
  const reprodutor = reprodutorSemen?.trim() || undefined;
  const resp = responsavel?.trim() || undefined;
  const hasMeta = reprodutor || resp;
  if (!hasMeta && !obsTrim) return undefined;
  if (!hasMeta) return obsTrim;
  const meta = JSON.stringify({ r: reprodutor, p: resp });
  return `${obsTrim}${META_PREFIX}${meta}${META_SUFFIX}`;
}

export function unpackReproObservacoes(raw: string | null | undefined): ReproObservacoesMeta {
  if (!raw) {
    return { observacoes: null, reprodutorSemen: null, responsavel: null };
  }
  const idx = raw.indexOf(META_PREFIX);
  if (idx === -1) {
    const trimmed = raw.trim();
    return { observacoes: trimmed || null, reprodutorSemen: null, responsavel: null };
  }
  const obs = raw.slice(0, idx).trim() || null;
  const rest = raw.slice(idx + META_PREFIX.length);
  const end = rest.indexOf(META_SUFFIX);
  if (end === -1) {
    const trimmed = raw.trim();
    return { observacoes: trimmed || null, reprodutorSemen: null, responsavel: null };
  }
  try {
    const meta = JSON.parse(rest.slice(0, end)) as { r?: string; p?: string };
    return {
      observacoes: obs,
      reprodutorSemen: meta.r?.trim() || null,
      responsavel: meta.p?.trim() || null,
    };
  } catch {
    const trimmed = raw.trim();
    return { observacoes: trimmed || null, reprodutorSemen: null, responsavel: null };
  }
}
