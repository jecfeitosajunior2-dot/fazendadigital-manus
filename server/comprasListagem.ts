import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { animais, compras } from "../drizzle/schema";
import { enriquecerComprasListagem } from "../shared/compraCancelamento";
import { db } from "./db";
import { whereListagemCompras } from "./comprasListFiltro";

export async function listarComprasDoUsuario(
  userId: number,
  filtro?: { fazendaId?: number; status?: string | null },
) {
  const where = whereListagemCompras(userId, filtro);
  const conditions = [eq(compras.userId, where.userId)];
  if (where.fazendaId) conditions.push(eq(compras.fazendaId, where.fazendaId));
  if (where.status) conditions.push(eq(compras.status, where.status));
  const rows = await db
    .select()
    .from(compras)
    .where(and(...conditions))
    .orderBy(desc(compras.createdAt));
  if (!rows.length) return [];

  const ids = rows.map(row => row.id);
  const vinculos = await db
    .select({ compraId: animais.compraId })
    .from(animais)
    .where(and(eq(animais.userId, userId), inArray(animais.compraId, ids)));

  return enriquecerComprasListagem(rows, vinculos);
}

export async function listarComprasAutorizadas(
  titularUserId: number,
  fazendaIds: number[],
  incluirRascunhoSemFazenda: boolean,
  filtro?: { fazendaId?: number; status?: string | null },
) {
  if (filtro?.fazendaId && !fazendaIds.includes(filtro.fazendaId)) return [];
  const where = whereListagemCompras(titularUserId, filtro);
  const partesFazenda = filtro?.fazendaId
    ? [eq(compras.fazendaId, filtro.fazendaId)]
    : [
        ...(fazendaIds.length ? [inArray(compras.fazendaId, fazendaIds)] : []),
        ...(incluirRascunhoSemFazenda ? [isNull(compras.fazendaId)] : []),
      ];
  if (!partesFazenda.length) return [];
  const conditions = [eq(compras.userId, where.userId), or(...partesFazenda)!];
  if (where.status) conditions.push(eq(compras.status, where.status));
  const rows = await db
    .select()
    .from(compras)
    .where(and(...conditions))
    .orderBy(desc(compras.createdAt));
  if (!rows.length) return [];

  const ids = rows.map(row => row.id);
  const vinculos = await db
    .select({ compraId: animais.compraId })
    .from(animais)
    .where(and(eq(animais.userId, titularUserId), inArray(animais.compraId, ids)));

  return enriquecerComprasListagem(rows, vinculos);
}
