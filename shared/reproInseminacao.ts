import {
  parseSemenCustoTotal,
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_ORIGEM_INTERNO,
  type SemenOrigemReprodutor,
} from "./semenEstoque";

/** ECC bovino — escala 1 a 5 com incrementos de 0,5 (sem convenção prévia no produto). */
export const REPRO_ECC_MIN = 1;
export const REPRO_ECC_MAX = 5;
export const REPRO_ECC_STEP = 0.5;

export const MSG_REPRO_ECC_INVALIDO =
  "ECC deve estar entre 1 e 5 (ex.: 3 ou 3,5).";

export const MSG_REPRO_CUSTO_DOSE_EXTERNO_OBRIGATORIO =
  "Informe o custo da dose para registrar uma inseminação com sêmen externo.";

/** Remove `%` e caracteres inválidos durante digitação — ECC não é percentual. */
export function sanitizeReproEccInputString(value: string): string {
  let cleaned = value.replace(/%/g, "").replace(/[^\d,.]/g, "");
  const sepMatch = cleaned.match(/[,.]/);
  if (!sepMatch || sepMatch.index == null) return cleaned;
  const sepIndex = sepMatch.index;
  const before = cleaned.slice(0, sepIndex + 1);
  const after = cleaned.slice(sepIndex + 1).replace(/[,.]/g, "");
  return before + after;
}

/** Normaliza entrada de ECC (aceita vírgula ou ponto). */
export function parseReproEccInput(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = sanitizeReproEccInputString(value.trim());
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Valida ECC opcional — ausência é válida. */
export function validateReproEcc(
  value: string | number | null | undefined,
): { ok: true; value?: number } | { ok: false; message: string } {
  const parsed = parseReproEccInput(value);
  if (parsed == null) {
    if (typeof value === "string" && value.trim()) {
      return { ok: false, message: MSG_REPRO_ECC_INVALIDO };
    }
    return { ok: true };
  }
  if (parsed < REPRO_ECC_MIN || parsed > REPRO_ECC_MAX) {
    return { ok: false, message: MSG_REPRO_ECC_INVALIDO };
  }
  const scaled = Math.round(parsed * 2);
  if (scaled / 2 !== parsed) {
    return { ok: false, message: MSG_REPRO_ECC_INVALIDO };
  }
  return { ok: true, value: scaled / 2 };
}

/** Custo da dose obrigatório e positivo em novas IAs com sêmen/reprodutor externo. */
export function validateReproCustoDoseInseminacaoExterna(
  custoDoseSemen: number | null | undefined,
): { ok: true; value: number } | { ok: false; message: string } {
  const n = Number(custoDoseSemen);
  if (!Number.isFinite(n) || !(n > 0)) {
    return { ok: false, message: MSG_REPRO_CUSTO_DOSE_EXTERNO_OBRIGATORIO };
  }
  return { ok: true, value: n };
}

/**
 * Origem da IA no create: touro do rebanho (`machoId`) = interno;
 * sêmen/reprodutor externo preenchido = externo.
 */
export function resolveOrigemSemenInseminacao(params: {
  tipo: string;
  sexoAnimal?: string | null;
  machoId?: number | null;
  reprodutorSemen?: string | null;
}): SemenOrigemReprodutor | null {
  if (String(params.tipo ?? "").trim() !== "Inseminação") return null;
  if (params.sexoAnimal !== "femea") return null;
  if (params.machoId != null && params.machoId > 0) return SEMEN_ORIGEM_INTERNO;
  if (String(params.reprodutorSemen ?? "").trim()) return SEMEN_ORIGEM_EXTERNO;
  return null;
}

/** Backend: só IA externa exige custo positivo. Interna e demais eventos passam. */
export function assertCustoDoseInseminacaoCreate(
  origem: SemenOrigemReprodutor | null,
  custoDoseSemen: number | null | undefined,
): { ok: true } | { ok: false; message: string } {
  if (origem !== SEMEN_ORIGEM_EXTERNO) return { ok: true };
  const validacao = validateReproCustoDoseInseminacaoExterna(custoDoseSemen);
  return validacao.ok ? { ok: true } : validacao;
}

/** Frontend: Salvar só libera custo quando origem externa e o valor parseado é > 0. */
export function custoDoseInseminacaoExternaInformado(
  origemExterna: boolean,
  custoRaw: unknown,
): boolean {
  if (!origemExterna) return true;
  return validateReproCustoDoseInseminacaoExterna(parseSemenCustoTotal(custoRaw)).ok;
}

/** Exibição pt-BR — ex.: 3,5 */
export function formatReproEccDisplay(ecc: number): string {
  return ecc.toLocaleString("pt-BR", {
    minimumFractionDigits: ecc % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

export type ReproInseminacaoExtras = {
  partidaSemen?: string | null;
  inseminador?: string | null;
  ecc?: number | null;
};

export function normalizeReproInseminacaoExtras(
  input: ReproInseminacaoExtras | null | undefined,
): ReproInseminacaoExtras {
  return {
    partidaSemen: input?.partidaSemen?.trim() || undefined,
    inseminador: input?.inseminador?.trim() || undefined,
    ecc: input?.ecc ?? undefined,
  };
}
