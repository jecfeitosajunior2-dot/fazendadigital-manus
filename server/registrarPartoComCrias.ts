import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { animais, animalLoteMovimentacoes, partoCrias, pesagens, reproducaoRegistros } from "../drizzle/schema";
import {
  buildEntradaInicialLoteMovimentacao,
  loteIdEfetivoParaHistorico,
} from "../shared/animalLoteMovimentacaoEntrada";
import { packReproObservacoes, validateReproResultadoForSave } from "../shared/reproRegistroMeta";
import {
  buildReproAnimalElegibilidadeInput,
  isReproTipoPermitidoParaAnimal,
  MSG_REPRO_INELEGIVEL,
} from "../shared/reproElegibilidade";
import { db } from "./db";
import { dataCivilParaColunaDate } from "../shared/dataCivil";
import { validateReproducaoCreatePreconditions } from "./reproducaoCreateValidate";
import { assertManejoPermitidoNaData } from "./animalBaixa";
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
  deleteLocalAnimal,
  fecharPrevisoesPartoLocal,
  isDatabaseUnavailable,
  listLocalReproducaoRegistros,
  registrarLocalEntradaInicialLote,
  updateLocalAnimal,
} from "./localFallbackStore";

export {
  MSG_PARTO_BRINCO_DUPLICADO_LOTE,
  MSG_PARTO_CATEGORIA_INCOMPATIVEL,
  MSG_PARTO_CATEGORIA_OBRIGATORIA,
  MSG_PARTO_CRIAS_OBRIGATORIAS,
  MSG_PARTO_FEMEA_OBRIGATORIA,
  MSG_PARTO_NATIMORTO_SEM_CRIAS,
  criaPartoInputSchema,
  isReproCycleClosingEvent,
  registrarPartoComCriasInputSchema,
  resolveCycleStartExclusiveISO,
  resolvePaiIdFromRegistros,
  validateRegistrarPartoComCriasBusinessRules,
  type RegistrarPartoComCriasInput,
  type ReproRegistroPaiRef,
} from "./partoRegras";
import {
  MSG_PARTO_FEMEA_OBRIGATORIA,
  resolvePaiIdFromRegistros,
  validateRegistrarPartoComCriasBusinessRules,
  type RegistrarPartoComCriasInput,
} from "./partoRegras";

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
    cria: NonNullable<RegistrarPartoComCriasInput["crias"]>[number];
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
  await assertManejoPermitidoNaData(userId, input.femeaId, dataISO);

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

        const loteDestinoId = loteIdEfetivoParaHistorico(row.loteId);
        if (loteDestinoId != null) {
          await tx.insert(animalLoteMovimentacoes).values(
            buildEntradaInicialLoteMovimentacao({
              userId,
              animalId: criaAnimalId,
              loteDestinoId,
              pastoOrigemId: null,
              pastoDestinoId: row.pastoId ?? null,
              fazendaId,
              dataMovimentacao: dataISO,
              usuarioNome: input.responsavel?.trim() || "Usuário",
            }),
          );
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
            data: dataCivilParaColunaDate(dataISO),
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
        const loteDestinoId = loteIdEfetivoParaHistorico(row.loteId);
        if (loteDestinoId != null) {
          await registrarLocalEntradaInicialLote({
            userId,
            animalId,
            loteDestinoId,
            pastoOrigemId: null,
            pastoDestinoId: row.pastoId ?? null,
            fazendaId,
            dataMovimentacao: dataISO,
            usuarioNome: input.responsavel?.trim() || "Usuário",
          });
        }
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
        const loteDestinoId = loteIdEfetivoParaHistorico(row.loteId);
        try {
          if (loteDestinoId != null) {
            await registrarLocalEntradaInicialLote({
              userId,
              animalId,
              loteDestinoId,
              pastoOrigemId: null,
              pastoDestinoId: row.pastoId ?? null,
              fazendaId,
              dataMovimentacao: dataISO,
              usuarioNome: input.responsavel?.trim() || "Usuário",
            });
          }
        } catch (histError) {
          await deleteLocalAnimal(userId, animalId);
          throw histError;
        }
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
