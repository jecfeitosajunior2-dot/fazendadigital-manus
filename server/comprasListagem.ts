import { and, desc, eq, inArray } from "drizzle-orm";
import { animais, compras } from "../drizzle/schema";
import { enriquecerComprasListagem } from "../shared/compraCancelamento";
import { db } from "./db";

export async function listarComprasDoUsuario(userId: number) {
  const rows = await db
    .select()
    .from(compras)
    .where(eq(compras.userId, userId))
    .orderBy(desc(compras.createdAt));
  if (!rows.length) return [];

  const ids = rows.map(row => row.id);
  const vinculos = await db
    .select({ compraId: animais.compraId })
    .from(animais)
    .where(and(eq(animais.userId, userId), inArray(animais.compraId, ids)));

  return enriquecerComprasListagem(rows, vinculos);
}
