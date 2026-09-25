import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import {
  animalBaixas,
  animalLoteMovimentacoes,
  animais,
  compraGrupos,
  compraRecebimentos,
  compras,
  historicoBrincos,
  partoCrias,
  pesagens,
  reproducaoRegistros,
  saudeRegistros,
  semenPartidas,
  vendaItens,
} from "../drizzle/schema";
import { MSG_ESTORNO_RECEBIMENTO_FALHOU } from "../shared/compraRecebimentoEstorno";
import { db } from "./db";
import {
  createDesfazerRecebimentoCompraService,
  type DesfazerRecebimentoCompraStore,
  type DesfazerRecebimentoCompraTx,
} from "./desfazerRecebimentoCompra";

function affectedRowsOf(result: unknown): number {
  const asArray = result as { affectedRows?: number }[];
  const asObj = result as { affectedRows?: number };
  return Number(asArray?.[0]?.affectedRows ?? asObj?.affectedRows ?? 0);
}

async function existe(
  tx: typeof db,
  promise: Promise<{ id?: number | null }[]>,
): Promise<boolean> {
  const rows = await promise;
  return rows.length > 0;
}

function txFromDrizzle(tx: typeof db): DesfazerRecebimentoCompraTx {
  return {
    async lockRecebimento(userId, recebimentoId) {
      await tx.execute(sql`
        SELECT \`id\` FROM \`compra_recebimentos\`
        WHERE \`id\` = ${recebimentoId} AND \`user_id\` = ${userId}
        FOR UPDATE
      `);
      const [row] = await tx
        .select({
          id: compraRecebimentos.id,
          userId: compraRecebimentos.userId,
          compraId: compraRecebimentos.compraId,
          compraGrupoId: compraRecebimentos.compraGrupoId,
          animalId: compraRecebimentos.animalId,
          brincoVisual: compraRecebimentos.brincoVisual,
          rfid: compraRecebimentos.rfid,
          sexo: compraRecebimentos.sexo,
          categoria: compraRecebimentos.categoria,
          pesoRecebimento: compraRecebimentos.pesoRecebimento,
          loteDestinoId: compraRecebimentos.loteDestinoId,
          pastoDestinoId: compraRecebimentos.pastoDestinoId,
          status: compraRecebimentos.status,
        })
        .from(compraRecebimentos)
        .where(and(eq(compraRecebimentos.id, recebimentoId), eq(compraRecebimentos.userId, userId)))
        .limit(1);
      return row ?? null;
    },

    async lockAnimal(userId, animalId) {
      await tx.execute(sql`
        SELECT \`id\` FROM \`animais\`
        WHERE \`id\` = ${animalId} AND \`userId\` = ${userId}
        FOR UPDATE
      `);
      const [row] = await tx
        .select({
          id: animais.id,
          userId: animais.userId,
          status: animais.status,
          brinco: animais.brinco,
          brincoEletronico: animais.brincoEletronico,
          loteId: animais.loteId,
          pastoId: animais.pastoId,
          sexo: animais.sexo,
          categoria: animais.categoria,
          compraId: animais.compraId,
          compraGrupoId: animais.compraGrupoId,
          castrado: animais.castrado,
          dataDesmama: animais.dataDesmama,
          pesoAtual: animais.pesoAtual,
        })
        .from(animais)
        .where(and(eq(animais.id, animalId), eq(animais.userId, userId)))
        .limit(1);
      return row ?? null;
    },

    async lockGrupo(userId, compraId, grupoId) {
      await tx.execute(sql`
        SELECT \`id\` FROM \`compra_grupos\`
        WHERE \`id\` = ${grupoId} AND \`user_id\` = ${userId} AND \`compra_id\` = ${compraId}
        FOR UPDATE
      `);
      const [row] = await tx
        .select({ id: compraGrupos.id })
        .from(compraGrupos)
        .where(
          and(
            eq(compraGrupos.id, grupoId),
            eq(compraGrupos.userId, userId),
            eq(compraGrupos.compraId, compraId),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async getCompra(userId, compraId) {
      const [row] = await tx
        .select({ id: compras.id, userId: compras.userId, status: compras.status })
        .from(compras)
        .where(and(eq(compras.id, compraId), eq(compras.userId, userId)))
        .limit(1);
      return row ?? null;
    },

    async listPesagens(userId, animalId) {
      return tx
        .select({ compraRecebimentoId: pesagens.compraRecebimentoId })
        .from(pesagens)
        .where(and(eq(pesagens.userId, userId), eq(pesagens.animalId, animalId)));
    },

    async listMovimentacoes(userId, animalId) {
      return tx
        .select({ compraRecebimentoId: animalLoteMovimentacoes.compraRecebimentoId })
        .from(animalLoteMovimentacoes)
        .where(
          and(eq(animalLoteMovimentacoes.userId, userId), eq(animalLoteMovimentacoes.animalId, animalId)),
        );
    },

    async temHistoricoBrincos(userId, animalId) {
      return existe(
        tx,
        tx
          .select({ id: historicoBrincos.id })
          .from(historicoBrincos)
          .where(and(eq(historicoBrincos.userId, userId), eq(historicoBrincos.animalId, animalId)))
          .limit(1),
      );
    },

    async temSaude(userId, animalId) {
      return existe(
        tx,
        tx
          .select({ id: saudeRegistros.id })
          .from(saudeRegistros)
          .where(and(eq(saudeRegistros.userId, userId), eq(saudeRegistros.animalId, animalId)))
          .limit(1),
      );
    },

    async temReproducaoFemea(userId, animalId) {
      return existe(
        tx,
        tx
          .select({ id: reproducaoRegistros.id })
          .from(reproducaoRegistros)
          .where(and(eq(reproducaoRegistros.userId, userId), eq(reproducaoRegistros.femeaId, animalId)))
          .limit(1),
      );
    },

    async temReproducaoMacho(userId, animalId) {
      return existe(
        tx,
        tx
          .select({ id: reproducaoRegistros.id })
          .from(reproducaoRegistros)
          .where(and(eq(reproducaoRegistros.userId, userId), eq(reproducaoRegistros.machoId, animalId)))
          .limit(1),
      );
    },

    async temFilhoComoMae(userId, animalId) {
      return existe(
        tx,
        tx
          .select({ id: animais.id })
          .from(animais)
          .where(and(eq(animais.userId, userId), eq(animais.maeId, animalId)))
          .limit(1),
      );
    },

    async temFilhoComoPai(userId, animalId) {
      return existe(
        tx,
        tx
          .select({ id: animais.id })
          .from(animais)
          .where(and(eq(animais.userId, userId), eq(animais.paiId, animalId)))
          .limit(1),
      );
    },

    async temPartoCria(userId, animalId) {
      return existe(
        tx,
        tx
          .select({ id: partoCrias.id })
          .from(partoCrias)
          .where(and(eq(partoCrias.userId, userId), eq(partoCrias.criaAnimalId, animalId)))
          .limit(1),
      );
    },

    async temSemenPartida(userId, animalId) {
      return existe(
        tx,
        tx
          .select({ id: semenPartidas.id })
          .from(semenPartidas)
          .where(and(eq(semenPartidas.userId, userId), eq(semenPartidas.machoId, animalId)))
          .limit(1),
      );
    },

    async temBaixa(userId, animalId) {
      return existe(
        tx,
        tx
          .select({ id: animalBaixas.id })
          .from(animalBaixas)
          .where(and(eq(animalBaixas.userId, userId), eq(animalBaixas.animalId, animalId)))
          .limit(1),
      );
    },

    async temVendaItem(userId, animalId) {
      return existe(
        tx,
        tx
          .select({ id: vendaItens.id })
          .from(vendaItens)
          .where(and(eq(vendaItens.userId, userId), eq(vendaItens.animalId, animalId)))
          .limit(1),
      );
    },

    async deletePesagensDoRecebimento(userId, recebimentoId, animalId) {
      await tx
        .delete(pesagens)
        .where(
          and(
            eq(pesagens.userId, userId),
            eq(pesagens.animalId, animalId),
            eq(pesagens.compraRecebimentoId, recebimentoId),
          ),
        );
    },

    async deleteMovimentacoesDoRecebimento(userId, recebimentoId, animalId) {
      await tx
        .delete(animalLoteMovimentacoes)
        .where(
          and(
            eq(animalLoteMovimentacoes.userId, userId),
            eq(animalLoteMovimentacoes.animalId, animalId),
            eq(animalLoteMovimentacoes.compraRecebimentoId, recebimentoId),
          ),
        );
    },

    async deleteAnimal(userId, animalId) {
      const result = await tx
        .delete(animais)
        .where(and(eq(animais.id, animalId), eq(animais.userId, userId), eq(animais.status, "ativo")));
      if (affectedRowsOf(result) !== 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MSG_ESTORNO_RECEBIMENTO_FALHOU });
      }
    },

    async marcarRecebimentoEstornado(row) {
      const result = await tx
        .update(compraRecebimentos)
        .set({
          status: "estornado",
          motivoEstorno: row.motivo,
          observacaoEstorno: row.observacao,
          estornadoPorUserId: row.estornadoPorUserId,
          estornadoEm: row.estornadoEm,
          updatedAt: row.estornadoEm,
        })
        .where(
          and(
            eq(compraRecebimentos.id, row.recebimentoId),
            eq(compraRecebimentos.userId, row.userId),
            eq(compraRecebimentos.status, "confirmado"),
          ),
        );
      if (affectedRowsOf(result) !== 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MSG_ESTORNO_RECEBIMENTO_FALHOU });
      }
    },
  };
}

export const desfazerRecebimentoCompraStore: DesfazerRecebimentoCompraStore = {
  transaction(fn) {
    return db.transaction(tx => fn(txFromDrizzle(tx as unknown as typeof db)));
  },
};

export const desfazerRecebimentoCompra = createDesfazerRecebimentoCompraService(
  desfazerRecebimentoCompraStore,
);
