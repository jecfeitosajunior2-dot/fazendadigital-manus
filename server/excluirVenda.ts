import { and, eq } from "drizzle-orm";
import { financeiroTitulos, vendaItens, vendas } from "../drizzle/schema";
import { FINANCEIRO_ORIGEM_VENDA_ANIMAIS } from "../shared/financeiroNucleo";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import { db } from "./db";
import { excluirRascunhoVenda, type TxExcluirVenda } from "./excluirVendaAutorizada";

function afetadas(result: unknown): number {
  const comoLista = result as { affectedRows?: number }[];
  const comoObjeto = result as { affectedRows?: number };
  return Number(comoLista?.[0]?.affectedRows ?? comoObjeto?.affectedRows ?? 0);
}

function trava<T extends { for?: (modo: "update") => T; limit: (n: number) => Promise<unknown[]> }>(consulta: T) {
  return typeof consulta.for === "function" ? consulta.for("update") : consulta;
}

export function excluirRascunhoVendaAutorizado(
  executorId: number,
  sessionVersionDaSessao: number | null,
  vendaId: number,
) {
  return excluirRascunhoVenda({
    emTransacao(fn) {
      return db.transaction(async (tx) => {
        const base = consultaEstoqueNaTransacao(tx as never);
        const operacao: TxExcluirVenda = {
          ...base,
          async espiarVenda(id) {
            const [linha] = await tx
              .select({ userId: vendas.userId, fazendaId: vendas.fazendaId })
              .from(vendas)
              .where(eq(vendas.id, id))
              .limit(1);
            return linha ?? null;
          },
          async travarVenda(id, titularUserId) {
            const consulta = tx
              .select({
                id: vendas.id,
                userId: vendas.userId,
                fazendaId: vendas.fazendaId,
                status: vendas.status,
              })
              .from(vendas)
              .where(and(eq(vendas.id, id), eq(vendas.userId, titularUserId)));
            const [linha] = await trava(consulta as never).limit(1) as Array<{
              id: number;
              userId: number;
              fazendaId: number | null;
              status: string | null;
            }>;
            return linha ?? null;
          },
          async temItem(titularUserId, id) {
            const [linha] = await tx
              .select({ id: vendaItens.id })
              .from(vendaItens)
              .where(and(eq(vendaItens.userId, titularUserId), eq(vendaItens.vendaId, id)))
              .limit(1);
            return Boolean(linha);
          },
          async temTitulo(titularUserId, id) {
            const [linha] = await tx
              .select({ id: financeiroTitulos.id })
              .from(financeiroTitulos)
              .where(and(
                eq(financeiroTitulos.userId, titularUserId),
                eq(financeiroTitulos.origemTipo, FINANCEIRO_ORIGEM_VENDA_ANIMAIS),
                eq(financeiroTitulos.origemId, id),
              ))
              .limit(1);
            return Boolean(linha);
          },
          async apagarRascunho(id, titularUserId) {
            const resultado = await tx
              .delete(vendas)
              .where(and(eq(vendas.id, id), eq(vendas.userId, titularUserId), eq(vendas.status, "pendente")));
            return afetadas(resultado);
          },
        };
        return fn(operacao);
      }, { isolationLevel: "read committed" });
    },
  }, executorId, sessionVersionDaSessao, vendaId);
}
