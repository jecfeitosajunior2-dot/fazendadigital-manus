import { and, eq } from "drizzle-orm";
import { manutencaoPecas, manutencoes } from "../drizzle/schema";
import { db } from "./db";
import { pecaOficinaParaInsert } from "./manutencaoCompleta";
import {
  editarPecasOficinaNoTx,
  type EdicaoOficinaCtx,
  type EditarPecasOficinaInput,
  type OsEdicaoRow,
  type PecaEdicaoRow,
} from "./manutencaoOficinaEdicao";
import { MANUT_PECA_ORIGEM_OFICINA } from "../shared/manutencaoPecasOrigem";

type DrizzleLike = {
  select: typeof db.select;
  insert: typeof db.insert;
  update: typeof db.update;
  delete: typeof db.delete;
};

export function criarEdicaoOficinaCtx(
  tx: DrizzleLike,
  userId: number,
  osId: number,
): EdicaoOficinaCtx {
  return {
    async bloquearOs() {
      const [row] = await tx
        .select({
          id: manutencoes.id,
          userId: manutencoes.userId,
          status: manutencoes.status,
          valorPecas: manutencoes.valorPecas,
          valorPecasOficina: manutencoes.valorPecasOficina,
          valorMaoObra: manutencoes.valorMaoObra,
        })
        .from(manutencoes)
        .where(and(eq(manutencoes.id, osId), eq(manutencoes.userId, userId)))
        .for("update");
      return (row as OsEdicaoRow | undefined) ?? null;
    },
    async listarPecas() {
      const rows = await tx
        .select()
        .from(manutencaoPecas)
        .where(eq(manutencaoPecas.manutencaoId, osId))
        .for("update");
      return rows as PecaEdicaoRow[];
    },
    async substituirPecasOficina(pecas) {
      await tx
        .delete(manutencaoPecas)
        .where(
          and(
            eq(manutencaoPecas.manutencaoId, osId),
            eq(manutencaoPecas.origem, MANUT_PECA_ORIGEM_OFICINA),
          ),
        );
      for (const peca of pecas) {
        await tx.insert(manutencaoPecas).values(pecaOficinaParaInsert(osId, peca));
      }
    },
    async atualizarOs(patch) {
      const { tipoExecucao, ...rest } = patch;
      await tx
        .update(manutencoes)
        .set({
          ...rest,
          ...(tipoExecucao === "interna" || tipoExecucao === "externa"
            ? { tipoExecucao }
            : {}),
        })
        .where(and(eq(manutencoes.id, osId), eq(manutencoes.userId, userId)));
    },
  };
}

export async function editarPecasOficinaMysql(input: EditarPecasOficinaInput) {
  return db.transaction(async (tx) => {
    return editarPecasOficinaNoTx(criarEdicaoOficinaCtx(tx, input.userId, input.id), input);
  });
}
