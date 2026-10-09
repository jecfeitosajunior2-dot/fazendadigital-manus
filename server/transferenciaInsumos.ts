import { TRPCError } from "@trpc/server";
import { isMysqlDuplicateKey } from "../shared/compraInsumos";
import {
  ESTOQUE_OPERACAO_MOTIVO_TRANSFERENCIA,
  ESTOQUE_OPERACAO_TIPO_TRANSFERENCIA,
  isOperacaoTransferenciaInsumos,
  validarTransferenciaInsumosInput,
} from "../shared/estoqueTransferencia";
import { transferirEstoqueNoTx, type TransferenciaSaldoExecutor } from "./estoqueSaldoTx";
import { estornarMovimentacaoEstoqueNoTx } from "./estoqueSaldoTx";
import type { EstoqueItemParaMovimentacao, MovimentacaoEstoqueInsert } from "./estoqueMovimentacaoTx";

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

export type TransferenciaOperacaoRow = {
  id: number;
  userId: number;
  fazendaId: number;
  fazendaDestinoId: number | null;
  tipo: string;
  motivo: string;
  dataOperacao: string;
  status: string;
  idempotencyKey: string;
};

export type TransferenciaMovRow = {
  id: number;
  estoqueId: number;
  quantidade: string;
  valorEstoqueMovimentado: string | null;
  status: string | null;
  grupoId: string | null;
  tipo: string | null;
  fazendaId: number | null;
};

export type TransferenciaInsumosTx = TransferenciaSaldoExecutor & {
  findOperacao(userId: number, id: number): Promise<TransferenciaOperacaoRow | null>;
  findOperacaoPorIdem(userId: number, key: string): Promise<{ id: number; status: string } | null>;
  listMovimentacoesOperacao(operacaoId: number): Promise<TransferenciaMovRow[]>;
  updateOperacaoEstornada(userId: number, id: number, motivo: string, em: Date): Promise<void>;
  updateMovimentacaoEstornada(id: number, motivo: string, userId: number, nome: string): Promise<void>;
  transaction<T>(fn: (tx: TransferenciaInsumosTx) => Promise<T>): Promise<T>;
};

export function createTransferenciaInsumosService(store: {
  transaction<T>(fn: (tx: TransferenciaInsumosTx) => Promise<T>): Promise<T>;
}) {
  return {
    async confirmar(
      userId: number,
      registradoPor: string,
      input: {
        idempotencyKey: string;
        fazendaOrigemId: number;
        fazendaDestinoId: number;
        dataOperacao: string;
        itens: { estoqueOrigemId: number; quantidade: string }[];
      },
    ) {
      const erro = validarTransferenciaInsumosInput(input);
      if (erro) toTrpc(erro);
      try {
        return await store.transaction(tx => transferirEstoqueNoTx(tx, {
          userId,
          registradoPor,
          ...input,
          dataOperacao: input.dataOperacao.slice(0, 10),
        }));
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (isMysqlDuplicateKey(error)) {
          return store.transaction(async tx => {
            const existente = await tx.findOperacaoPorIdem(userId, input.idempotencyKey);
            if (existente) return { id: existente.id, idempotent: true, itemCount: input.itens.length };
            throw error;
          });
        }
        throw error instanceof Error ? new TRPCError({ code: "BAD_REQUEST", message: error.message }) : error;
      }
    },

    async estornar(
      userId: number,
      registradoPor: string,
      operacaoId: number,
      motivo: string,
    ) {
      return store.transaction(async tx => {
        const op = await tx.findOperacao(userId, operacaoId);
        if (!op) toTrpc("Transferência não encontrada.", "NOT_FOUND");
        if (!isOperacaoTransferenciaInsumos(op)) toTrpc("Esta operação não é uma transferência.");
        if (op.status === "estornada") {
          return { success: true as const, id: op.id, already: true };
        }
        const movs = await tx.listMovimentacoesOperacao(op.id);
        const ativas = movs.filter(m => (m.status || "ativa") === "ativa");
        const hoje = new Date().toISOString().slice(0, 10);
        const grupoEstorno = `e-tr-${op.id}`;

        for (const mov of ativas) {
          await estornarMovimentacaoEstoqueNoTx({
            ...tx,
            async marcarMovimentacaoEstornada(id, mot) {
              await tx.updateMovimentacaoEstornada(id, mot, userId, registradoPor);
            },
          }, {
            estoqueId: mov.estoqueId,
            quantidadeOriginal: mov.quantidade,
            valorSnapshot: mov.valorEstoqueMovimentado,
            grupoId: grupoEstorno,
            originalGrupoId: mov.grupoId,
            tipo: mov.tipo,
            dataMovimentacao: hoje,
            fazendaId: mov.fazendaId,
            userId,
            registradoPor,
            motivoEstorno: motivo,
            originalMovId: mov.id,
          });
        }
        await tx.updateOperacaoEstornada(userId, op.id, motivo, new Date());
        return { success: true as const, id: op.id, already: false };
      });
    },
  };
}

export { ESTOQUE_OPERACAO_TIPO_TRANSFERENCIA, ESTOQUE_OPERACAO_MOTIVO_TRANSFERENCIA };
export type { EstoqueItemParaMovimentacao, MovimentacaoEstoqueInsert };
