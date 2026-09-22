import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { pessoas } from "../drizzle/schema";
import { db } from "./db";

export const PATCH_REATIVAR_PESSOA = { ativo: true } as const;
export const MSG_PESSOA_REATIVAR_NAO_ENCONTRADA = "Comprador não encontrado.";

export type PessoaReativarRow = {
  id: number;
  userId: number;
};

export type ReativarPessoaDeps = {
  findOwned: (userId: number, id: number) => Promise<PessoaReativarRow | undefined>;
  updateSomenteAtivoTrue: (userId: number, id: number) => Promise<void>;
};

export function patchReativarPessoa(): { ativo: true } {
  return { ...PATCH_REATIVAR_PESSOA };
}

export function assertPessoaReativavel(
  row: PessoaReativarRow | undefined,
  userId: number,
): PessoaReativarRow {
  if (!row || row.userId !== userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: MSG_PESSOA_REATIVAR_NAO_ENCONTRADA });
  }
  return row;
}

async function findOwnedDefault(userId: number, id: number): Promise<PessoaReativarRow | undefined> {
  const [existing] = await db
    .select({ id: pessoas.id, userId: pessoas.userId })
    .from(pessoas)
    .where(and(eq(pessoas.id, id), eq(pessoas.userId, userId)))
    .limit(1);
  return existing;
}

async function updateSomenteAtivoTrueDefault(userId: number, id: number): Promise<void> {
  await db
    .update(pessoas)
    .set(patchReativarPessoa())
    .where(and(eq(pessoas.id, id), eq(pessoas.userId, userId)));
}

/** Restaura `ativo=true` no cadastro existente. Não cria registro nem altera outros campos. */
export async function reativarPessoa(
  userId: number,
  id: number,
  deps: ReativarPessoaDeps = {
    findOwned: findOwnedDefault,
    updateSomenteAtivoTrue: updateSomenteAtivoTrueDefault,
  },
): Promise<{ success: true }> {
  const existing = await deps.findOwned(userId, id);
  assertPessoaReativavel(existing, userId);
  await deps.updateSomenteAtivoTrue(userId, id);
  return { success: true };
}
