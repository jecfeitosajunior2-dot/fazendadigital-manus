import { eq, inArray } from "drizzle-orm";
import { estoque, manutencaoPecas, manutencoes } from "../drizzle/schema";
import { db } from "./db";
import {
  estornarManutencaoCompletaNoTx,
  pecaOficinaParaInsert,
  persistirManutencaoCompletaNoTx,
  type ComplementoOsPatch,
  type PersistenciaCompletaCtx,
  type PersistirManutencaoCompletaInput,
} from "./manutencaoCompleta";
import {
  criarManutencaoEstoqueTx,
} from "./manutencaoEstoqueMysql";
import {
  ManutencaoEstoqueError,
  persistirManutencaoComPecasNoTx,
  type EstornarManutencaoInput,
} from "./manutencaoEstoque";
import { MSG_MANUT_ESTOQUE_AUSENTE_MYSQL } from "../shared/manutencaoEstoque";
import { MANUT_PECA_ORIGEM_ESTOQUE, type PecaOficinaNormalizada } from "../shared/manutencaoPecasOrigem";
import { MANUT_STATUS_CONCLUIDA } from "../shared/manutencaoEstoque";

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

export function criarPersistenciaCompletaCtx(tx: DrizzleLike): PersistenciaCompletaCtx {
  const motor = criarManutencaoEstoqueTx(tx);
  return {
    persistirEstoque: (input) => persistirManutencaoComPecasNoTx(motor, input),
    async inserirOsSemEstoque(row) {
      const result = await tx.insert(manutencoes).values({
        userId: row.userId,
        maquinaId: row.maquinaId,
        tipo: row.tipo,
        descricao: row.descricao,
        data: row.data,
        horimetro: row.horimetro ?? undefined,
        proximaManutencao: row.proximaManutencao ?? undefined,
        status: MANUT_STATUS_CONCLUIDA,
        prestadorNome: row.prestadorNome ?? undefined,
        prestadorContato: row.prestadorContato ?? undefined,
        prestadorPessoaId: row.prestadorPessoaId ?? undefined,
        tipoExecucao: row.tipoExecucao ?? undefined,
        valorMaoObra: row.valorMaoObra,
        valorPecas: row.valorPecas,
        valorPecasOficina: row.valorPecasOficina,
        valorCobradoOficina: row.valorCobradoOficina,
        valorTotal: row.valorTotal,
        custo: row.custo,
        observacoes: row.observacoes ?? undefined,
      });
      return insertIdOf(result);
    },
    async marcarOrigemEstoque(pecaIds) {
      if (!pecaIds.length) return;
      await tx
        .update(manutencaoPecas)
        .set({ origem: MANUT_PECA_ORIGEM_ESTOQUE })
        .where(inArray(manutencaoPecas.id, pecaIds));
    },
    async gravarPecasOficina(osId, pecas: PecaOficinaNormalizada[]) {
      if (!pecas.length) return [];
      const ids: number[] = [];
      for (const peca of pecas) {
        const result = await tx.insert(manutencaoPecas).values(pecaOficinaParaInsert(osId, peca));
        const id = insertIdOf(result);
        if (id) ids.push(id);
      }
      return ids;
    },
    async lerTotaisOs(osId) {
      const [row] = await tx
        .select({
          valorPecas: manutencoes.valorPecas,
          valorMaoObra: manutencoes.valorMaoObra,
        })
        .from(manutencoes)
        .where(eq(manutencoes.id, osId));
      return {
        valorPecas: Number(row?.valorPecas ?? 0),
        valorMaoObra: Number(row?.valorMaoObra ?? 0),
      };
    },
    async atualizarComplementoOs(osId, patch: ComplementoOsPatch) {
      await tx
        .update(manutencoes)
        .set({
          valorPecas: patch.valorPecas,
          valorPecasOficina: patch.valorPecasOficina,
          valorCobradoOficina: patch.valorCobradoOficina,
          valorTotal: patch.valorTotal,
          custo: patch.custo,
          ...(patch.tipoExecucao ? { tipoExecucao: patch.tipoExecucao } : {}),
          ...(patch.prestadorPessoaId !== undefined
            ? { prestadorPessoaId: patch.prestadorPessoaId }
            : {}),
        })
        .where(eq(manutencoes.id, osId));
    },
  };
}

export async function persistirManutencaoCompletaMysql(input: PersistirManutencaoCompletaInput) {
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
    return persistirManutencaoCompletaNoTx(criarPersistenciaCompletaCtx(tx), input);
  });
}

export async function estornarManutencaoCompletaMysql(input: EstornarManutencaoInput) {
  return db.transaction(async (tx) => {
    return estornarManutencaoCompletaNoTx(criarManutencaoEstoqueTx(tx), input);
  });
}

export async function schemaPecasOficinaCompativel(
  query: <T>(sqlText: string, params?: unknown[]) => Promise<T>,
): Promise<boolean> {
  const origem = await query<{ Field?: string }[]>(
    `SHOW COLUMNS FROM \`manutencao_pecas\` LIKE ?`,
    ["origem"],
  );
  const pecasOficina = await query<{ Field?: string }[]>(
    `SHOW COLUMNS FROM \`manutencoes\` LIKE ?`,
    ["valorPecasOficina"],
  );
  const cobrado = await query<{ Field?: string }[]>(
    `SHOW COLUMNS FROM \`manutencoes\` LIKE ?`,
    ["valorCobradoOficina"],
  );
  return origem.length > 0 && pecasOficina.length > 0 && cobrado.length > 0;
}
