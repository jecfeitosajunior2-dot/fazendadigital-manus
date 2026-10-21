/**
 * Adaptador Drizzle da confirmação integrada.
 * Não usa o db operacional por padrão. Não é procedure pública.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  animalBaixas,
  animais,
  fazendas,
  lotes,
  pessoas,
  vendaItens,
  vendas,
} from "../drizzle/schema";
import type { FinanceiroDrizzleTx } from "./financeiroNucleo";
import {
  anexarNucleoFinanceiroNaVenda,
  type ConfirmarVendaFinanceiroStore,
  type ConfirmarVendaFinanceiroTx,
  type VendaFinanceiroRow,
} from "./confirmarVendaFinanceiro";

function insertIdOf(result: unknown): number {
  const asArray = result as { insertId?: number }[];
  const asObj = result as { insertId?: number };
  return Number(asArray?.[0]?.insertId ?? asObj?.insertId ?? 0);
}

function affectedRowsOf(result: unknown): number {
  const asArray = result as { affectedRows?: number }[];
  const asObj = result as { affectedRows?: number };
  return Number(asArray?.[0]?.affectedRows ?? asObj?.affectedRows ?? 0);
}

function mapVenda(row: typeof vendas.$inferSelect): VendaFinanceiroRow {
  return {
    id: row.id,
    userId: row.userId,
    fazendaId: row.fazendaId ?? null,
    compradorId: row.compradorId ?? null,
    comprador: row.comprador ?? null,
    data: String(row.data),
    formaPrecificacao: row.formaPrecificacao ?? null,
    precoPadrao: row.precoPadrao ?? null,
    quantidadeAnimais: row.quantidadeAnimais ?? null,
    pesoTotal: row.pesoTotal ?? null,
    valorTotal: row.valorTotal ?? null,
    observacoes: row.observacoes ?? null,
    status: row.status ?? null,
    idempotencyKey: row.idempotencyKey ?? null,
  };
}

export function createConfirmarVendaFinanceiroTxFromDrizzle(
  drizzleTx: FinanceiroDrizzleTx,
  loteFazendaById: Map<number, number | null>,
): ConfirmarVendaFinanceiroTx {
  const comercial: Omit<ConfirmarVendaFinanceiroTx, "fin"> = {
    loteFazendaById,
    async findFazenda(userId, id) {
      const [row] = await drizzleTx
        .select({ id: fazendas.id, nome: fazendas.nome })
        .from(fazendas)
        .where(and(eq(fazendas.userId, userId), eq(fazendas.id, id)))
        .limit(1);
      return row ?? null;
    },
    async findPessoa(userId, id) {
      const [row] = await drizzleTx
        .select({
          id: pessoas.id,
          nome: pessoas.nome,
          tipo: pessoas.tipo,
          ativo: pessoas.ativo,
        })
        .from(pessoas)
        .where(and(eq(pessoas.userId, userId), eq(pessoas.id, id)))
        .limit(1);
      if (!row) return null;
      return { id: row.id, nome: row.nome, tipo: row.tipo, ativo: row.ativo !== false };
    },
    async findVendaPorIdempotency(userId, key) {
      const [row] = await drizzleTx
        .select()
        .from(vendas)
        .where(and(eq(vendas.userId, userId), eq(vendas.idempotencyKey, key)))
        .limit(1)
        .for("update");
      return row ? mapVenda(row) : null;
    },
    async listVendaItens(userId, vendaId) {
      const rows = await drizzleTx
        .select()
        .from(vendaItens)
        .where(and(eq(vendaItens.userId, userId), eq(vendaItens.vendaId, vendaId)));
      return rows.map(row => ({
        animalId: row.animalId,
        pesoVenda: row.pesoVenda,
        precoUnitario: row.precoUnitario,
        valorItem: row.valorItem,
        formaPrecificacao: row.formaPrecificacao,
        brincoSnapshot: row.brincoSnapshot,
        loteNomeSnapshot: row.loteNomeSnapshot,
      }));
    },
    async listAnimais(userId, ids) {
      if (!ids.length) return [];
      const rows = await drizzleTx
        .select({
          id: animais.id,
          brinco: animais.brinco,
          status: animais.status,
          fazendaId: animais.fazendaId,
          loteId: animais.loteId,
        })
        .from(animais)
        .where(and(eq(animais.userId, userId), inArray(animais.id, ids)));
      return rows;
    },
    async listBaixasAtivas(animalIds) {
      if (!animalIds.length) return [];
      return drizzleTx
        .select({ animalId: animalBaixas.animalId })
        .from(animalBaixas)
        .where(and(inArray(animalBaixas.animalId, animalIds), eq(animalBaixas.status, "ativa")));
    },
    async listLotes(ids) {
      if (!ids.length) return [];
      return drizzleTx
        .select({ id: lotes.id, nome: lotes.nome })
        .from(lotes)
        .where(inArray(lotes.id, ids));
    },
    async insertVenda(row) {
      const result = await drizzleTx.insert(vendas).values({
        userId: row.userId,
        fazendaId: row.fazendaId,
        compradorId: row.compradorId,
        comprador: row.comprador,
        data: row.data,
        formaPrecificacao: row.formaPrecificacao === "cabeca" ? "cabeca" : "kg",
        precoPadrao: row.precoPadrao != null ? String(row.precoPadrao) : null,
        quantidadeAnimais: row.quantidadeAnimais,
        pesoTotal: row.pesoTotal != null ? String(row.pesoTotal) : null,
        valorTotal: row.valorTotal != null ? String(row.valorTotal) : null,
        observacoes: row.observacoes,
        status: "concluido",
        idempotencyKey: row.idempotencyKey,
      });
      return insertIdOf(result);
    },
    async insertItens(vendaId, userId, itens) {
      if (!itens.length) return;
      await drizzleTx.insert(vendaItens).values(itens.map(item => ({
        userId,
        vendaId,
        animalId: item.animalId,
        brincoSnapshot: item.brincoSnapshot ?? null,
        loteNomeSnapshot: item.loteNomeSnapshot ?? null,
        pesoVenda: item.pesoVenda != null ? String(item.pesoVenda) : null,
        formaPrecificacao: item.formaPrecificacao === "cabeca" ? "cabeca" : "kg",
        precoUnitario: String(item.precoUnitario),
        valorItem: String(item.valorItem),
      })));
    },
    async insertBaixas(rows) {
      if (!rows.length) return;
      await drizzleTx.insert(animalBaixas).values(rows.map(row => ({
        userId: row.userId,
        animalId: row.animalId,
        fazendaId: row.fazendaId,
        tipo: "venda" as const,
        dataBaixa: row.dataBaixa,
        destino: row.destino,
        motivo: row.motivo,
        usuarioNome: row.usuarioNome,
        vendaId: row.vendaId,
        status: "ativa" as const,
      })));
    },
    async marcarAnimaisVendidos(userId, ids) {
      if (!ids.length) return 0;
      const result = await drizzleTx
        .update(animais)
        .set({ status: "vendido" })
        .where(and(eq(animais.userId, userId), inArray(animais.id, ids), eq(animais.status, "ativo")));
      return affectedRowsOf(result);
    },
  };
  return anexarNucleoFinanceiroNaVenda(drizzleTx, comercial);
}

export function createConfirmarVendaFinanceiroMysqlStore(
  drizzleDb: { transaction: (fn: (tx: FinanceiroDrizzleTx) => Promise<unknown>) => Promise<unknown> },
): ConfirmarVendaFinanceiroStore {
  return {
    transaction(fn) {
      return drizzleDb.transaction(async drizzleTx => {
        const loteRows = await drizzleTx
          .select({ id: lotes.id, fazendaId: lotes.fazendaId })
          .from(lotes);
        const loteFazendaById = new Map<number, number | null>(
          loteRows.map(lote => [lote.id, lote.fazendaId ?? null]),
        );
        return fn(createConfirmarVendaFinanceiroTxFromDrizzle(drizzleTx, loteFazendaById));
      }) as Promise<ReturnType<typeof fn>>;
    },
  };
}
