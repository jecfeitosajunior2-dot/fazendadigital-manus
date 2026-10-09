import { and, eq } from "drizzle-orm";
import { estoque, estoqueMovimentacoes, estoqueOperacoes, fazendas, pessoas } from "../drizzle/schema";
import { db } from "./db";
import { createFinanceiroNucleoTxFromDrizzle, type FinanceiroDrizzleTx } from "./financeiroNucleo";
import {
  createCompraInsumosService,
  type CompraInsumosStore,
  type CompraInsumosTx,
  type EstoqueOperacaoRow,
} from "./compraInsumos";

function insertIdOf(result: unknown): number {
  const asArray = result as { insertId?: number }[];
  const asObj = result as { insertId?: number };
  return Number(asArray?.[0]?.insertId ?? asObj?.insertId ?? 0);
}

function mapOperacao(row: typeof estoqueOperacoes.$inferSelect): EstoqueOperacaoRow {
  return {
    id: row.id,
    userId: row.userId,
    fazendaId: row.fazendaId,
    tipo: row.tipo,
    motivo: row.motivo,
    dataOperacao: String(row.dataOperacao),
    fornecedorId: row.fornecedorId,
    fornecedorNomeSnapshot: row.fornecedorNomeSnapshot,
    numeroNf: row.numeroNf,
    referencia: row.referencia,
    valorMercadorias: String(row.valorMercadorias),
    valorFrete: String(row.valorFrete),
    valorTotal: String(row.valorTotal),
    freteCredorId: row.freteCredorId,
    freteCredorNomeSnapshot: row.freteCredorNomeSnapshot,
    status: row.status,
    estornadaEm: row.estornadaEm ?? null,
    motivoEstorno: row.motivoEstorno,
    idempotencyKey: row.idempotencyKey,
  };
}

export function createCompraInsumosTxFromDrizzle(drizzleTx: FinanceiroDrizzleTx): CompraInsumosTx {
  return {
    fin: createFinanceiroNucleoTxFromDrizzle(drizzleTx),
    async findFazenda(userId, id) {
      const [row] = await drizzleTx.select({ id: fazendas.id }).from(fazendas)
        .where(and(eq(fazendas.id, id), eq(fazendas.userId, userId))).limit(1);
      return row ?? null;
    },
    async findPessoa(userId, id) {
      const [row] = await drizzleTx.select({
        id: pessoas.id,
        nome: pessoas.nome,
        ativo: pessoas.ativo,
        tipo: pessoas.tipo,
      }).from(pessoas).where(and(eq(pessoas.id, id), eq(pessoas.userId, userId))).limit(1);
      return row ? { id: row.id, nome: row.nome, ativo: Boolean(row.ativo), tipo: row.tipo } : null;
    },
    async findEstoque(id) {
      const [row] = await drizzleTx.select().from(estoque).where(eq(estoque.id, id)).limit(1);
      if (!row) return null;
      return {
        id: row.id,
        fazendaId: row.fazendaId ?? null,
        quantidade: row.quantidade,
        controlarSaldo: row.controlarSaldo ?? null,
        valorUnitario: row.valorUnitario,
        valorTotalEstoque: row.valorTotalEstoque,
        capitalInicializadoEm: row.capitalInicializadoEm,
        nome: row.nome,
        produtoId: row.produtoId ?? null,
      };
    },
    async findOperacaoPorIdempotency(userId, key) {
      const [row] = await drizzleTx.select().from(estoqueOperacoes)
        .where(and(eq(estoqueOperacoes.userId, userId), eq(estoqueOperacoes.idempotencyKey, key))).limit(1);
      return row ? mapOperacao(row) : null;
    },
    async findOperacao(userId, id) {
      const [row] = await drizzleTx.select().from(estoqueOperacoes)
        .where(and(eq(estoqueOperacoes.id, id), eq(estoqueOperacoes.userId, userId))).limit(1);
      return row ? mapOperacao(row) : null;
    },
    async lockOperacao(userId, id) {
      return this.findOperacao(userId, id);
    },
    async insertOperacao(row) {
      const result = await drizzleTx.insert(estoqueOperacoes).values({
        userId: row.userId,
        fazendaId: row.fazendaId,
        tipo: row.tipo,
        motivo: row.motivo,
        dataOperacao: row.dataOperacao,
        fornecedorId: row.fornecedorId,
        fornecedorNomeSnapshot: row.fornecedorNomeSnapshot,
        numeroNf: row.numeroNf,
        referencia: row.referencia,
        valorMercadorias: row.valorMercadorias,
        valorFrete: row.valorFrete,
        valorTotal: row.valorTotal,
        freteCredorId: row.freteCredorId,
        freteCredorNomeSnapshot: row.freteCredorNomeSnapshot,
        status: row.status,
        idempotencyKey: row.idempotencyKey,
      });
      return insertIdOf(result);
    },
    async updateOperacaoEstornada(userId, id, motivo, em) {
      await drizzleTx.update(estoqueOperacoes).set({
        status: "estornada",
        motivoEstorno: motivo,
        estornadaEm: em,
      }).where(and(eq(estoqueOperacoes.id, id), eq(estoqueOperacoes.userId, userId)));
    },
    async listMovimentacoesOperacao(operacaoId) {
      const rows = await drizzleTx
        .select({
          mov: estoqueMovimentacoes,
          nome: estoque.nome,
          unidade: estoque.unidade,
        })
        .from(estoqueMovimentacoes)
        .innerJoin(estoque, eq(estoque.id, estoqueMovimentacoes.estoqueId))
        .where(eq(estoqueMovimentacoes.operacaoId, operacaoId));
      return rows.map(r => ({
        id: r.mov.id,
        operacaoId: r.mov.operacaoId,
        estoqueId: r.mov.estoqueId,
        quantidade: String(r.mov.quantidade),
        valor: r.mov.valor != null ? String(r.mov.valor) : null,
        valorEstoqueMovimentado: r.mov.valorEstoqueMovimentado != null ? String(r.mov.valorEstoqueMovimentado) : null,
        frete: r.mov.frete != null ? String(r.mov.frete) : null,
        status: r.mov.status,
        fazendaId: r.mov.fazendaId,
        tipo: r.mov.tipo,
        dataValidade: r.mov.dataValidade,
        destino: r.mov.destino,
        manejo: r.mov.manejo,
        notaFiscal: r.mov.notaFiscal,
        fornecedor: r.mov.fornecedor,
        observacoes: r.mov.observacoes,
        grupoId: r.mov.grupoId,
        nome: r.nome,
        unidade: r.unidade,
      }));
    },
    async insertMovimentacao(values) {
      const result = await drizzleTx.insert(estoqueMovimentacoes).values({
        grupoId: values.grupoId || undefined,
        operacaoId: values.operacaoId ?? undefined,
        estoqueId: values.estoqueId,
        fazendaId: values.fazendaId ?? undefined,
        userId: values.userId,
        registradoPor: values.registradoPor,
        tipo: values.tipo || undefined,
        dataMovimentacao: values.dataMovimentacao,
        quantidade: values.quantidade,
        dataValidade: values.dataValidade || undefined,
        destino: values.destino || undefined,
        manejo: values.manejo || undefined,
        notaFiscal: values.notaFiscal || undefined,
        frete: values.frete || undefined,
        fornecedor: values.fornecedor || undefined,
        valor: values.valor || undefined,
        valorEstoqueMovimentado: values.valorEstoqueMovimentado || undefined,
        observacoes: values.observacoes,
        status: values.status,
        originalGrupoId: values.originalGrupoId || undefined,
        motivoEstorno: values.motivoEstorno || undefined,
      });
      return insertIdOf(result);
    },
    async updateEstoque(id, patch) {
      await drizzleTx.update(estoque).set(patch).where(eq(estoque.id, id));
    },
    async updateMovimentacaoEstornada(id, motivo, updatedByUserId, updatedByNome) {
      await drizzleTx.update(estoqueMovimentacoes).set({
        status: "estornada",
        motivoEstorno: motivo,
        updatedAt: new Date(),
        updatedByUserId,
        updatedByNome,
      }).where(eq(estoqueMovimentacoes.id, id));
    },
  };
}

export function createCompraInsumosMysqlStore(
  drizzleDb: { transaction: typeof db.transaction } = db,
): CompraInsumosStore {
  return {
    transaction(fn) {
      return drizzleDb.transaction(async drizzleTx => fn(createCompraInsumosTxFromDrizzle(drizzleTx)));
    },
  };
}

export const compraInsumosService = createCompraInsumosService(createCompraInsumosMysqlStore());
