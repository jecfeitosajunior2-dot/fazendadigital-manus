import { TRPCError } from "@trpc/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { animais, fazendas, lotes } from "../drizzle/schema";
import {
  getLocalAnimal,
  getLocalFazenda,
  isDatabaseUnavailable,
  listLocalAnimais,
  listLocalLotes,
} from "./localFallbackStore";
import { loadLoteFazendaContextForUser } from "./animaisPorFazenda";
import { assertBrincoUnicoEntreAtivos } from "./brincoAtivoValidation";
import {
  buildRfidConflitoMessage,
  findRfidConflict,
  normalizeRfidKey,
} from "../shared/rfidUnicidade";

/** Garante que a fazenda existe e pertence ao usuário. */
export async function assertFazendaDoUsuario(userId: number, fazendaId: number) {
  if (!Number.isFinite(fazendaId) || fazendaId <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Fazenda inválida." });
  }
  try {
    const [row] = await db
      .select({ id: fazendas.id })
      .from(fazendas)
      .where(and(eq(fazendas.id, fazendaId), eq(fazendas.userId, userId)))
      .limit(1);
    if (row) return;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
  }
  const local = await getLocalFazenda(userId, fazendaId);
  if (!local) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Você não tem acesso a esta Fazenda.",
    });
  }
}

/**
 * Garante que o lote pertence à fazenda (e ao usuário).
 * Lote opcional: se null/undefined, não valida.
 */
export async function assertLoteNaFazenda(
  userId: number,
  fazendaId: number,
  loteId: number | null | undefined,
) {
  if (loteId == null || !Number.isFinite(loteId) || loteId <= 0) return;

  try {
    const [lote] = await db
      .select({ id: lotes.id, fazendaId: lotes.fazendaId, userId: lotes.userId })
      .from(lotes)
      .where(and(eq(lotes.id, loteId), eq(lotes.userId, userId)))
      .limit(1);

    if (!lote) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Lote não encontrado." });
    }
    if (lote.fazendaId != null && lote.fazendaId !== fazendaId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "O lote informado não pertence à Fazenda selecionada.",
      });
    }
    return;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (!isDatabaseUnavailable(error)) throw error;
  }

  const localLotes = await listLocalLotes(userId);
  const local = localLotes.find(l => l.id === loteId);
  if (!local) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lote não encontrado." });
  }
  if (local.fazendaId != null && local.fazendaId !== fazendaId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O lote informado não pertence à Fazenda selecionada.",
    });
  }
}

export async function assertAnimalNaFazenda(
  userId: number,
  animalId: number,
  fazendaId: number,
) {
  try {
    const [animal] = await db
      .select()
      .from(animais)
      .where(and(eq(animais.id, animalId), eq(animais.userId, userId)))
      .limit(1);
    if (!animal) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Selecione um animal válido." });
    }
    const { loteFazendaById } = await loadLoteFazendaContextForUser(userId);
    const fazendaDoLote =
      animal.loteId != null ? loteFazendaById.get(animal.loteId) ?? null : null;
    const pertence =
      animal.fazendaId === fazendaId || fazendaDoLote === fazendaId;
    if (!pertence) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "O animal não pertence à Fazenda selecionada.",
      });
    }
    return animal;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (!isDatabaseUnavailable(error)) throw error;
  }

  const local = await getLocalAnimal(userId, animalId);
  if (!local) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Selecione um animal válido." });
  }
  if (local.fazendaId != null && local.fazendaId !== fazendaId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O animal não pertence à Fazenda selecionada.",
    });
  }
  return local;
}

/**
 * RFID não reutilizável: bloqueia se OUTRO animal (ativo ou inativo) já tiver o RFID.
 * Exclui o próprio animal. Comparação exata como string (trim), sem Number/parseInt.
 * Escopo: todos os animais do usuário (unicidade global ≥ fazenda — não enfraquece).
 */
export async function assertRfidNaoReutilizavel(
  userId: number,
  rfid: string | null | undefined,
  excludeAnimalId?: number,
  useLocal = false,
) {
  const key = normalizeRfidKey(rfid);
  if (!key) return;

  if (useLocal) {
    const lista = await listLocalAnimais(userId);
    const conflito = findRfidConflict(lista, key, { excludeAnimalId });
    if (conflito) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: buildRfidConflitoMessage(conflito),
      });
    }
    return;
  }

  try {
    const conditions = [
      eq(animais.userId, userId),
      sql`TRIM(${animais.brincoEletronico}) = ${key}`,
    ];
    if (excludeAnimalId != null) conditions.push(ne(animais.id, excludeAnimalId));
    const [row] = await db
      .select({ id: animais.id, status: animais.status })
      .from(animais)
      .where(and(...conditions))
      .limit(1);
    if (row) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: buildRfidConflitoMessage(row),
      });
    }
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (!isDatabaseUnavailable(error)) throw error;
    await assertRfidNaoReutilizavel(userId, rfid, excludeAnimalId, true);
  }
}

/** Alias histórico — agora aplica a regra definitiva (ativo + inativo). */
export const assertRfidUnicoEntreAtivos = assertRfidNaoReutilizavel;

export { assertBrincoUnicoEntreAtivos };
