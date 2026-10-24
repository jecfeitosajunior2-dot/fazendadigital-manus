/**
 * Adaptador Drizzle do cancelamento integrado.
 * Não usa o db operacional por padrão. Não é procedure pública.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { animalBaixas, animais, vendaItens, vendas } from "../drizzle/schema";
import {
  FINANCEIRO_ORIGEM_VENDA_ANIMAIS,
  type FinanceiroCondicaoStatus,
  type FinanceiroTituloTipo,
} from "../shared/financeiroNucleo";
import {
  createFinanceiroNucleoTxFromDrizzle,
  type FinanceiroDrizzleTx,
  type FinTituloRow,
} from "./financeiroNucleo";
import type { CancelarVendaFinanceiroStore, CancelarVendaFinanceiroTx } from "./cancelarVendaFinanceiro";

function affectedRowsOf(result: unknown): number {
  const asArray = result as { affectedRows?: number }[];
  const asObj = result as { affectedRows?: number };
  return Number(asArray?.[0]?.affectedRows ?? asObj?.affectedRows ?? 0);
}

function mysqlExecuteRows(result: unknown): Array<Record<string, unknown>> {
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows: unknown }).rows;
    if (Array.isArray(rows)) return rows as Array<Record<string, unknown>>;
  }
  const raw = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  return (Array.isArray(raw) ? raw : []) as Array<Record<string, unknown>>;
}

function mapTituloFromLock(row: Record<string, unknown>): FinTituloRow {
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    tipo: String(row.tipo) as FinanceiroTituloTipo,
    estado: String(row.estado) as "ativo" | "cancelado",
    condicaoStatus: String(row.condicaoStatus) as FinanceiroCondicaoStatus,
    pessoaId: Number(row.pessoaId),
    contraparteNomeSnapshot: String(row.contraparteNomeSnapshot ?? ""),
    fazendaOrigemId: row.fazendaOrigemId == null ? null : Number(row.fazendaOrigemId),
    origemTipo: String(row.origemTipo),
    origemId: row.origemId == null ? null : Number(row.origemId),
    origemItemChave: row.origemItemChave == null ? null : String(row.origemItemChave),
    descricao: String(row.descricao ?? ""),
    dataCompetencia: String(row.dataCompetencia ?? ""),
    valorOriginal: String(row.valorOriginal ?? "0"),
    documentoReferencia: row.documentoReferencia == null ? null : String(row.documentoReferencia),
    observacoes: row.observacoes == null ? null : String(row.observacoes),
  };
}

let cacheColunaIdempotency: boolean | undefined;

async function vendasTemColunaIdempotency(drizzleTx: FinanceiroDrizzleTx): Promise<boolean> {
  if (cacheColunaIdempotency !== undefined) return cacheColunaIdempotency;
  const result = await drizzleTx.execute(sql`
    SELECT COUNT(*) AS n
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'vendas'
      AND COLUMN_NAME = 'idempotency_key'
  `);
  const n = Number(mysqlExecuteRows(result)[0]?.n ?? 0);
  cacheColunaIdempotency = n > 0;
  return cacheColunaIdempotency;
}

export function createCancelarVendaFinanceiroTxFromDrizzle(
  drizzleTx: FinanceiroDrizzleTx,
): CancelarVendaFinanceiroTx {
  const fin = createFinanceiroNucleoTxFromDrizzle(drizzleTx);
  return {
    fin,
    async lockVenda(userId, vendaId) {
      const temChave = await vendasTemColunaIdempotency(drizzleTx);
      const result = temChave
        ? await drizzleTx.execute(sql`
            SELECT id, user_id AS userId, status, idempotency_key AS idempotencyKey
            FROM vendas
            WHERE id = ${vendaId} AND user_id = ${userId}
            FOR UPDATE
          `)
        : await drizzleTx.execute(sql`
            SELECT id, user_id AS userId, status
            FROM vendas
            WHERE id = ${vendaId} AND user_id = ${userId}
            FOR UPDATE
          `);
      const row = mysqlExecuteRows(result)[0];
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
        .where(and(eq(vendaItens.userId, userId), eq(vendaItens.vendaId, vendaId)))
        .orderBy(asc(vendaItens.animalId));
      return rows.map(row => row.animalId);
    },
    async lockTitulosDaVenda(userId, vendaId) {
      const result = await drizzleTx.execute(sql`
        SELECT
          id,
          user_id AS userId,
          tipo,
          estado,
          condicao_status AS condicaoStatus,
          pessoa_id AS pessoaId,
          contraparte_nome_snapshot AS contraparteNomeSnapshot,
          fazenda_origem_id AS fazendaOrigemId,
          origem_tipo AS origemTipo,
          origem_id AS origemId,
          origem_item_chave AS origemItemChave,
          descricao,
          DATE_FORMAT(data_competencia, '%Y-%m-%d') AS dataCompetencia,
          valor_original AS valorOriginal,
          documento_referencia AS documentoReferencia,
          observacoes
        FROM financeiro_titulos
        WHERE user_id = ${userId}
          AND origem_tipo = ${FINANCEIRO_ORIGEM_VENDA_ANIMAIS}
          AND origem_id = ${vendaId}
        ORDER BY id FOR UPDATE
      `);
      return mysqlExecuteRows(result).map(mapTituloFromLock);
    },
    async lockAnimais(userId, ids) {
      const unique = [...new Set(ids)].filter(id => Number.isInteger(id) && id > 0).sort((a, b) => a - b);
      if (!unique.length) return [];
      return drizzleTx
        .select({ id: animais.id, brinco: animais.brinco, status: animais.status })
        .from(animais)
        .where(and(eq(animais.userId, userId), inArray(animais.id, unique)))
        .orderBy(asc(animais.id))
        .for("update");
    },
    async lockBaixasAtivasDaVenda(userId, vendaId, animalIds) {
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
        ))
        .orderBy(asc(animalBaixas.id))
        .for("update");
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
