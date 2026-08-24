import type { CoberturaAlvoPersistido } from "./reproCoberturaAlvo";
import { formatCoberturaAlvoDetalhes } from "./reproCoberturaAlvo";

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

/** Resultados contextuais por tipo de manejo masculino (manejo pontual). */
const REPRO_RESULTADOS_POR_TIPO_MACHO: Record<string, readonly string[]> = {
  "Exame andrológico": ["Apto", "Inapto", "Inconclusivo", "Repetir", "Outro"],
  "Coleta de sêmen": [
    "Coleta realizada",
    "Coleta parcial",
    "Coleta não realizada",
    "Outro",
  ],
};

/** Tipos masculinos em que o evento já se expressa pelo Tipo — sem Resultado na UI. */
const REPRO_TIPOS_MACHO_SEM_RESULTADO = new Set([
  "Cobertura realizada",
  "Uso como reprodutor",
  "Retirada da reprodução",
  "Outro",
]);

/** Lista legada usada em registros antigos antes da contextualização por tipo. */
export const REPRO_RESULTADOS_MACHO = [
  "Realizado",
  "Apto",
  "Inapto",
  "Inconclusivo",
  "Repetir",
  "Outro",
] as const;

export const MSG_REPRO_RESULTADO_INCOMPATIVEL =
  "Resultado incompatível com o tipo de manejo reprodutivo.";

function getReproResultadoBaseFemea(tipo: string): readonly string[] {
  const tipoKey = tipo.trim();
  if (!tipoKey) return [];
  return REPRO_RESULTADOS_POR_TIPO_FEMEA[tipoKey] ?? [];
}

function getReproResultadoBaseMacho(tipo: string): readonly string[] {
  const tipoKey = tipo.trim();
  if (!tipoKey) return [];
  return REPRO_RESULTADOS_POR_TIPO_MACHO[tipoKey] ?? [];
}

/** Verifica se o resultado é válido para o tipo (inclui valores legados quando strict=false). */
export function isReproResultadoValidForTipo(
  sexo: string | null | undefined,
  tipo: string | null | undefined,
  resultado: string | null | undefined,
  opts?: { strict?: boolean },
): boolean {
  const valor = resultado?.trim();
  if (!valor) return true;
  const strict = opts?.strict ?? false;
  const tipoKey = (tipo ?? "").trim();

  if (sexo === "macho") {
    const base = getReproResultadoBaseMacho(tipoKey);
    if (base.length === 0) {
      if (tipoKey === "Cobertura realizada" && valor === "Realizado") return true;
      if (!strict && REPRO_RESULTADOS_MACHO.includes(valor as (typeof REPRO_RESULTADOS_MACHO)[number])) {
        return true;
      }
      return false;
    }
    if (base.includes(valor)) return true;
    if (!strict && REPRO_RESULTADOS_MACHO.includes(valor as (typeof REPRO_RESULTADOS_MACHO)[number])) {
      return true;
    }
    return false;
  }

  if (sexo === "femea") {
    const base = getReproResultadoBaseFemea(tipoKey);
    return base.includes(valor);
  }

  return REPRO_RESULTADOS.includes(valor as (typeof REPRO_RESULTADOS)[number]);
}

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

/** Manejo pontual reprodutivo — exclui Desmama (fluxo próprio em Manejo → Desmama). */
export function getReproTipoOptionsManejoPontual(
  sexo: string | null | undefined,
): readonly string[] {
  return getReproTipoOptions(sexo).filter(t => t !== "Desmama");
}

export function getReproResultadoOptions(
  sexo: string | null | undefined,
  tipo?: string | null,
  resultadoAtual?: string | null,
): readonly string[] {
  if (sexo === "macho") {
    const base = getReproResultadoBaseMacho(tipo ?? "");
    const atual = resultadoAtual?.trim();
    if (atual && !base.includes(atual)) {
      return [atual, ...base];
    }
    return base;
  }
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
  "Coleta de sêmen": "Coleta sêmen",
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
  descricaoResultadoOutro: string | null;
  coberturaAlvo: CoberturaAlvoPersistido | null;
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
  descricaoResultadoOutro?: string | null,
  coberturaAlvo?: CoberturaAlvoPersistido | null,
): string | undefined {
  const obsTrim = observacoes?.trim() || "";
  const reprodutor = reprodutorSemen?.trim() || undefined;
  const resp = responsavel?.trim() || undefined;
  const descResOutro = descricaoResultadoOutro?.trim() || undefined;
  const hasCoberturaAlvo = Boolean(
    (coberturaAlvo?.animalIds?.length ?? 0) > 0 || coberturaAlvo?.tipo,
  );
  const hasMeta = reprodutor || resp || descResOutro || hasCoberturaAlvo;
  if (!hasMeta && !obsTrim) return undefined;
  if (!hasMeta) return obsTrim;
  const metaPayload: Record<string, unknown> = { r: reprodutor, p: resp, o: descResOutro };
  if (hasCoberturaAlvo && coberturaAlvo) {
    metaPayload.csm = coberturaAlvo.selectionMode;
    metaPayload.caids = coberturaAlvo.animalIds;
    metaPayload.clbs = coberturaAlvo.labelsBrinco;
    metaPayload.cat =
      coberturaAlvo.selectionMode === "individual" ? "animal" : "lote";
    if (coberturaAlvo.animalIds.length === 1) {
      metaPayload.cai = coberturaAlvo.animalIds[0];
      if (coberturaAlvo.labelsBrinco[0]) metaPayload.clb = coberturaAlvo.labelsBrinco[0];
    }
    if (coberturaAlvo.loteId != null) metaPayload.cli = coberturaAlvo.loteId;
    if (coberturaAlvo.labelLoteNome) metaPayload.cln = coberturaAlvo.labelLoteNome;
  }
  const meta = JSON.stringify(metaPayload);
  return `${obsTrim}${META_PREFIX}${meta}${META_SUFFIX}`;
}

/** Campo Reprodutor / Matriz no manejo pontual reprodutivo. */
export function showReproReprodutorFieldManejo(
  tipo: string,
  sexo: string | null | undefined,
): boolean {
  if (!tipo.trim()) return false;
  if (sexo === "femea") return tipo === "Cobertura" || tipo === "Inseminação";
  if (sexo === "macho") return false;
  return tipo === "Cobertura" || tipo === "Inseminação";
}

/** Resultado condicional no manejo pontual (Cio e Outro ficam sem Resultado). */
export function showReproResultadoFieldManejo(
  tipo: string,
  sexo: string | null | undefined,
): boolean {
  if (!tipo.trim() || tipo === "Cio" || tipo === "Outro") return false;
  if (sexo === "macho") {
    return tipo === "Exame andrológico" || tipo === "Coleta de sêmen";
  }
  if (tipo === "Diagnóstico de prenhez" || tipo === "Parto" || tipo === "Aborto") return true;
  const opts = getReproResultadoOptions(sexo, tipo);
  return opts.length > 0;
}

export function isReproResultadoRequiredManejo(
  tipo: string,
  sexo?: string | null,
): boolean {
  if (tipo === "Diagnóstico de prenhez" || tipo === "Parto" || tipo === "Aborto") {
    return true;
  }
  if (sexo === "macho") {
    return tipo === "Exame andrológico" || tipo === "Coleta de sêmen";
  }
  return false;
}

export function showReproDescricaoOutroManejo(tipo: string): boolean {
  return tipo === "Outro";
}

/** Descrição obrigatória quando Resultado = Outro em tipos com resultado contextual. */
export function showReproDescricaoResultadoOutroManejo(
  tipo: string,
  resultado: string | null | undefined,
): boolean {
  const res = resultado?.trim();
  if (res !== "Outro") return false;
  return tipo === "Exame andrológico" || tipo === "Coleta de sêmen";
}

/** Valida resultado × tipo antes de persistir (frontend e backend). */
export function validateReproResultadoForSave(input: {
  sexo?: string | null;
  tipo: string;
  resultado?: string | null;
  descricaoResultadoOutro?: string | null;
}): { ok: true } | { ok: false; message: string } {
  const tipo = input.tipo.trim();
  const sexo = input.sexo ?? null;
  const resultado = input.resultado?.trim() || "";
  const showRes = showReproResultadoFieldManejo(tipo, sexo);

  if (!showRes) {
    if (!resultado) return { ok: true };
    if (tipo === "Cobertura realizada" && resultado === "Realizado") return { ok: true };
    if (sexo === "macho" && REPRO_TIPOS_MACHO_SEM_RESULTADO.has(tipo)) {
      return { ok: false, message: MSG_REPRO_RESULTADO_INCOMPATIVEL };
    }
    if (!isReproResultadoValidForTipo(sexo, tipo, resultado, { strict: true })) {
      return { ok: false, message: MSG_REPRO_RESULTADO_INCOMPATIVEL };
    }
    return { ok: true };
  }

  if (isReproResultadoRequiredManejo(tipo, sexo) && !resultado) {
    return { ok: false, message: "Informe o resultado do manejo reprodutivo." };
  }

  if (resultado && !isReproResultadoValidForTipo(sexo, tipo, resultado, { strict: true })) {
    return { ok: false, message: MSG_REPRO_RESULTADO_INCOMPATIVEL };
  }

  if (
    showReproDescricaoResultadoOutroManejo(tipo, resultado) &&
    !input.descricaoResultadoOutro?.trim()
  ) {
    return { ok: false, message: "Descreva o resultado do manejo reprodutivo." };
  }

  return { ok: true };
}

/** Exibição da coluna Resultado no histórico (oculta redundâncias masculinas). */
export function formatReproResultadoTabela(
  reg: { tipo?: string | null; resultado?: string | null },
  meta: ReproObservacoesMeta,
  sexo?: string | null,
): string {
  const tipo = (reg.tipo ?? "").trim();
  const resultado = (reg.resultado ?? "").trim();

  if (tipo === "Outro") return "—";

  if (sexo === "macho" && REPRO_TIPOS_MACHO_SEM_RESULTADO.has(tipo)) {
    return "—";
  }

  if (resultado === "Outro" && meta.descricaoResultadoOutro) {
    return meta.descricaoResultadoOutro;
  }

  return resultado || "—";
}

/** Resumo de cria vinculada a um Parto (enriquecimento de reproducao.list). */
export type ReproPartoCriaDetalhe = {
  animalId: number;
  brinco: string;
  ordem: number;
};

/** Formata brincos das crias para a coluna Detalhes do histórico. */
export function formatPartoCriasDetalhes(crias: ReproPartoCriaDetalhe[]): string | null {
  if (!crias.length) return null;
  const sorted = [...crias].sort((a, b) => a.ordem - b.ordem);
  const brincos = sorted.map(c => c.brinco.trim() || `#${c.animalId}`);
  if (brincos.length === 1) return `Cria: ${brincos[0]}`;
  return `Crias: ${brincos.join(", ")}`;
}

/** Cabeçalho da coluna consolidada de detalhes no histórico. */
export function getReproDetalhesTabelaHeader(): string {
  return "Detalhes";
}

/** Consolida reprodutor/sêmen, crias de parto e previsão de parto para a coluna Detalhes. */
export function formatReproDetalhesTabela(
  reg: {
    tipo?: string | null;
    dataPrevistoParto?: Date | string | null;
    crias?: ReproPartoCriaDetalhe[];
  },
  meta: ReproObservacoesMeta,
  formatDate?: (value: Date | string) => string,
): string {
  const parts: string[] = [];
  const tipo = (reg.tipo ?? "").trim();
  const coberturaDetalhe = formatCoberturaAlvoDetalhes(tipo, meta);
  if (coberturaDetalhe) {
    parts.push(coberturaDetalhe);
  } else if (meta.reprodutorSemen) {
    parts.push(meta.reprodutorSemen);
  }

  if (tipo === "Parto" && reg.crias?.length) {
    const criaDetalhe = formatPartoCriasDetalhes(reg.crias);
    if (criaDetalhe) parts.push(criaDetalhe);
  }

  const prevISO = reproDataToInputISO(reg.dataPrevistoParto);
  if (prevISO && shouldCalcPrevisaoParto(tipo)) {
    const prevLabel = formatDate ? formatDate(prevISO) : prevISO;
    parts.push(`Previsão estimada de parto: ${prevLabel}`);
  }
  return parts.join(" · ");
}

export function unpackReproObservacoes(raw: string | null | undefined): ReproObservacoesMeta {
  const empty: ReproObservacoesMeta = {
    observacoes: null,
    reprodutorSemen: null,
    responsavel: null,
    descricaoResultadoOutro: null,
    coberturaAlvo: null,
  };
  if (!raw) return empty;
  const idx = raw.indexOf(META_PREFIX);
  if (idx === -1) {
    const trimmed = raw.trim();
    return { ...empty, observacoes: trimmed || null };
  }
  const obs = raw.slice(0, idx).trim() || null;
  const rest = raw.slice(idx + META_PREFIX.length);
  const end = rest.indexOf(META_SUFFIX);
  if (end === -1) {
    const trimmed = raw.trim();
    return { ...empty, observacoes: trimmed || null };
  }
  try {
    const meta = JSON.parse(rest.slice(0, end)) as {
      r?: string;
      p?: string;
      o?: string;
      cat?: string;
      csm?: string;
      cai?: number;
      caids?: number[];
      cli?: number;
      clb?: string;
      clbs?: string[];
      cln?: string;
    };
    let coberturaAlvo: CoberturaAlvoPersistido | null = null;
    if (meta.cat === "animal" || meta.cat === "lote" || (meta.caids?.length ?? 0) > 0) {
      const animalIds =
        meta.caids?.length && meta.caids.every(id => Number.isFinite(id))
          ? meta.caids
          : meta.cai != null
            ? [meta.cai]
            : [];
      const labelsBrinco =
        meta.clbs?.length && meta.clbs.every(l => typeof l === "string")
          ? meta.clbs.map(l => l.trim()).filter(Boolean)
          : meta.clb?.trim()
            ? [meta.clb.trim()]
            : [];

      const selectionMode: CoberturaAlvoPersistido["selectionMode"] =
        meta.csm === "lote" || (meta.cat === "lote" && animalIds.length === 0)
          ? "lote"
          : "individual";

      coberturaAlvo = {
        selectionMode,
        animalIds,
        labelsBrinco,
        loteId: meta.cli,
        labelLoteNome: meta.cln?.trim() || undefined,
        tipo: meta.cat === "animal" || meta.cat === "lote" ? meta.cat : undefined,
        animalId: meta.cai,
        labelBrinco: meta.clb?.trim() || undefined,
      };
    }
    return {
      observacoes: obs,
      reprodutorSemen: meta.r?.trim() || null,
      responsavel: meta.p?.trim() || null,
      descricaoResultadoOutro: meta.o?.trim() || null,
      coberturaAlvo,
    };
  } catch {
    const trimmed = raw.trim();
    return { ...empty, observacoes: trimmed || null };
  }
}

const TIPOS_CONCEPCAO_REPRO = new Set(["Cobertura", "Inseminação"]);

export type ReproRegistroSituacaoInput = {
  id: number;
  tipo: string;
  dataCobertura: Date | string | null;
  dataPrevistoParto?: Date | string | null;
  resultado?: string | null;
  createdAt?: Date | string | null;
};

export type SituacaoReprodutivaAtual = {
  situacao: string;
  previsaoPartoISO: string | null;
};

type SituacaoReprodutivaKind =
  | "none"
  | "aguardando"
  | "prenha"
  | "vazia"
  | "pendente"
  | "parto"
  | "aborto"
  | "aborto_suspeito";

const SITUACAO_REPRO_LABEL: Record<Exclude<SituacaoReprodutivaKind, "none">, string> = {
  aguardando: "Aguardando diagnóstico",
  prenha: "Prenha",
  vazia: "Vazia",
  pendente: "Diagnóstico pendente",
  parto: "Parto registrado",
  aborto: "Aborto registrado",
  aborto_suspeito: "Aborto suspeito",
};

function reproEventTimestampMs(value: Date | string | null | undefined): number {
  const iso = reproDataToInputISO(value);
  if (!iso) return 0;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function reproCreatedAtMs(value: Date | string | null | undefined): number {
  if (value == null || value === "") return 0;
  const t = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Ordem cronológica crescente; desempate por createdAt e id. */
export function compareReproEventosAsc(
  a: ReproRegistroSituacaoInput,
  b: ReproRegistroSituacaoInput,
): number {
  const ta = reproEventTimestampMs(a.dataCobertura);
  const tb = reproEventTimestampMs(b.dataCobertura);
  if (ta !== tb) return ta - tb;
  const ca = reproCreatedAtMs(a.createdAt);
  const cb = reproCreatedAtMs(b.createdAt);
  if (ca !== cb) return ca - cb;
  return (a.id ?? 0) - (b.id ?? 0);
}

/**
 * Prioridade de estágio reprodutivo no empate de data (situação feminina).
 * Menor valor = processado antes; maior = prevalece no resumo do mesmo dia.
 */
const REPRO_FEMEA_SAME_DAY_STAGE_PRIORITY: Record<string, number> = {
  Cio: 1,
  Cobertura: 2,
  Inseminação: 3,
  "Diagnóstico de prenhez": 4,
  Aborto: 5,
  Parto: 6,
};

const REPRO_FEMEA_SAME_DAY_NEUTRAL_PRIORITY = 3.5;

export function getReproFemeaSameDayStagePriority(tipo: string): number {
  const t = (tipo ?? "").trim();
  return REPRO_FEMEA_SAME_DAY_STAGE_PRIORITY[t] ?? REPRO_FEMEA_SAME_DAY_NEUTRAL_PRIORITY;
}

/**
 * Ordem para deriveSituacaoReprodutivaAtual:
 * data do manejo → estágio semântico (só no empate) → createdAt → id.
 */
export function compareReproEventosFemeaSituacaoAsc(
  a: ReproRegistroSituacaoInput,
  b: ReproRegistroSituacaoInput,
): number {
  const ta = reproEventTimestampMs(a.dataCobertura);
  const tb = reproEventTimestampMs(b.dataCobertura);
  if (ta !== tb) return ta - tb;

  const pa = getReproFemeaSameDayStagePriority(a.tipo ?? "");
  const pb = getReproFemeaSameDayStagePriority(b.tipo ?? "");
  if (pa !== pb) return pa - pb;

  const ca = reproCreatedAtMs(a.createdAt);
  const cb = reproCreatedAtMs(b.createdAt);
  if (ca !== cb) return ca - cb;
  return (a.id ?? 0) - (b.id ?? 0);
}

/** Deriva situação reprodutiva atual a partir do histórico (sem persistir). */
export function deriveSituacaoReprodutivaAtual(
  registros: readonly ReproRegistroSituacaoInput[],
  sexo: string | null | undefined,
): SituacaoReprodutivaAtual | null {
  if (sexo !== "femea" || !registros.length) return null;

  const ordenados = [...registros].sort(compareReproEventosFemeaSituacaoAsc);

  let kind: SituacaoReprodutivaKind = "none";
  let lastConception: ReproRegistroSituacaoInput | null = null;
  let previsaoPartoISO: string | null = null;

  for (const reg of ordenados) {
    const tipo = (reg.tipo ?? "").trim();
    const resultado = (reg.resultado ?? "").trim();

    if (TIPOS_CONCEPCAO_REPRO.has(tipo)) {
      lastConception = reg;
      kind = "aguardando";
      previsaoPartoISO = null;
      continue;
    }

    if (tipo === "Diagnóstico de prenhez") {
      if (resultado === "Prenha") {
        kind = "prenha";
        previsaoPartoISO = lastConception
          ? reproDataToInputISO(lastConception.dataPrevistoParto) || null
          : null;
      } else if (resultado === "Vazia") {
        kind = "vazia";
        previsaoPartoISO = null;
        lastConception = null;
      } else if (resultado === "Repetir" || resultado === "Inconclusivo") {
        kind = "pendente";
        previsaoPartoISO = null;
      }
      continue;
    }

    if (tipo === "Parto") {
      kind = "parto";
      previsaoPartoISO = null;
      lastConception = null;
      continue;
    }

    if (tipo === "Aborto") {
      if (resultado === "Suspeito") {
        kind = "aborto_suspeito";
        if (lastConception) {
          previsaoPartoISO =
            previsaoPartoISO ??
            (reproDataToInputISO(lastConception.dataPrevistoParto) || null);
        }
      } else {
        // Confirmado, Outro ou legado sem resultado — encerra gestação.
        kind = "aborto";
        previsaoPartoISO = null;
        lastConception = null;
      }
      continue;
    }
  }

  if (kind === "none") return null;

  const exibePrevisaoGestacao =
    kind === "prenha" || kind === "aborto_suspeito";

  return {
    situacao: SITUACAO_REPRO_LABEL[kind],
    previsaoPartoISO: exibePrevisaoGestacao ? previsaoPartoISO : null,
  };
}

const TIPOS_ESTADO_REPRODUTOR_MACHO = new Set([
  "Uso como reprodutor",
  "Retirada da reprodução",
]);

export type ReproRegistroResumoMachoInput = ReproRegistroSituacaoInput & {
  observacoes?: string | null;
};

export type ResumoReprodutivoMacho = {
  situacaoReprodutiva: string | null;
  ultimoExameResultado: string | null;
  ultimoExameDataISO: string | null;
};

/** Deriva resumo reprodutivo masculino a partir do histórico (sem persistir). */
export function deriveResumoReprodutivoMacho(
  registros: readonly ReproRegistroResumoMachoInput[],
  sexo: string | null | undefined,
): ResumoReprodutivoMacho | null {
  if (sexo !== "macho" || !registros.length) return null;

  const ordenados = [...registros].sort(compareReproEventosAsc);

  const eventosEstado = ordenados.filter(r =>
    TIPOS_ESTADO_REPRODUTOR_MACHO.has((r.tipo ?? "").trim()),
  );
  const exames = ordenados.filter(r => (r.tipo ?? "").trim() === "Exame andrológico");

  if (eventosEstado.length === 0 && exames.length === 0) return null;

  let situacaoReprodutiva: string | null = null;
  if (eventosEstado.length > 0) {
    const ultimoEstado = eventosEstado[eventosEstado.length - 1]!;
    const tipoEstado = (ultimoEstado.tipo ?? "").trim();
    if (tipoEstado === "Uso como reprodutor") {
      situacaoReprodutiva = "Em reprodução";
    } else if (tipoEstado === "Retirada da reprodução") {
      situacaoReprodutiva = "Retirado da reprodução";
    }
  }

  let ultimoExameResultado: string | null = null;
  let ultimoExameDataISO: string | null = null;
  if (exames.length > 0) {
    const ultimoExame = exames[exames.length - 1]!;
    ultimoExameDataISO = reproDataToInputISO(ultimoExame.dataCobertura) || null;
    const meta = unpackReproObservacoes(ultimoExame.observacoes);
    const resultadoFmt = formatReproResultadoTabela(ultimoExame, meta, "macho");
    ultimoExameResultado = resultadoFmt === "—" ? "Sem registro" : resultadoFmt;
  } else if (eventosEstado.length > 0) {
    ultimoExameResultado = "Sem registro";
  }

  return {
    situacaoReprodutiva,
    ultimoExameResultado,
    ultimoExameDataISO,
  };
}
