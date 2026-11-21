import { z } from "zod";
import { isCategoriaValidaParaSexo } from "../shared/animal-types";
import { getReproFemeaSameDayStagePriority, reproDataToInputISO } from "../shared/reproRegistroMeta";

export const MSG_PARTO_CRIAS_OBRIGATORIAS =
  "Informe ao menos uma cria para parto com nascimento vivo.";
export const MSG_PARTO_NATIMORTO_SEM_CRIAS =
  "Parto natimorto não deve incluir cadastro de crias.";
export const MSG_PARTO_FEMEA_OBRIGATORIA =
  "O parto deve ser registrado para uma fêmea.";
export const MSG_PARTO_BRINCO_DUPLICADO_LOTE =
  "Há brincos repetidos entre as crias deste parto.";
export const MSG_PARTO_CATEGORIA_OBRIGATORIA = "Informe a categoria de cada cria.";
export const MSG_PARTO_CATEGORIA_INCOMPATIVEL =
  "Categoria incompatível com o sexo da cria.";

function sexoCriaParaCadastro(sexo: "macho" | "femea"): "Macho" | "Fêmea" {
  return sexo === "macho" ? "Macho" : "Fêmea";
}

const TIPOS_CONCEPCAO = new Set(["Cobertura", "Inseminação", "Exposição à monta"]);

export const criaPartoInputSchema = z.object({
  brinco: z.string().min(1, "Brinco é obrigatório."),
  brincoEletronico: z.string().optional(),
  sexo: z.enum(["macho", "femea"]),
  categoria: z.string().optional(),
  raca: z.string().optional(),
  nome: z.string().optional(),
  pesoNascimento: z.string().optional(),
  ordem: z.number().int().positive().optional(),
  loteId: z.number().optional(),
  pastoId: z.number().optional(),
});

export const registrarPartoComCriasInputSchema = z.object({
  femeaId: z.number(),
  fazendaId: z.number(),
  dataParto: z.string(),
  resultado: z.enum(["Normal", "Com assistência", "Natimorto", "Outro"]),
  descricaoResultadoOutro: z.string().optional(),
  observacoes: z.string().optional(),
  responsavel: z.string().optional(),
  machoId: z.number().optional(),
  crias: z.array(criaPartoInputSchema).optional(),
});

export type RegistrarPartoComCriasInput = z.infer<typeof registrarPartoComCriasInputSchema>;

export type ReproRegistroPaiRef = {
  id?: number;
  tipo: string;
  machoId?: number | null;
  dataCobertura: string | Date;
  resultado?: string | null;
  createdAt?: string | Date | null;
};

type ReproRegistroPaiRefComData = ReproRegistroPaiRef & { dataISO: string };

function reproCreatedAtMs(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function isReproCycleClosingEvent(reg: ReproRegistroPaiRef): boolean {
  const tipo = String(reg.tipo).trim();
  if (tipo === "Parto") return true;
  if (tipo === "Aborto") {
    const resultado = String(reg.resultado ?? "").trim();
    return resultado !== "Suspeito";
  }
  return false;
}

function compareReproRegistrosDesc(a: ReproRegistroPaiRefComData, b: ReproRegistroPaiRefComData): number {
  const cmp = String(b.dataISO).localeCompare(String(a.dataISO));
  if (cmp !== 0) return cmp;
  const pa = getReproFemeaSameDayStagePriority(a.tipo);
  const pb = getReproFemeaSameDayStagePriority(b.tipo);
  if (pa !== pb) return pb - pa;
  const ca = reproCreatedAtMs(a.createdAt);
  const cb = reproCreatedAtMs(b.createdAt);
  if (ca !== cb) return cb - ca;
  return (b.id ?? 0) - (a.id ?? 0);
}

export function resolveCycleStartExclusiveISO(
  registros: ReproRegistroPaiRef[],
  dataPartoISO: string,
): string | null {
  const closings = registros
    .filter(isReproCycleClosingEvent)
    .map((r) => ({ ...r, dataISO: reproDataToInputISO(r.dataCobertura) ?? "" }))
    .filter((r) => r.dataISO && r.dataISO <= dataPartoISO)
    .sort(compareReproRegistrosDesc);
  return closings[0]?.dataISO ?? null;
}

export function resolvePaiIdFromRegistros(
  registros: ReproRegistroPaiRef[],
  dataPartoISO: string,
  machoIdOverride?: number | null,
): number | null {
  if (machoIdOverride != null && machoIdOverride > 0) return machoIdOverride;
  const cycleStartExclusive = resolveCycleStartExclusiveISO(registros, dataPartoISO);
  const concepcoes = registros
    .filter((r) => TIPOS_CONCEPCAO.has(String(r.tipo).trim()))
    .map((r) => ({ ...r, dataISO: reproDataToInputISO(r.dataCobertura) ?? "" }))
    .filter((r) => {
      if (!r.dataISO || r.dataISO > dataPartoISO) return false;
      if (cycleStartExclusive && r.dataISO <= cycleStartExclusive) return false;
      return true;
    })
    .sort(compareReproRegistrosDesc);
  for (const concepcao of concepcoes) {
    if (concepcao.machoId != null && concepcao.machoId > 0) return concepcao.machoId;
  }
  return null;
}

export function validateRegistrarPartoComCriasBusinessRules(
  input: RegistrarPartoComCriasInput,
): { ok: true; isNatimorto: boolean } | { ok: false; message: string } {
  const isNatimorto = input.resultado === "Natimorto";
  const crias = input.crias ?? [];
  if (isNatimorto && crias.length > 0) return { ok: false, message: MSG_PARTO_NATIMORTO_SEM_CRIAS };
  if (!isNatimorto && crias.length === 0) return { ok: false, message: MSG_PARTO_CRIAS_OBRIGATORIAS };
  const brincos = crias.map((cria) => cria.brinco.trim().toLowerCase()).filter(Boolean);
  if (new Set(brincos).size !== brincos.length) return { ok: false, message: MSG_PARTO_BRINCO_DUPLICADO_LOTE };
  for (const cria of crias) {
    const categoria = cria.categoria?.trim();
    if (!categoria) return { ok: false, message: MSG_PARTO_CATEGORIA_OBRIGATORIA };
    if (!isCategoriaValidaParaSexo(sexoCriaParaCadastro(cria.sexo), categoria)) {
      return { ok: false, message: MSG_PARTO_CATEGORIA_INCOMPATIVEL };
    }
  }
  return { ok: true, isNatimorto };
}
