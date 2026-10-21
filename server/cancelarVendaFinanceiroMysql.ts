/**
 * Adaptador Drizzle do cancelamento integrado.
 * Não usa o db operacional por padrão. Não é procedure pública.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { animalBaixas, animais, vendaItens, vendas } from "../drizzle/schema";
import {
  createFinanceiroNucleoTxFromDrizzle,
  type FinanceiroDrizzleTx,
} from "./financeiroNucleo";
import type { CancelarVendaFinanceiroStore, CancelarVendaFinanceiroTx } from "./cancelarVendaFinanceiro";

function affectedRowsOf(result: unknown): number {
  const asArray = result as { affectedRows?: number }[];
  const asObj = result as { affectedRows?: number };
  return Number(asArray?.[0]?.affectedRows ?? asObj?.affectedRows ?? 0);
}

export function createCancelarVendaFinanceiroTxFromDrizzle(
  drizzleTx: FinanceiroDrizzleTx,
): CancelarVendaFinanceiroTx {
  const fin = createFinanceiroNucleoTxFromDrizzle(drizzleTx);
  return {
    fin,
    async lockVenda(userId, vendaId) {
      const result = await drizzleTx.execute(sql`
        SELECT id, user_id AS userId, status, idempotency_key AS idempotencyKey
        FROM vendas
        WHERE id = ${vendaId} AND user_id = ${userId}
        FOR UPDATE
      `);
      const raw = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
      const row = (Array.isArray(raw) ? raw : [])[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        id: Number(row.id),
        userId: Number(row.userId),
        status: row.status == null ? null : String(row.status),
        idempotencyKey: row.idempotencyKey == null ? null : String(row.idempotencyKey),
      };
    },
    async listItensAnimalIds(userId, vendaId) {
      const rows = await drizzleTx
        .select({ animalId: vendaItens.animalId })
        .from(vendaItens)
        .where(and(eq(vendaItens.userId, userId), eq(vendaItens.vendaId, vendaId)));
      return rows.map(row => row.animalId);
    },
    async listAnimais(userId, ids) {
      if (!ids.length) return [];
      return drizzleTx
        .select({ id: animais.id, brinco: animais.brinco, status: animais.status })
        .from(animais)
        .where(and(eq(animais.userId, userId), inArray(animais.id, ids)));
    },
    async listBaixasAtivasDaVenda(userId, vendaId, animalIds) {
      if (!animalIds.length) return [];
      return drizzleTx
        .select({ id: animalBaixas.id, animalId: animalBaixas.animalId })
        .from(animalBaixas)
        .where(and(
          eq(animalBaixas.userId, userId),
          eq(animalBaixas.vendaId, vendaId),
          eq(animalBaixas.tipo, "venda"),
          eq(animalBaixas.status, "ativa"),
          inArray(animalBaixas.animalId, animalIds),
        ));
    },
    async estornarBaixas(userId, vendaId, baixaIds) {
      if (!baixaIds.length) return 0;
      const result = await drizzleTx
        .update(animalBaixas)
        .set({ status: "estornada" })
        .where(and(
          eq(animalBaixas.userId, userId),
          eq(animalBaixas.vendaId, vendaId),
          eq(animalBaixas.status, "ativa"),
          inArray(animalBaixas.id, baixaIds),
        ));
      return affectedRowsOf(result);
    },
    async restaurarAnimais(userId, ids) {
      if (!ids.length) return 0;
      const result = await drizzleTx
        .update(animais)
        .set({ status: "ativo" })
        .where(and(eq(animais.userId, userId), inArray(animais.id, ids), eq(animais.status, "vendido")));
      return affectedRowsOf(result);
    },
    async marcarVendaCancelada(input) {
      const result = await drizzleTx
        .update(vendas)
        .set({
          status: "cancelado",
          canceladoEm: input.canceladoEm,
          canceladoPorUserId: input.canceladoPorUserId,
          canceladoPorNome: input.canceladoPorNome,
          motivoCancelamento: input.motivo,
        })
        .where(and(
          eq(vendas.id, input.vendaId),
          eq(vendas.userId, input.userId),
          eq(vendas.status, "concluido"),
        ));
      return affectedRowsOf(result);
    },
  };
}

export function createCancelarVendaFinanceiroMysqlStore(
  drizzleDb: { transaction: (fn: (tx: FinanceiroDrizzleTx) => Promise<unknown>) => Promise<unknown> },
): CancelarVendaFinanceiroStore {
  return {
    transaction(fn) {
      return drizzleDb.transaction(async drizzleTx => (
        fn(createCancelarVendaFinanceiroTxFromDrizzle(drizzleTx))
      )) as Promise<ReturnType<typeof fn>>;
    },
  };
}
