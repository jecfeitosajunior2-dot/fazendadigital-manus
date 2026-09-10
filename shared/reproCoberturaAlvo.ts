import type { ReproObservacoesMeta } from "./reproRegistroMeta";

export const MSG_REPRO_MATRIZ_INELEGIVEL =
  "O animal selecionado não é uma matriz elegível para cobertura.";

export const MSG_REPRO_LOTE_INELEGIVEL =
  "O lote selecionado não possui matrizes elegíveis para cobertura.";

export const MSG_REPRO_COBERTURA_ALVO_OBRIGATORIO =
  "Selecione a forma de seleção e as matrizes atendidas na cobertura.";

export const MSG_REPRO_COBERTURA_MATRIZES_OBRIGATORIAS =
  "Selecione pelo menos uma matriz atendida.";

/** Modo de seleção na UI / persistência nova. */
export type CoberturaSelecaoModo = "individual" | "lote";

/** Valor legado em registros antigos (cat=animal|lote). */
export type CoberturaAlvoTipoLegacy = "animal" | "lote";

/** Referência estruturada persistida na metadata do registro reprodutivo. */
export type CoberturaAlvoPersistido = {
  selectionMode: CoberturaSelecaoModo;
  animalIds: number[];
  labelsBrinco: string[];
  /** Contexto operacional quando a seleção partiu de um lote. */
  loteId?: number;
  labelLoteNome?: string;
  /** Campos legados (leitura de registros antigos). */
  tipo?: CoberturaAlvoTipoLegacy;
  animalId?: number;
  labelBrinco?: string;
};

export const COBERTURA_HISTORICO_MAX_LABELS_INLINE = 8;

export function isEstacaoMontaMacho(tipo: string): boolean {
  return tipo.trim() === "Estação de monta";
}

/** Cobertura permite matriz individual ou lote; estação de monta só lote. */
export function coberturaAlvoPermiteModoIndividual(tipo: string): boolean {
  return tipo.trim() === "Cobertura realizada";
}

export function showReproCoberturaAlvoFieldManejo(
  tipo: string,
  sexo: string | null | undefined,
): boolean {
  if (sexo !== "macho") return false;
  const t = tipo.trim();
  return t === "Cobertura realizada" || t === "Estação de monta";
}

function isLegacyLoteSomente(alvo: CoberturaAlvoPersistido): boolean {
  return (
    alvo.tipo === "lote" &&
    alvo.animalIds.length === 0 &&
    alvo.loteId != null &&
    Boolean(alvo.labelLoteNome)
  );
}

function formatLabelsMatrizesHistorico(labels: string[]): string {
  const limpos = labels.map(l => l.trim()).filter(Boolean);
  if (limpos.length === 0) return "";
  if (limpos.length === 1) return `Matriz: ${limpos[0]}`;
  if (limpos.length <= COBERTURA_HISTORICO_MAX_LABELS_INLINE) {
    return `Matrizes: ${limpos.join(", ")}`;
  }
  const amostra = limpos.slice(0, COBERTURA_HISTORICO_MAX_LABELS_INLINE).join(", ");
  return `Matrizes: ${limpos.length} selecionadas · ${amostra}, …`;
}

function formatAlvoMatrizesFromMeta(meta: ReproObservacoesMeta): string | null {
  const alvo = meta.coberturaAlvo;
  if (alvo) {
    if (isLegacyLoteSomente(alvo)) {
      return `Lote: ${alvo.labelLoteNome}`;
    }

    const matrizPart = formatLabelsMatrizesHistorico(alvo.labelsBrinco);
    if (matrizPart) {
      if (alvo.selectionMode === "lote" && alvo.labelLoteNome) {
        return `${matrizPart} · Lote de origem: ${alvo.labelLoteNome}`;
      }
      return matrizPart;
    }

    if (alvo.tipo === "animal" && alvo.labelBrinco) {
      return `Matriz: ${alvo.labelBrinco}`;
    }
    if (alvo.tipo === "lote" && alvo.labelLoteNome) {
      return `Lote: ${alvo.labelLoteNome}`;
    }
  }

  if (meta.reprodutorSemen) {
    return `Matriz / Lote atendido: ${meta.reprodutorSemen}`;
  }
  return null;
}

/** Formata detalhes do alvo da cobertura (nova metadata ou legado). */
export function formatCoberturaAlvoDetalhes(
  tipoRegistro: string,
  meta: ReproObservacoesMeta,
): string | null {
  if ((tipoRegistro ?? "").trim() !== "Cobertura realizada") return null;
  return formatAlvoMatrizesFromMeta(meta);
}

/** Detalhes de matrizes/lote para cobertura realizada e estação de monta (macho). */
export function formatAlvoMatrizesMachoDetalhes(
  tipoRegistro: string,
  meta: ReproObservacoesMeta,
): string | null {
  const t = (tipoRegistro ?? "").trim();
  if (t !== "Cobertura realizada" && t !== "Estação de monta") return null;
  const base = formatAlvoMatrizesFromMeta(meta);
  if (base && t === "Estação de monta") return `Estação · ${base}`;
  return base;
}

