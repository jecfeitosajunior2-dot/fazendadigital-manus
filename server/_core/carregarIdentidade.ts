import { eq } from "drizzle-orm";
import { users } from "../../drizzle/schema";
import { db } from "../db";
import type { IdentidadeUsuario } from "./identidadeSessao";

/** Lê a identidade sem trazer a senha. Erro de banco sobe para o chamador recusar a sessão. */
export async function carregarIdentidade(id: number): Promise<IdentidadeUsuario | null> {
  const [row] = await db
    .select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      email: users.email,
      role: users.role,
      papel: users.papel,
      titularUserId: users.titularUserId,
      situacao: users.situacao,
      sessionVersion: users.sessionVersion,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!row?.role || !row.papel || !row.situacao || row.titularUserId == null) return null;
  return {
    id: row.id,
    openId: row.openId,
    name: row.name,
    email: row.email,
    role: row.role,
    papel: row.papel,
    titularUserId: row.titularUserId,
    situacao: row.situacao,
    sessionVersion: row.sessionVersion,
  };
}
