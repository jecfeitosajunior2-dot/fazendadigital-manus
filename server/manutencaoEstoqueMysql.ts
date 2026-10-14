import { and, eq, inArray, sql } from "drizzle-orm";
import { estoque, estoqueMovimentacoes, manutencaoPecas, manutencoes } from "../drizzle/schema";
import { db } from "./db";
import { criarExecutorSaldoDrizzle } from "./estoqueSaldoTx";
import {
  estornarManutencaoNoTx,
  persistirManutencaoComPecasNoTx,
  ManutencaoEstoqueError,
  type EstornarManutencaoInput,
  type ManutencaoEstoqueTx,
  type ManutencaoMovimentacaoRow,
  type ManutencaoOsRow,
  type ManutencaoPecaRow,
  type PersistirManutencaoInput,
} from "./manutencaoEstoque";
import {
  deveBloquearEstornoGenericoManutencao,
  MSG_ESTORNO_GENERICO_MANUTENCAO,
  MSG_MANUT_ESTOQUE_AUSENTE_MYSQL,
} from "../shared/manutencaoEstoque";

function insertIdOf(result: unknown): number {
  const asArray = result as { insertId?: number }[];
  const asObj = result as { insertId?: number };
  return Number(asArray?.[0]?.insertId ?? asObj?.insertId ?? 0);
}

type DrizzleLike = {
  select: typeof db.select;
  insert: typeof db.insert;
  update: typeof db.update;
};

export function criarManutencaoEstoqueTx(tx: DrizzleLike): ManutencaoEstoqueTx {
  const saldo = criarExecutorSaldoDrizzle(tx);
  return {
    ...saldo,
    async insertOs(row) {
      const result = await tx.insert(manutencoes).values({
        userId: row.userId,
        maquinaId: row.maquinaId,
        tipo: row.tipo,
        descricao: row.descricao,
        data: row.data,
        horimetro: row.horimetro ?? undefined,
        proximaManutencao: row.proximaManutencao ?? undefined,
        status: row.status,
        prestadorNome: row.prestadorNome ?? undefined,
        prestadorContato: row.prestadorContato ?? undefined,
        valorMaoObra: row.valorMaoObra,
        valorPecas: row.valorPecas,
        valorTotal: row.valorTotal,
        custo: row.custo,
        observacoes: row.observacoes ?? undefined,
      });
      return insertIdOf(result);
    },
    async updateOs(id, patch) {
      const { estornadoEmAgora, ...rest } = patch;
      await tx.update(manutencoes).set({
        ...rest,
        ...(estornadoEmAgora ? { estornadoEm: sql`CURRENT_TIMESTAMP` } : {}),
      }).where(eq(manutencoes.id, id));
    },
    async insertPeca(row) {
      const result = await tx.insert(manutencaoPecas).values({
        manutencaoId: row.manutencaoId,
        estoqueId: row.estoqueId,
        nome: row.nome,
        quantidade: row.quantidade,
        valorUnitario: row.valorUnitario,
        valorTotal: row.valorTotal,
        estoqueMovimentacaoId: row.estoqueMovimentacaoId ?? undefined,
      });
      return insertIdOf(result);
    },
    async updatePeca(id, patch) {
      await tx.update(manutencaoPecas).set(patch).where(eq(manutencaoPecas.id, id));
    },
    async findOs(userId, id) {
      const [row] = await tx
        .select()
        .from(manutencoes)
        .where(and(eq(manutencoes.id, id), eq(manutencoes.userId, userId)));
      return (row as ManutencaoOsRow | undefined) ?? null;
    },
    async listPecas(manutencaoId) {
      const rows = await tx
        .select()
        .from(manutencaoPecas)
        .where(eq(manutencaoPecas.manutencaoId, manutencaoId));
      return rows as ManutencaoPecaRow[];
    },
    async findMovimentacao(id) {
      const [row] = await tx
        .select()
        .from(estoqueMovimentacoes)
        .where(eq(estoqueMovimentacoes.id, id));
      return (row as ManutencaoMovimentacaoRow | undefined) ?? null;
    },
    async marcarMovimentacaoEstornada(id, motivo) {
      await tx.update(estoqueMovimentacoes).set({
        status: "estornada",
        motivoEstorno: motivo,
      }).where(eq(estoqueMovimentacoes.id, id));
    },
  };
}

export async function persistirManutencaoMysql(input: PersistirManutencaoInput) {
  return db.transaction(async (tx) => {
    for (const peca of input.pecas) {
      const locked = await tx
        .select({ id: estoque.id })
        .from(estoque)
        .where(eq(estoque.id, peca.estoqueId))
        .for("update");
      if (!locked[0]) {
        throw new ManutencaoEstoqueError(MSG_MANUT_ESTOQUE_AUSENTE_MYSQL);
      }
    }
    return persistirManutencaoComPecasNoTx(criarManutencaoEstoqueTx(tx), input);
  });
}

export async function estornarManutencaoMysql(input: EstornarManutencaoInput) {
  return db.transaction(async (tx) => {
    return estornarManutencaoNoTx(criarManutencaoEstoqueTx(tx), input);
  });
}

export async function listarVinculosManutencaoPorMovimentacaoIds(ids: number[]): Promise<number[]> {
  const unicos = [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!unicos.length) return [];
  const rows = await db
    .select({ mid: manutencaoPecas.estoqueMovimentacaoId })
    .from(manutencaoPecas)
    .where(inArray(manutencaoPecas.estoqueMovimentacaoId, unicos));
  return rows
    .map((r) => Number(r.mid))
    .filter((id) => Number.isInteger(id) && id > 0);
}

export async function recusarEstornoGenericoSeManutencao(
  movimentacoes: Array<{ id: number; manejo?: string | null; grupoId?: string | null }>,
): Promise<void> {
  const vinculos = await listarVinculosManutencaoPorMovimentacaoIds(movimentacoes.map((m) => m.id));
  if (deveBloquearEstornoGenericoManutencao({
    movimentacoes,
    movimentacaoIdsComVinculoManutencao: vinculos,
  })) {
    throw new ManutencaoEstoqueError(MSG_ESTORNO_GENERICO_MANUTENCAO);
  }
}
