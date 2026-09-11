import {
  DEFAULT_REPRO_PIPELINE_CONFIG,
  type ReproPipelineConfig,
} from "./reproPipeline";

export type ReproPipelineConfigInput = Partial<ReproPipelineConfig>;

const LIMITES = {
  maxTentativasIatfAntesMonta: { min: 1, max: 10 },
  diasParaDgAposInseminacao: { min: 15, max: 120 },
  diasParaDgAposMonta: { min: 30, max: 180 },
} as const;

export function mergeReproPipelineConfig(
  partial?: ReproPipelineConfigInput | null,
): ReproPipelineConfig {
  return {
    maxTentativasIatfAntesMonta: clampInt(
      partial?.maxTentativasIatfAntesMonta,
      LIMITES.maxTentativasIatfAntesMonta,
      DEFAULT_REPRO_PIPELINE_CONFIG.maxTentativasIatfAntesMonta,
    ),
    diasParaDgAposInseminacao: clampInt(
      partial?.diasParaDgAposInseminacao,
      LIMITES.diasParaDgAposInseminacao,
      DEFAULT_REPRO_PIPELINE_CONFIG.diasParaDgAposInseminacao,
    ),
    diasParaDgAposMonta: clampInt(
      partial?.diasParaDgAposMonta,
      LIMITES.diasParaDgAposMonta,
      DEFAULT_REPRO_PIPELINE_CONFIG.diasParaDgAposMonta,
    ),
    sugerirDescarteAposMontaVazia:
      partial?.sugerirDescarteAposMontaVazia ??
      DEFAULT_REPRO_PIPELINE_CONFIG.sugerirDescarteAposMontaVazia,
  };
}

export function parseReproPipelineConfigJson(
  raw: string | null | undefined,
): ReproPipelineConfig {
  if (!raw?.trim()) return { ...DEFAULT_REPRO_PIPELINE_CONFIG };
  try {
    const parsed = JSON.parse(raw) as ReproPipelineConfigInput;
    return mergeReproPipelineConfig(parsed);
  } catch {
    return { ...DEFAULT_REPRO_PIPELINE_CONFIG };
  }
}

export function serializeReproPipelineConfigJson(config: ReproPipelineConfig): string {
  return JSON.stringify(mergeReproPipelineConfig(config));
}

/** Resumo curto para barra de parâmetros no curral. */
export function formatReproPipelineConfigResumo(config: ReproPipelineConfig): string {
  const c = mergeReproPipelineConfig(config);
  const descarte = c.sugerirDescarteAposMontaVazia ? " · alerta descarte" : "";
  return `DG ${c.diasParaDgAposInseminacao} / ${c.diasParaDgAposMonta} dias · máx. ${c.maxTentativasIatfAntesMonta} IATF${descarte}`;
}

function clampInt(
  value: number | undefined,
  limit: { min: number; max: number },
  fallback: number,
): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(limit.max, Math.max(limit.min, Math.round(value)));
}
