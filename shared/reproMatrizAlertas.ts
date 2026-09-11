import {
  analyzeMatrizReproPipeline,
  MATRIZ_PIPELINE_FLAG_LABEL,
  type MatrizPipelineFlag,
  type MatrizPipelineSnapshot,
  type ReproPipelineConfig,
} from "./reproPipeline";
import {
  shouldShowReproRegistroNaFichaAnimal,
  type ReproRegistroFichaAnimalRef,
  type ReproRegistroSituacaoInput,
} from "./reproRegistroMeta";
import { mergeReproPipelineConfig } from "./reproPipelineConfig";

export type ReproRegistroMatrizAlertasInput = ReproRegistroSituacaoInput &
  ReproRegistroFichaAnimalRef;

const TIPOS_MATRIZ_SUPRIMEM_ALERTA_CURRAL = new Set([
  "Diagnóstico de prenhez",
  "Parto",
  "Aborto",
]);

export function getMatrizReproPipelineParaCurral(
  registros: readonly ReproRegistroMatrizAlertasInput[],
  animalId: number,
  animalSexo: string | null | undefined,
  config?: ReproPipelineConfig,
  referenceDateISO?: string,
): MatrizPipelineSnapshot | null {
  if (animalSexo !== "femea") return null;
  const filtrados = registros.filter(r =>
    shouldShowReproRegistroNaFichaAnimal(r, animalId, animalSexo),
  );
  return analyzeMatrizReproPipeline(
    filtrados,
    mergeReproPipelineConfig(config),
    referenceDateISO,
  );
}

export function formatMatrizReproAlertaCurralTexto(
  snapshot: MatrizPipelineSnapshot,
): string | null {
  if (!snapshot.flags.length) return null;
  const partes = snapshot.flags.map(f => MATRIZ_PIPELINE_FLAG_LABEL[f]);
  if (snapshot.diasAteLimiteDg != null && snapshot.diasAteLimiteDg < 0) {
    return `${partes.join(" · ")} Registre o diagnóstico de prenhez quando possível.`;
  }
  if (snapshot.diasAteLimiteDg != null && snapshot.diasAteLimiteDg >= 0) {
    return `${partes.join(" · ")} Limite de DG em ${snapshot.diasAteLimiteDg} dia(s).`;
  }
  return `${partes.join(" · ")}`;
}

export function shouldShowMatrizReproAlertaCurral(
  tipoReprodutivo: string,
  flags: readonly MatrizPipelineFlag[],
): boolean {
  if (!flags.length) return false;
  const tipo = tipoReprodutivo.trim();
  if (!tipo) return true;
  return !TIPOS_MATRIZ_SUPRIMEM_ALERTA_CURRAL.has(tipo);
}

export function matrizReproAlertaCurralSeverity(
  flags: readonly MatrizPipelineFlag[],
): "danger" | "warning" | "info" {
  if (flags.includes("candidata_revisao_descarte")) return "danger";
  if (flags.includes("dg_vencido")) return "warning";
  if (
    flags.includes("em_monta_aguardando_dg") ||
    flags.includes("pos_iatf_aguardando_dg")
  ) {
    return "info";
  }
  return "info";
}
