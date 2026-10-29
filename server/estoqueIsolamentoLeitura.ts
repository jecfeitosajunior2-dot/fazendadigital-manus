import { eq } from "drizzle-orm";
import { fazendas } from "../drizzle/schema";
import { db } from "./db";
import { isDatabaseUnavailable, listLocalFazendas } from "./localFallbackStore";

/** Fazendas do usuário no MySQL + espelho local. Sem fazenda, o estoque fica vazio. */
export async function idsFazendasDoUsuarioParaEstoque(userId: number): Promise<number[]> {
  const ids = new Set<number>();
  try {
    const rows = await db
      .select({ id: fazendas.id })
      .from(fazendas)
      .where(eq(fazendas.userId, userId));
    for (const row of rows) {
      if (row.id > 0) ids.add(row.id);
    }
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
  }
  const locais = await listLocalFazendas(userId);
  for (const fazenda of locais) {
    if (fazenda.id > 0) ids.add(fazenda.id);
  }
  return [...ids];
}
