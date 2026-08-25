import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { animais, partoCrias, pesagens, reproducaoRegistros } from "../drizzle/schema";
import {
  getReproFemeaSameDayStagePriority,
  packReproObservacoes,
  reproDataToInputISO,
  validateReproResultadoForSave,
} from "../shared/reproRegistroMeta";
import {
  buildReproAnimalElegibilidadeInput,
  isReproTipoPermitidoParaAnimal,
  MSG_REPRO_INELEGIVEL,
} from "../shared/reproElegibilidade";
import { isCategoriaValidaParaSexo } from "../shared/animal-types";
import { db } from "./db";
import { validateReproducaoCreatePreconditions } from "./reproducaoCreateValidate";
import {
  assertBrincoUnicoEntreAtivos,
  assertBrincoUnicoEntreAtivosDb,
} from "./brincoAtivoValidation";
import { assertRfidNaoReutilizavel } from "./manejoContexto";
import {
  createLocalAnimal,
  createLocalPartoCriasBatch,
  createLocalPesagem,
  createLocalReproducaoRegistro,
  fecharPrevisoesPartoLocal,
  isDatabaseUnavailable,
  listLocalReproducaoRegistros,
  updateLocalAnimal,
} from "./localFallbackStore";

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

const TIPOS_CONCEPCAO = new Set(["Cobertura", "Inseminação"]);

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
  /** Reprodutor interno conhecido — sobrescreve resolução automática da gestação. */
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

/** Parto e Aborto confirmado/outro encerram o ciclo; Aborto Suspeito não. */
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

/** Data exclusiva do último encerramento de gestação anterior ao Parto atual. */
export function resolveCycleStartExclusiveISO(
  registros: ReproRegistroPaiRef[],
  dataPartoISO: string,
): string | null {
  const closings = registros
    .filter(isReproCycleClosingEvent)
    .map(r => ({ ...r, dataISO: reproDataToInputISO(r.dataCobertura) ?? "" }))
    .filter(r => r.dataISO && r.dataISO <= dataPartoISO)
    .sort(compareReproRegistrosDesc);
  return closings[0]?.dataISO ?? null;
}

/** Resolve pai interno a partir da última concepção estruturada do ciclo aberto. */
export function resolvePaiIdFromRegistros(
  registros: ReproRegistroPaiRef[],
  dataPartoISO: string,
  machoIdOverride?: number | null,
): number | null {
  if (machoIdOverride != null && machoIdOverride > 0) {
    return machoIdOverride;
  }

  const cycleStartExclusive = resolveCycleStartExclusiveISO(registros, dataPartoISO);

  const concepcoes = registros
    .filter(r => TIPOS_CONCEPCAO.has(String(r.tipo).trim()))
    .map(r => ({ ...r, dataISO: reproDataToInputISO(r.dataCobertura) ?? "" }))
    .filter(r => {
      if (!r.dataISO || r.dataISO > dataPartoISO) return false;
      if (cycleStartExclusive && r.dataISO <= cycleStartExclusive) return false;
      return true;
    })
    .sort(compareReproRegistrosDesc);

  for (const c of concepcoes) {
    if (c.machoId != null && c.machoId > 0) return c.machoId;
  }
  return null;
}

export function validateRegistrarPartoComCriasBusinessRules(
  input: RegistrarPartoComCriasInput,
): { ok: true; isNatimorto: boolean } | { ok: false; message: string } {
  const isNatimorto = input.resultado === "Natimorto";
  const crias = input.crias ?? [];

  if (isNatimorto && crias.length > 0) {
    return { ok: false, message: MSG_PARTO_NATIMORTO_SEM_CRIAS };
  }
  if (!isNatimorto && crias.length === 0) {
    return { ok: false, message: MSG_PARTO_CRIAS_OBRIGATORIAS };
  }

  const brincos = crias.map(c => c.brinco.trim().toLowerCase()).filter(Boolean);
  if (new Set(brincos).size !== brincos.length) {
    return { ok: false, message: MSG_PARTO_BRINCO_DUPLICADO_LOTE };
  }

  for (const cria of crias) {
    const categoria = cria.categoria?.trim();
    if (!categoria) {
      return { ok: false, message: MSG_PARTO_CATEGORIA_OBRIGATORIA };
    }
    if (!isCategoriaValidaParaSexo(sexoCriaParaCadastro(cria.sexo), categoria)) {
      return { ok: false, message: MSG_PARTO_CATEGORIA_INCOMPATIVEL };
    }
  }

  return { ok: true, isNatimorto };
}

export async function validateRegistrarPartoComCriasPreconditions(
  userId: number,
  input: RegistrarPartoComCriasInput,
) {
  const business = validateRegistrarPartoComCriasBusinessRules(input);
  if (!business.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: business.message });
  }

  const { animal: matriz, dataISO, fazendaId } = await validateReproducaoCreatePreconditions(
    userId,
    {
      animalId: input.femeaId,
      fazendaId: input.fazendaId,
      dataCobertura: input.dataParto,
    },
  );

  if (matriz.sexo !== "femea") {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_PARTO_FEMEA_OBRIGATORIA });
  }

  const elegInput = buildReproAnimalElegibilidadeInput(matriz);
  if (!isReproTipoPermitidoParaAnimal(elegInput, "Parto")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_INELEGIVEL });
  }

  const validacaoResultado = validateReproResultadoForSave({
    sexo: matriz.sexo,
    tipo: "Parto",
    resultado: input.resultado,
    descricaoResultadoOutro: input.descricaoResultadoOutro,
  });
  if (!validacaoResultado.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: validacaoResultado.message });
  }

  return { matriz, dataISO, fazendaId, isNatimorto: business.isNatimorto };
}

function buildCriaAnimalRow(
  userId: number,
  input: {
    femeaId: number;
    paiId: number | null;
    dataNascimento: string;
    fazendaId: number;
    loteId?: number | null;
    pastoId?: number | null;
    cria: z.infer<typeof criaPartoInputSchema>;
  },
) {
  return {
    userId,
    brinco: input.cria.brinco.trim(),
    brincoEletronico: input.cria.brincoEletronico?.trim() || undefined,
    nome: input.cria.nome?.trim() || undefined,
    raca: input.cria.raca?.trim() || undefined,
    sexo: input.cria.sexo,
    dataNascimento: input.dataNascimento,
    pesoAtual: input.cria.pesoNascimento?.trim() || undefined,
    categoria: input.cria.categoria?.trim() || undefined,
    loteId: input.cria.loteId ?? input.loteId ?? undefined,
    pastoId: input.cria.pastoId ?? input.pastoId ?? undefined,
    fazendaId: input.fazendaId,
    maeId: input.femeaId,
    paiId: input.paiId ?? undefined,
    status: "ativo" as const,
    rastreadoNascimento: true,
  };
}

async function loadReproRegistrosFemea(userId: number, femeaId: number) {
  try {
    return await db
      .select({
        id: reproducaoRegistros.id,
        tipo: reproducaoRegistros.tipo,
        machoId: reproducaoRegistros.machoId,
        dataCobertura: reproducaoRegistros.dataCobertura,
        dataPrevistoParto: reproducaoRegistros.dataPrevistoParto,
        dataPartoReal: reproducaoRegistros.dataPartoReal,
        resultado: reproducaoRegistros.resultado,
        createdAt: reproducaoRegistros.createdAt,
      })
      .from(reproducaoRegistros)
      .where(and(eq(reproducaoRegistros.userId, userId), eq(reproducaoRegistros.femeaId, femeaId)))
      .orderBy(desc(reproducaoRegistros.dataCobertura), desc(reproducaoRegistros.createdAt));
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const local = await listLocalReproducaoRegistros(userId);
    return local
      .filter(r => r.femeaId === femeaId)
      .map(r => ({
        id: r.id,
        tipo: r.tipo,
        machoId: r.machoId ?? null,
        dataCobertura: r.dataCobertura,
        dataPrevistoParto: r.dataPrevistoParto ?? null,
        dataPartoReal: r.dataPartoReal ?? null,
        resultado: r.resultado ?? null,
        createdAt: r.createdAt,
      }));
  }
}

export async function executeRegistrarPartoComCrias(
  userId: number,
  input: RegistrarPartoComCriasInput,
) {
  const { matriz, dataISO, fazendaId, isNatimorto } =
    await validateRegistrarPartoComCriasPreconditions(userId, input);

  const registrosFemea = await loadReproRegistrosFemea(userId, input.femeaId);
  const paiId = resolvePaiIdFromRegistros(registrosFemea, dataISO, input.machoId);

  const observacoesPersistidas = packReproObservacoes(
    input.observacoes,
    undefined,
    input.responsavel,
    input.descricaoResultadoOutro,
  );

  const crias = input.crias ?? [];
  const loteDefault = matriz.loteId != null ? Number(matriz.loteId) : undefined;
  const pastoDefault = matriz.pastoId != null ? Number(matriz.pastoId) : undefined;

  try {
    const result = await db.transaction(async tx => {
      const partoInsert = await tx.insert(reproducaoRegistros).values({
        userId,
        femeaId: input.femeaId,
        machoId: paiId ?? undefined,
        tipo: "Parto",
        resultado: input.resultado,
        observacoes: observacoesPersistidas,
        dataCobertura: new Date(dataISO),
      });
      const partoRegistroId = Number((partoInsert as any)[0]?.insertId ?? (partoInsert as any).insertId);
      if (!Number.isFinite(partoRegistroId) || partoRegistroId <= 0) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao registrar parto." });
      }

      await tx
        .update(reproducaoRegistros)
        .set({ dataPartoReal: new Date(dataISO) })
        .where(
          and(
            eq(reproducaoRegistros.userId, userId),
            eq(reproducaoRegistros.femeaId, input.femeaId),
            isNotNull(reproducaoRegistros.dataPrevistoParto),
            isNull(reproducaoRegistros.dataPartoReal),
          ),
        );

      const criasCriadas: Array<{ animalId: number; ordem: number; pesagemId?: number }> = [];
      const espelhoLocal: Array<{ animalId: number; row: ReturnType<typeof buildCriaAnimalRow> }> = [];

      for (let i = 0; i < crias.length; i++) {
        const cria = crias[i]!;
        const ordem = cria.ordem ?? i + 1;
        const row = buildCriaAnimalRow(userId, {
          femeaId: input.femeaId,
          paiId,
          dataNascimento: dataISO,
          fazendaId,
          loteId: loteDefault,
          pastoId: pastoDefault,
          cria,
        });

        await assertBrincoUnicoEntreAtivosDb(
          userId,
          row.brinco,
          "ativo",
          undefined,
          fazendaId,
        );
        if (row.brincoEletronico) {
          await assertRfidNaoReutilizavel(userId, row.brincoEletronico);
        }

        const animalInsert = await tx.insert(animais).values(row);
        const criaAnimalId = Number(
          (animalInsert as any)[0]?.insertId ?? (animalInsert as any).insertId,
        );
        if (!Number.isFinite(criaAnimalId) || criaAnimalId <= 0) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao cadastrar cria." });
        }

        await tx.insert(partoCrias).values({
          userId,
          partoRegistroId,
          criaAnimalId,
          ordem,
        });

        let pesagemId: number | undefined;
        const peso = cria.pesoNascimento?.trim();
        if (peso) {
          const pesagemInsert = await tx.insert(pesagens).values({
            userId,
            animalId: criaAnimalId,
            peso,
            data: new Date(dataISO),
            observacoes: "Peso ao nascimento",
          });
          pesagemId = Number((pesagemInsert as any)[0]?.insertId ?? (pesagemInsert as any).insertId);
        }

        criasCriadas.push({ animalId: criaAnimalId, ordem, pesagemId });
        espelhoLocal.push({ animalId: criaAnimalId, row });
      }

      return { partoRegistroId, criasCriadas, espelhoLocal };
    });

    for (const { animalId, row } of result.espelhoLocal) {
      try {
        await updateLocalAnimal(userId, animalId, row);
      } catch {
        /* espelho local best-effort após commit MySQL */
      }
    }

    return {
      success: true as const,
      partoRegistroId: result.partoRegistroId,
      crias: result.criasCriadas,
      isNatimorto,
    };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (!isDatabaseUnavailable(error)) throw error;

    const parto = await createLocalReproducaoRegistro(userId, {
      femeaId: input.femeaId,
      machoId: paiId ?? undefined,
      tipo: "Parto",
      dataCobertura: dataISO,
      resultado: input.resultado,
      observacoes: observacoesPersistidas ?? undefined,
    });
    await fecharPrevisoesPartoLocal(userId, input.femeaId, dataISO);

    const criasCriadas: Array<{ animalId: number; ordem: number; pesagemId?: number }> = [];

    if (!isNatimorto) {
      for (let i = 0; i < crias.length; i++) {
        const cria = crias[i]!;
        const ordem = cria.ordem ?? i + 1;
        const row = buildCriaAnimalRow(userId, {
          femeaId: input.femeaId,
          paiId,
          dataNascimento: dataISO,
          fazendaId,
          loteId: loteDefault,
          pastoId: pastoDefault,
          cria,
        });

        await assertBrincoUnicoEntreAtivos(
          userId,
          row.brinco,
          "ativo",
          undefined,
          true,
          fazendaId,
        );
        if (row.brincoEletronico) {
          await assertRfidNaoReutilizavel(userId, row.brincoEletronico, undefined, true);
        }

        const { id: animalId } = await createLocalAnimal(userId, row);
        criasCriadas.push({ animalId, ordem });

        if (cria.pesoNascimento?.trim()) {
          const pesagem = await createLocalPesagem(userId, {
            animalId,
            peso: cria.pesoNascimento.trim(),
            data: dataISO,
            observacoes: "Peso ao nascimento",
          });
          criasCriadas[criasCriadas.length - 1]!.pesagemId = pesagem.id;
        }
      }

      await createLocalPartoCriasBatch(
        userId,
        criasCriadas.map(c => ({
          partoRegistroId: parto.id,
          criaAnimalId: c.animalId,
          ordem: c.ordem,
        })),
      );
    }

    return {
      success: true as const,
      partoRegistroId: parto.id,
      crias: criasCriadas,
      isNatimorto,
      localFallback: true as const,
    };
  }
}
