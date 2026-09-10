import {
  deriveSituacaoReprodutivaAtual,
  reproDataToInputISO,
  TIPOS_SERVICO_REPRO_FEMEA,
  type ReproRegistroSituacaoInput,
} from "./reproRegistroMeta";

export const TIPO_EXPOSICAO_MONTA = "Exposição à monta" as const;

/** Parâmetros padrão — ajustáveis por fazenda no futuro. */
export type ReproPipelineConfig = {
  maxTentativasIatfAntesMonta: number;
  diasParaDgAposInseminacao: number;
  diasParaDgAposMonta: number;
  sugerirDescarteAposMontaVazia: boolean;
};

export const DEFAULT_REPRO_PIPELINE_CONFIG: ReproPipelineConfig = {
  maxTentativasIatfAntesMonta: 2,
  diasParaDgAposInseminacao: 30,
  diasParaDgAposMonta: 60,
  sugerirDescarteAposMontaVazia: true,
};

export type MatrizPipelineFlag =
  | "dg_vencido"
  | "em_monta_aguardando_dg"
  | "pos_iatf_aguardando_dg"
  | "multiplas_iatf"
  | "candidata_revisao_descarte";

export const MATRIZ_PIPELINE_FLAG_LABEL: Record<MatrizPipelineFlag, string> = {
  dg_vencido: "Diagnóstico vencido",
  em_monta_aguardando_dg: "Em monta — aguardando DG",
  pos_iatf_aguardando_dg: "Pós-IATF — aguardando DG",
  multiplas_iatf: "Várias IATF no ciclo",
  candidata_revisao_descarte: "Revisar descarte",
};

const TIPOS_SERVICO = new Set<string>(TIPOS_SERVICO_REPRO_FEMEA);

export type MatrizPipelineSnapshot = {
  situacaoAtual: string | null;
  ultimoServicoTipo: string | null;
  ultimoServicoDataISO: string | null;
  tentativasIatfNoCiclo: number;
  flags: MatrizPipelineFlag[];
  diasDesdeUltimoServico: number | null;
  diasAteLimiteDg: number | null;
};

function parseRefDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = parseRefDate(fromISO).getTime();
  const b = parseRefDate(toISO).getTime();
  return Math.floor((b - a) / 86400000);
}

function sortAsc(regs: ReproRegistroSituacaoInput[]): ReproRegistroSituacaoInput[] {
  return [...regs].sort((a, b) => {
    const da = reproDataToInputISO(a.dataCobertura) ?? "";
    const db = reproDataToInputISO(b.dataCobertura) ?? "";
    if (da !== db) return da.localeCompare(db);
    return (a.id ?? 0) - (b.id ?? 0);
  });
}

function lastService(regs: ReproRegistroSituacaoInput[]): ReproRegistroSituacaoInput | null {
  for (let i = regs.length - 1; i >= 0; i--) {
    if (TIPOS_SERVICO.has((regs[i]!.tipo ?? "").trim())) return regs[i]!;
  }
  return null;
}

function hasDgAfterService(
  regs: ReproRegistroSituacaoInput[],
  service: ReproRegistroSituacaoInput,
): boolean {
  const serviceDate = reproDataToInputISO(service.dataCobertura) ?? "";
  const serviceId = service.id ?? 0;
  for (const reg of regs) {
    const d = reproDataToInputISO(reg.dataCobertura) ?? "";
    if (d < serviceDate) continue;
    if (d === serviceDate && (reg.id ?? 0) <= serviceId) continue;
    if ((reg.tipo ?? "").trim() === "Diagnóstico de prenhez") return true;
  }
  return false;
}

function countInseminacoesSinceParto(regs: ReproRegistroSituacaoInput[]): number {
  let count = 0;
  for (const reg of regs) {
    if ((reg.tipo ?? "").trim() === "Parto") {
      count = 0;
      continue;
    }
    if ((reg.tipo ?? "").trim() === "Inseminação") count++;
  }
  return count;
}

function isCandidataRevisaoDescarte(regs: ReproRegistroSituacaoInput[]): boolean {
  const sorted = sortAsc(regs);
  const last = sorted[sorted.length - 1];
  if (!last || (last.tipo ?? "").trim() !== "Diagnóstico de prenhez") return false;
  if ((last.resultado ?? "").trim() !== "Vazia") return false;

  for (let i = sorted.length - 2; i >= 0; i--) {
    const t = (sorted[i]!.tipo ?? "").trim();
    if (t === TIPO_EXPOSICAO_MONTA) return true;
    if (t === "Diagnóstico de prenhez" && sorted[i]!.resultado === "Prenha") return false;
    if (t === "Parto") break;
  }
  return false;
}

function prazoDgParaServico(tipo: string, config: ReproPipelineConfig): number {
  if (tipo === TIPO_EXPOSICAO_MONTA || tipo === "Cobertura") {
    return config.diasParaDgAposMonta;
  }
  return config.diasParaDgAposInseminacao;
}

/** Analisa o histórico reprodutivo de uma matriz (flags operacionais configuráveis). */
export function analyzeMatrizReproPipeline(
  registros: readonly ReproRegistroSituacaoInput[],
  config: ReproPipelineConfig = DEFAULT_REPRO_PIPELINE_CONFIG,
  referenceDateISO?: string,
): MatrizPipelineSnapshot | null {
  if (!registros.length) return null;

  const refISO = referenceDateISO ?? new Date().toISOString().slice(0, 10);
  const sorted = sortAsc([...registros]);
  const situacao = deriveSituacaoReprodutivaAtual(sorted, "femea");
  const service = lastService(sorted);
  const flags = new Set<MatrizPipelineFlag>();

  const tentativasIatf = countInseminacoesSinceParto(sorted);
  if (tentativasIatf >= config.maxTentativasIatfAntesMonta) {
    flags.add("multiplas_iatf");
  }

  if (config.sugerirDescarteAposMontaVazia && isCandidataRevisaoDescarte(sorted)) {
    flags.add("candidata_revisao_descarte");
  }

  let diasDesdeUltimoServico: number | null = null;
  let diasAteLimiteDg: number | null = null;
  let ultimoServicoTipo: string | null = null;
  let ultimoServicoDataISO: string | null = null;

  if (service) {
    ultimoServicoTipo = (service.tipo ?? "").trim() || null;
    ultimoServicoDataISO = reproDataToInputISO(service.dataCobertura);
    const aguardandoDg = !hasDgAfterService(sorted, service);

    if (ultimoServicoDataISO && ultimoServicoTipo) {
      diasDesdeUltimoServico = daysBetween(ultimoServicoDataISO, refISO);
      const prazo = prazoDgParaServico(ultimoServicoTipo, config);
      diasAteLimiteDg = prazo - diasDesdeUltimoServico;

      if (aguardandoDg) {
        if (ultimoServicoTipo === TIPO_EXPOSICAO_MONTA) {
          flags.add("em_monta_aguardando_dg");
        } else if (ultimoServicoTipo === "Inseminação") {
          flags.add("pos_iatf_aguardando_dg");
        }
        if (diasDesdeUltimoServico > prazo) {
          flags.add("dg_vencido");
        }
      }
    }
  }

  return {
    situacaoAtual: situacao?.situacao ?? null,
    ultimoServicoTipo,
    ultimoServicoDataISO,
    tentativasIatfNoCiclo: tentativasIatf,
    flags: [...flags],
    diasDesdeUltimoServico,
    diasAteLimiteDg,
  };
}

export function filterMatrizesPorPipelineFlag(
  items: Array<{ femeaId: number; registros: readonly ReproRegistroSituacaoInput[] }>,
  flag: MatrizPipelineFlag,
  config: ReproPipelineConfig = DEFAULT_REPRO_PIPELINE_CONFIG,
  referenceDateISO?: string,
): Array<{ femeaId: number; snapshot: MatrizPipelineSnapshot }> {
  const out: Array<{ femeaId: number; snapshot: MatrizPipelineSnapshot }> = [];
  for (const item of items) {
    const snapshot = analyzeMatrizReproPipeline(item.registros, config, referenceDateISO);
    if (snapshot?.flags.includes(flag)) {
      out.push({ femeaId: item.femeaId, snapshot });
    }
  }
  return out;
}
