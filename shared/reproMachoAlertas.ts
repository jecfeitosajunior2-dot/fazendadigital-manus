import {
  compareReproEventosAsc,
  deriveResumoReprodutivoMacho,
  reproDataToInputISO,
  shouldShowReproRegistroNaFichaAnimal,
  type ReproRegistroFichaAnimalRef,
  type ReproRegistroResumoMachoInput,
} from "./reproRegistroMeta";

export type MachoReproAlertasConfig = {
  diasValidadeExameAndrologico: number;
};

export const DEFAULT_MACHO_REPRO_ALERTAS_CONFIG: MachoReproAlertasConfig = {
  diasValidadeExameAndrologico: 365,
};

export type MachoReproFlag =
  | "exame_andrologico_vencido"
  | "sem_exame_andrologico"
  | "inapto_em_reproducao";

export const MACHO_REPRO_FLAG_LABEL: Record<MachoReproFlag, string> = {
  exame_andrologico_vencido: "Exame andrológico vencido",
  sem_exame_andrologico: "Sem exame andrológico",
  inapto_em_reproducao: "Inapto em reprodução",
};

export const MACHO_REPRO_ALERTA_CURRAL_MENSAGEM: Record<MachoReproFlag, string> = {
  sem_exame_andrologico: "Touro em reprodução sem exame andrológico registrado.",
  exame_andrologico_vencido: "Exame andrológico vencido (validade de 12 meses).",
  inapto_em_reproducao: "Último exame andrológico: Inapto.",
};

export type ReproRegistroMachoAlertasInput = ReproRegistroResumoMachoInput &
  ReproRegistroFichaAnimalRef;

const TIPOS_MACHO_SUPRIMEM_ALERTA_EXAME_CURRAL = new Set([
  "Exame andrológico",
  "Retirada da reprodução",
]);

export type MachoReproAlertasSnapshot = {
  situacaoReprodutiva: string | null;
  ultimoExameResultado: string | null;
  ultimoExameDataISO: string | null;
  emReproducao: boolean;
  flags: MachoReproFlag[];
};

function parseRefDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.floor(
    (parseRefDate(toISO).getTime() - parseRefDate(fromISO).getTime()) / 86400000,
  );
}

function ultimoExameAndrologico(
  registros: readonly ReproRegistroResumoMachoInput[],
): ReproRegistroResumoMachoInput | null {
  const exames = [...registros]
    .filter(r => (r.tipo ?? "").trim() === "Exame andrológico")
    .sort(compareReproEventosAsc);
  if (!exames.length) return null;
  return exames[exames.length - 1]!;
}

/** Histórico filtrado da ficha + alertas (curral e detalhes do animal). */
export function getMachoReproAlertasParaFichaAnimal(
  registros: readonly ReproRegistroMachoAlertasInput[],
  animalId: number,
  animalSexo: string | null | undefined,
  referenceDateISO?: string,
  config: MachoReproAlertasConfig = DEFAULT_MACHO_REPRO_ALERTAS_CONFIG,
): MachoReproAlertasSnapshot | null {
  if (animalSexo !== "macho") return null;
  const filtrados = registros.filter(r =>
    shouldShowReproRegistroNaFichaAnimal(r, animalId, animalSexo),
  );
  return analyzeMachoReproAlertas(filtrados, animalSexo, config, referenceDateISO);
}

export function formatMachoReproAlertaCurralTexto(flags: readonly MachoReproFlag[]): string | null {
  if (!flags.length) return null;
  const partes = flags.map(f => MACHO_REPRO_ALERTA_CURRAL_MENSAGEM[f]);
  return `${partes.join(" ")} Registre o exame no curral ou prossiga ciente do risco.`;
}

/** Exibe banner de alerta no curral (exceto ao registrar exame ou retirada). */
export function shouldShowMachoReproAlertaCurral(
  tipoReprodutivo: string,
  flags: readonly MachoReproFlag[],
): boolean {
  if (!flags.length) return false;
  const tipo = tipoReprodutivo.trim();
  if (!tipo) return true;
  return !TIPOS_MACHO_SUPRIMEM_ALERTA_EXAME_CURRAL.has(tipo);
}

export function machoReproAlertaCurralSeverity(
  flags: readonly MachoReproFlag[],
): "danger" | "warning" | "info" {
  if (flags.includes("inapto_em_reproducao")) return "danger";
  if (
    flags.includes("exame_andrologico_vencido") ||
    flags.includes("sem_exame_andrologico")
  ) {
    return "warning";
  }
  return "info";
}

/** Flags operacionais para touros (exame vencido, inapto ativo, etc.). */
export function analyzeMachoReproAlertas(
  registros: readonly ReproRegistroResumoMachoInput[],
  sexo: string | null | undefined,
  config: MachoReproAlertasConfig = DEFAULT_MACHO_REPRO_ALERTAS_CONFIG,
  referenceDateISO?: string,
): MachoReproAlertasSnapshot | null {
  if (sexo !== "macho" || !registros.length) return null;

  const resumo = deriveResumoReprodutivoMacho(registros, sexo);
  if (!resumo) return null;

  const refISO = referenceDateISO ?? new Date().toISOString().slice(0, 10);
  const emReproducao = resumo.situacaoReprodutiva === "Em reprodução";
  const flags = new Set<MachoReproFlag>();

  const ultimoExame = ultimoExameAndrologico(registros);
  const ultimoExameDataISO = ultimoExame
    ? reproDataToInputISO(ultimoExame.dataCobertura) || null
    : null;
  const ultimoExameResultadoRaw = (ultimoExame?.resultado ?? "").trim();

  if (emReproducao && ultimoExameResultadoRaw === "Inapto") {
    flags.add("inapto_em_reproducao");
  }

  if (emReproducao && !ultimoExameDataISO) {
    flags.add("sem_exame_andrologico");
  }

  if (
    ultimoExameDataISO &&
    daysBetween(ultimoExameDataISO, refISO) > config.diasValidadeExameAndrologico
  ) {
    flags.add("exame_andrologico_vencido");
  }

  return {
    situacaoReprodutiva: resumo.situacaoReprodutiva,
    ultimoExameResultado: resumo.ultimoExameResultado,
    ultimoExameDataISO: resumo.ultimoExameDataISO,
    emReproducao,
    flags: [...flags],
  };
}
