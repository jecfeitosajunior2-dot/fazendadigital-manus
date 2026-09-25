import { and, desc, eq, inArray } from "drizzle-orm";
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
