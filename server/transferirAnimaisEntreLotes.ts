import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { animais, animalLoteMovimentacoes, lotes, pastos } from "../drizzle/schema";
import { db } from "./db";
import {
  buildPastoFazendaMap,
  resolveAnimalLocalizacaoFromLote,
  resolveLoteFazendaId,
} from "./animaisPorFazenda";
import {
  assertDataMovimentacaoNaoFutura,
  isLoteDestinoMesmaFazenda,
  isMesmoLoteDestino,
  MSG_TROCA_LOTE_DESTINO_IGUAL_ORIGEM,
  MSG_TROCA_LOTE_DESTINO_INATIVO,
  MSG_TROCA_LOTE_FAZENDA,
  MSG_TROCA_LOTE_MESMO_LOTE,
  MSG_TROCA_LOTE_SEM_ANIMAIS_ORIGEM,
} from "../shared/transferirAnimaisEntreLotes";
import { assertManejoPermitidoNaData } from "./animalBaixa";

export type TransferirAnimaisEntreLotesInput = {
  animalIds: number[];
  loteDestinoId: number;
  dataMovimentacao: string;
  /** Quando informado (Editar Lote), só transfere quem está neste lote. */
  loteOrigemId?: number;
  responsavel?: string;
  observacoes?: string;
};

export type TransferirAnimaisEntreLotesResult = {
  success: true;
  count: number;
  loteDestinoNome: string;
};

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

/**
 * Uma única regra de transferência: atualiza lote/localização e grava histórico por animal.
 * Usada por Manejo Pontual (um animal) e Editar Lote (um ou vários).
 */
export async function transferirAnimaisEntreLotesDb(
  userId: number,
  usuarioNomePadrao: string,
  input: TransferirAnimaisEntreLotesInput,
): Promise<TransferirAnimaisEntreLotesResult> {
  const dataOk = assertDataMovimentacaoNaoFutura(input.dataMovimentacao);
  if (!dataOk.ok) toTrpc(dataOk.message);

  if (input.loteOrigemId != null && input.loteOrigemId === input.loteDestinoId) {
    toTrpc(MSG_TROCA_LOTE_DESTINO_IGUAL_ORIGEM);
  }

  const usuarioNome = input.responsavel?.trim() || usuarioNomePadrao;
  const observacoes = input.observacoes?.trim() || null;

  const [loteDestino] = await db
    .select()
    .from(lotes)
    .where(and(eq(lotes.id, input.loteDestinoId), eq(lotes.userId, userId)))
    .limit(1);
  if (!loteDestino) toTrpc("Lote de destino não encontrado.", "NOT_FOUND");
  if (loteDestino.ativo === false) toTrpc(MSG_TROCA_LOTE_DESTINO_INATIVO);

  let loteOrigem: typeof loteDestino | null = null;
  if (input.loteOrigemId != null) {
    const [origem] = await db
      .select()
      .from(lotes)
      .where(and(eq(lotes.id, input.loteOrigemId), eq(lotes.userId, userId)))
      .limit(1);
    if (!origem) toTrpc("Lote de origem não encontrado.", "NOT_FOUND");
    loteOrigem = origem;
    if (
      loteOrigem.fazendaId != null &&
      loteDestino.fazendaId != null &&
      loteOrigem.fazendaId !== loteDestino.fazendaId
    ) {
      toTrpc("A transferência entre lotes só é permitida dentro da mesma fazenda.");
    }
  }

  const animaisRows = await db
    .select()
    .from(animais)
    .where(and(eq(animais.userId, userId), inArray(animais.id, input.animalIds)));

  const selecionados =
    input.loteOrigemId != null
      ? animaisRows.filter(a => a.loteId === input.loteOrigemId)
      : animaisRows;

  if (selecionados.length === 0) {
    toTrpc(
      input.loteOrigemId != null
        ? MSG_TROCA_LOTE_SEM_ANIMAIS_ORIGEM
        : "Nenhum animal válido foi encontrado para a troca de lote.",
    );
  }

  const pastoIds = [
    ...new Set(
      [
        loteDestino.pastoAtualId,
        loteOrigem?.pastoAtualId,
        ...selecionados.map(a => a.pastoId),
      ].filter((id): id is number => id != null),
    ),
  ];
  const pastosRows =
    pastoIds.length > 0
      ? await db
          .select({ id: pastos.id, fazendaId: pastos.fazendaId })
          .from(pastos)
          .where(and(eq(pastos.userId, userId), inArray(pastos.id, pastoIds)))
      : [];
  const pastoFazendaMap = buildPastoFazendaMap(pastosRows);
  const locDestino = resolveAnimalLocalizacaoFromLote(loteDestino, pastoFazendaMap);
  const fazendaDestinoId =
    locDestino.fazendaId ?? loteDestino.fazendaId ?? loteOrigem?.fazendaId ?? null;

  const origemPorId = new Map<number, typeof loteDestino>();
  if (loteOrigem) origemPorId.set(loteOrigem.id, loteOrigem);
  const origemIdsFaltando = [
    ...new Set(
      selecionados
        .map(a => a.loteId)
        .filter((id): id is number => id != null && id > 0 && !origemPorId.has(id)),
    ),
  ];
  if (origemIdsFaltando.length > 0) {
    const extras = await db
      .select()
      .from(lotes)
      .where(and(eq(lotes.userId, userId), inArray(lotes.id, origemIdsFaltando)));
    for (const l of extras) origemPorId.set(l.id, l);
  }

  for (const animal of selecionados) {
    await assertManejoPermitidoNaData(userId, animal.id, input.dataMovimentacao);
    if (isMesmoLoteDestino(animal.loteId, input.loteDestinoId)) {
      toTrpc(MSG_TROCA_LOTE_MESMO_LOTE);
    }
    const loteDoAnimal = animal.loteId != null ? origemPorId.get(animal.loteId) : undefined;
    const fazendaAnimal =
      animal.fazendaId ??
      (loteDoAnimal ? resolveLoteFazendaId(loteDoAnimal, pastoFazendaMap) : null);
    if (!isLoteDestinoMesmaFazenda(fazendaAnimal, fazendaDestinoId)) {
      toTrpc(MSG_TROCA_LOTE_FAZENDA);
    }
  }

  const ids = selecionados.map(a => a.id);
  const pastoDestinoId = locDestino.pastoId;

  await db.transaction(async tx => {
    for (const animal of selecionados) {
      const loteDoAnimal = animal.loteId != null ? origemPorId.get(animal.loteId) : undefined;
      await tx
        .update(animais)
        .set({
          loteId: input.loteDestinoId,
          pastoId: pastoDestinoId,
          ...(fazendaDestinoId != null ? { fazendaId: fazendaDestinoId } : {}),
        })
        .where(and(eq(animais.userId, userId), eq(animais.id, animal.id)));

      await tx.insert(animalLoteMovimentacoes).values({
        userId,
        animalId: animal.id,
        loteOrigemId: animal.loteId && animal.loteId > 0 ? animal.loteId : null,
        loteDestinoId: input.loteDestinoId,
        pastoOrigemId: loteDoAnimal?.pastoAtualId ?? animal.pastoId ?? null,
        pastoDestinoId,
        fazendaId: fazendaDestinoId,
        dataMovimentacao: input.dataMovimentacao,
        usuarioNome,
        observacoes,
      });
    }
  });

  return {
    success: true,
    count: ids.length,
    loteDestinoNome: loteDestino.nome,
  };
}
