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
  "Retirada da reprodução",
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
  "Uso como reprodutor",
  "Retirada da reprodução",
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
  "Prenha",
  "Vazia",
  "Positivo",
  "Negativo",
  "Inconclusivo",
  "Repetir",
  "Outro",
] as const;

const REPRO_RESULTADOS_POR_TIPO_FEMEA: Record<string, readonly string[]> = {
  Cio: ["Observado", "Repetir", "Outro"],
  Cobertura: ["Realizado", "Repetir", "Outro"],
  Inseminação: ["Realizado", "Repetir", "Outro"],
  "Diagnóstico de prenhez": ["Prenha", "Vazia", "Inconclusivo", "Repetir", "Outro"],
  Parto: ["Normal", "Com assistência", "Natimorto", "Outro"],
  Aborto: ["Confirmado", "Suspeito", "Outro"],
  Desmama: ["Realizado", "Outro"],
  Outro: ["Realizado", "Positivo", "Negativo", "Inconclusivo", "Outro"],
};

function getReproResultadoBaseFemea(tipo: string): readonly string[] {
  const tipoKey = tipo.trim();
  if (!tipoKey) return [];
  return REPRO_RESULTADOS_POR_TIPO_FEMEA[tipoKey] ?? [];
}

/** Verifica se o resultado é válido para o tipo (sem considerar legado na edição). */
export function isReproResultadoValidForTipo(
  sexo: string | null | undefined,
  tipo: string | null | undefined,
  resultado: string | null | undefined,
): boolean {
  const valor = resultado?.trim();
  if (!valor) return true;
  if (sexo === "macho") return REPRO_RESULTADOS_MACHO.includes(valor as (typeof REPRO_RESULTADOS_MACHO)[number]);
  if (sexo === "femea") {
    const base = getReproResultadoBaseFemea(tipo ?? "");
    return base.includes(valor);
  }
  return REPRO_RESULTADOS.includes(valor as (typeof REPRO_RESULTADOS)[number]);
}

export const REPRO_RESULTADOS_MACHO = [
  "Realizado",
  "Apto",
  "Inapto",
  "Inconclusivo",
  "Repetir",
  "Outro",
] as const;

/** Tipos em que a data do evento representa a concepção (sugestão +283 dias). */
const TIPOS_COM_PREVISAO_PARTO = new Set([
  "Cobertura",
  "Inseminação",
]);

export function getReproTipoOptions(sexo: string | null | undefined): readonly string[] {
  if (sexo === "femea") return REPRO_TIPOS_FEMEA;
  if (sexo === "macho") return REPRO_TIPOS_MACHO;
  return REPRO_TIPOS_UNICO;
}

export function getReproResultadoOptions(
  sexo: string | null | undefined,
  tipo?: string | null,
  resultadoAtual?: string | null,
): readonly string[] {
  if (sexo === "macho") return REPRO_RESULTADOS_MACHO;
  if (sexo === "femea") {
    const base = getReproResultadoBaseFemea(tipo ?? "");
    const atual = resultadoAtual?.trim();
    if (atual && !base.includes(atual)) {
      return [atual, ...base];
    }
    return base;
  }
  return REPRO_RESULTADOS;
}

export function getReproRelacionadoLabel(sexo: string | null | undefined): string {
  if (sexo === "femea") return "Reprodutor / Sêmen";
  if (sexo === "macho") return "Matriz / Lote atendido";
  return "Relacionado";
}

/** Cabeçalho da coluna na tabela do histórico reprodutivo. */
export function getReproRelacionadoTabelaHeader(sexo: string | null | undefined): string {
  if (sexo === "femea") return "Reprodutor / Sêmen";
  if (sexo === "macho") return "Matriz / Lote";
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

const TIPO_REPRO_TABELA_ABREV: Record<string, string> = {
  "Uso como reprodutor": "Uso reprodutor",
  "Cobertura realizada": "Cobertura",
  "Exame andrológico": "Andrológico",
  "Coleta de sêmen": "Coleta sêmen",
  "Retirada da reprodução": "Retirada",
  "Diagnóstico de prenhez": "Diag. prenhez",
};

/** Abreviação visual do tipo na tabela; valor salvo continua completo. */
export function formatTipoReproTabelaDisplay(tipo: string | null | undefined): {
  label: string;
  tituloCompleto: string;
} {
  const completo = (tipo ?? "").trim();
  if (!completo) return { label: "—", tituloCompleto: "—" };
  const label = TIPO_REPRO_TABELA_ABREV[completo] ?? completo;
  return { label, tituloCompleto: completo };
}

/** Coluna Previsão: nunca para macho; sempre para fêmea; indefinido só se houver dado. */
export function shouldShowPrevisaoColumn(
  sexo: string | null | undefined,
  registros: Array<{ dataPrevistoParto?: string | Date | null }>,
): boolean {
  if (sexo === "macho") return false;
  if (sexo === "femea") return true;
  return registros.some(r => {
    const v = r.dataPrevistoParto;
    if (v == null) return false;
    return String(v).trim() !== "";
  });
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

/** Converte data do registro para valor de input type="date". */
export function reproDataToInputISO(value: Date | string | null | undefined): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

export function reproRegistroToFormValues(reg: {
  tipo: string;
  dataCobertura: Date | string | null;
  dataPrevistoParto?: Date | string | null;
  resultado?: string | null;
  observacoes?: string | null;
}) {
  const meta = unpackReproObservacoes(reg.observacoes);
  return {
    tipo: reg.tipo || "",
    data: reproDataToInputISO(reg.dataCobertura),
    resultado: reg.resultado || "",
    reprodutorSemen: meta.reprodutorSemen || "",
    previsaoParto: reproDataToInputISO(reg.dataPrevistoParto),
    responsavel: meta.responsavel || "",
    observacoes: meta.observacoes || "",
  };
}

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
