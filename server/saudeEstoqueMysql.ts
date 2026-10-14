import { and, eq, inArray, sql } from "drizzle-orm";
import { estoque, estoqueMovimentacoes, saudeRegistros } from "../drizzle/schema";
import { db } from "./db";
import { criarExecutorSaldoDrizzle } from "./estoqueSaldoTx";
import {
  estornarManejoSanitarioNoTx,
  persistirManejoSanitarioNoTx,
  type EstornarManejoSanitarioInput,
  type PersistirManejoSanitarioInput,
  type SaudeEstoqueTx,
  type SaudeMovimentacaoRow,
  type SaudeRegistroRow,
  SaudeEstoqueError,
} from "./saudeEstoque";
import {
  deveBloquearEstornoGenericoSanitario,
  MSG_ESTORNO_GENERICO_SANITARIO,
} from "../shared/saudeEstoque";

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

export function criarSaudeEstoqueTx(tx: DrizzleLike): SaudeEstoqueTx {
  const saldo = criarExecutorSaldoDrizzle(tx);
  return {
    ...saldo,
    async insertRegistro(row) {
      const result = await tx.insert(saudeRegistros).values({
        userId: row.userId,
        animalId: row.animalId,
        tipo: row.tipo,
        descricao: row.descricao,
        medicamento: row.medicamento,
        dosagem: row.dosagem,
        viaAplicacao: row.viaAplicacao,
        estoqueId: row.estoqueId ?? undefined,
        quantidadeConsumo: row.quantidadeConsumo ?? undefined,
        valorUnitario: row.valorUnitario ?? undefined,
        veterinario: row.veterinario,
        custo: row.custo ?? undefined,
        dataRegistro: row.dataRegistro,
        proximaData: row.proximaData ?? undefined,
        observacoes: row.observacoes,
        estoqueMovimentacaoId: row.estoqueMovimentacaoId ?? undefined,
        status: row.status,
      });
      return insertIdOf(result);
    },
    async updateRegistro(id, patch) {
      const { estornadoEmAgora, ...rest } = patch;
      await tx.update(saudeRegistros).set({
        ...rest,
        ...(estornadoEmAgora ? { estornadoEm: sql`CURRENT_TIMESTAMP` } : {}),
      }).where(eq(saudeRegistros.id, id));
    },
    async findRegistro(userId, id) {
      const [row] = await tx
        .select()
        .from(saudeRegistros)
        .where(and(eq(saudeRegistros.id, id), eq(saudeRegistros.userId, userId)));
      return (row as SaudeRegistroRow | undefined) ?? null;
    },
    async findMovimentacao(id) {
      const [row] = await tx
        .select()
        .from(estoqueMovimentacoes)
        .where(eq(estoqueMovimentacoes.id, id));
      return (row as SaudeMovimentacaoRow | undefined) ?? null;
    },
    async marcarMovimentacaoEstornada(id, motivo) {
      await tx.update(estoqueMovimentacoes).set({
        status: "estornada",
        motivoEstorno: motivo,
      }).where(eq(estoqueMovimentacoes.id, id));
    },
  };
}

export async function persistirManejoSanitarioMysql(input: PersistirManejoSanitarioInput) {
  return db.transaction(async (tx) => {
    if (input.estoqueId) {
      const locked = await tx
        .select({ id: estoque.id })
        .from(estoque)
        .where(eq(estoque.id, input.estoqueId))
        .for("update");
      if (!locked[0]) {
        throw new SaudeEstoqueError(
          "Produto de estoque não encontrado. Atualize a lista e tente novamente.",
        );
      }
    }
    return persistirManejoSanitarioNoTx(criarSaudeEstoqueTx(tx), input);
  });
}

export async function estornarManejoSanitarioMysql(input: EstornarManejoSanitarioInput) {
  return db.transaction(async (tx) => {
    return estornarManejoSanitarioNoTx(criarSaudeEstoqueTx(tx), input);
  });
}

export async function listarVinculosSaudePorMovimentacaoIds(ids: number[]): Promise<number[]> {
  const unicos = [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!unicos.length) return [];
  const rows = await db
    .select({ mid: saudeRegistros.estoqueMovimentacaoId })
    .from(saudeRegistros)
    .where(inArray(saudeRegistros.estoqueMovimentacaoId, unicos));
  return rows
    .map((r) => Number(r.mid))
    .filter((id) => Number.isInteger(id) && id > 0);
}

/** Autoridade do estorno genérico: recusa Sanitário antes de qualquer escrita. */
export async function recusarEstornoGenericoSeSanitario(
  movimentacoes: Array<{ id: number; manejo?: string | null; grupoId?: string | null }>,
): Promise<void> {
  const vinculos = await listarVinculosSaudePorMovimentacaoIds(movimentacoes.map((m) => m.id));
  if (deveBloquearEstornoGenericoSanitario({
    movimentacoes,
    movimentacaoIdsComVinculoSaude: vinculos,
  })) {
    throw new SaudeEstoqueError(MSG_ESTORNO_GENERICO_SANITARIO);
  }
}
