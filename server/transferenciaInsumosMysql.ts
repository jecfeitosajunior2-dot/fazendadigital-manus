import { and, eq } from "drizzle-orm";
import { estoque, estoqueMovimentacoes, estoqueOperacoes, fazendas } from "../drizzle/schema";
import { db } from "./db";
import { createTransferenciaInsumosService, type TransferenciaInsumosTx, type TransferenciaOperacaoRow } from "./transferenciaInsumos";
import { mapEstoqueParaMovimentacao } from "./estoqueSaldoTx";

function insertIdOf(result: unknown): number {
  const asArray = result as { insertId?: number }[];
  const asObj = result as { insertId?: number };
  return Number(asArray?.[0]?.insertId ?? asObj?.insertId ?? 0);
}

function mapOp(row: typeof estoqueOperacoes.$inferSelect): TransferenciaOperacaoRow {
  return {
    id: row.id,
    userId: row.userId,
    fazendaId: row.fazendaId,
    fazendaDestinoId: row.fazendaDestinoId ?? null,
    tipo: row.tipo,
    motivo: row.motivo,
    dataOperacao: String(row.dataOperacao),
    status: row.status,
    idempotencyKey: row.idempotencyKey,
  };
}

function criarTx(drizzleTx: Parameters<Parameters<typeof db.transaction>[0]>[0]): TransferenciaInsumosTx {
  const tx: TransferenciaInsumosTx = {
    async findEstoque(id) {
      const [row] = await drizzleTx.select().from(estoque).where(eq(estoque.id, id));
      return row ? mapEstoqueParaMovimentacao(row) : null;
    },
    async insertMovimentacao(values) {
      const result = await drizzleTx.insert(estoqueMovimentacoes).values({
        ...values,
        conteudoPorUnidadeSnapshot: values.conteudoPorUnidadeSnapshot != null
          ? String(values.conteudoPorUnidadeSnapshot)
          : undefined,
        quantidadeFisicaSnapshot: values.quantidadeFisicaSnapshot != null
          ? String(values.quantidadeFisicaSnapshot)
          : undefined,
      });
      return insertIdOf(result);
    },
    async updateEstoque(id, patch) {
      await drizzleTx.update(estoque).set(patch).where(eq(estoque.id, id));
    },
    async findFazenda(userId, id) {
      const [row] = await drizzleTx.select({ id: fazendas.id, nome: fazendas.nome }).from(fazendas)
        .where(and(eq(fazendas.id, id), eq(fazendas.userId, userId))).limit(1);
      return row ?? null;
    },
    async findEstoquePorProdutoFazenda(produtoId, fazendaId) {
      const [row] = await drizzleTx.select().from(estoque).where(and(
        eq(estoque.produtoId, produtoId),
        eq(estoque.fazendaId, fazendaId),
      )).limit(1);
      return row ? mapEstoqueParaMovimentacao(row) : null;
    },
    async insertEstoqueDestino(origem, fazendaDestinoId, inicializarCapital) {
      const [full] = await drizzleTx.select().from(estoque).where(eq(estoque.id, origem.id)).limit(1);
      const result = await drizzleTx.insert(estoque).values({
        produtoId: full?.produtoId ?? origem.produtoId ?? undefined,
        fazendaId: fazendaDestinoId,
        nome: full?.nome ?? origem.nome ?? "Produto",
        categoria: full?.categoria,
        subcategoria: full?.subcategoria,
        unidade: full?.unidade,
        controlarSaldo: full?.controlarSaldo ?? origem.controlarSaldo ?? true,
        monitorarEstoque: full?.monitorarEstoque ?? false,
        situacao: "ativo",
        embalagens: full?.embalagens,
        quantidade: "0",
        valorUnitario: full?.valorUnitario ?? (origem.valorUnitario != null ? String(origem.valorUnitario) : null),
        valorTotalEstoque: inicializarCapital ? "0.00" : null,
        capitalInicializadoEm: inicializarCapital ? new Date() : null,
      });
      return insertIdOf(result);
    },
    async findOperacaoPorIdem(userId, key) {
      const [row] = await drizzleTx.select().from(estoqueOperacoes)
        .where(and(eq(estoqueOperacoes.userId, userId), eq(estoqueOperacoes.idempotencyKey, key))).limit(1);
      return row ? { id: row.id, status: row.status } : null;
    },
    async insertOperacao(row) {
      const result = await drizzleTx.insert(estoqueOperacoes).values({
        userId: row.userId,
        fazendaId: row.fazendaId,
        fazendaDestinoId: row.fazendaDestinoId,
        tipo: row.tipo,
        motivo: row.motivo,
        dataOperacao: row.dataOperacao,
        valorMercadorias: row.valorMercadorias,
        valorFrete: row.valorFrete,
        valorTotal: row.valorTotal,
        status: row.status,
        idempotencyKey: row.idempotencyKey,
      });
      return insertIdOf(result);
    },
    async findOperacao(userId, id) {
      const [row] = await drizzleTx.select().from(estoqueOperacoes)
        .where(and(eq(estoqueOperacoes.id, id), eq(estoqueOperacoes.userId, userId))).limit(1);
      return row ? mapOp(row) : null;
    },
    async listMovimentacoesOperacao(operacaoId) {
      const rows = await drizzleTx.select().from(estoqueMovimentacoes)
        .where(eq(estoqueMovimentacoes.operacaoId, operacaoId));
      return rows.map(r => ({
        id: r.id,
        estoqueId: r.estoqueId,
        quantidade: String(r.quantidade),
        valorEstoqueMovimentado: r.valorEstoqueMovimentado != null ? String(r.valorEstoqueMovimentado) : null,
        status: r.status,
        grupoId: r.grupoId,
        tipo: r.tipo,
        fazendaId: r.fazendaId,
      }));
    },
    async updateOperacaoEstornada(userId, id, motivo, em) {
      await drizzleTx.update(estoqueOperacoes).set({
        status: "estornada",
        motivoEstorno: motivo,
        estornadaEm: em,
      }).where(and(eq(estoqueOperacoes.id, id), eq(estoqueOperacoes.userId, userId)));
    },
    async updateMovimentacaoEstornada(id, motivo, userId, nome) {
      await drizzleTx.update(estoqueMovimentacoes).set({
        status: "estornada",
        motivoEstorno: motivo,
        updatedAt: new Date(),
        updatedByUserId: userId,
        updatedByNome: nome,
      }).where(eq(estoqueMovimentacoes.id, id));
    },
    transaction(fn) {
      return fn(tx);
    },
  };
  return tx;
}

export const transferenciaInsumosService = createTransferenciaInsumosService({
  transaction(fn) {
    return db.transaction(async drizzleTx => fn(criarTx(drizzleTx)));
  },
});
