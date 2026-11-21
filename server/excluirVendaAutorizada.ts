import { TRPCError } from "@trpc/server";
import type { ConsultaAutorizacaoPersistida } from "./cadastroAnimalAutorizado";
import {
  MSG_SEM_PERMISSAO_EXCLUIR_VENDAS,
  MSG_VENDA_EXCLUIR_COM_EFEITO,
  PERMISSAO_INATIVAR_VENDAS,
  autorizarVendaNaFazenda,
  erroVendaConsulta,
} from "./consultaVendaAutorizada";

export type VendaParaExcluir = {
  id: number;
  userId: number;
  fazendaId: number | null;
  status: string | null;
};

export type TxExcluirVenda = ConsultaAutorizacaoPersistida & {
  espiarVenda(id: number): Promise<{ userId: number; fazendaId: number | null } | null>;
  travarVenda(id: number, titularUserId: number): Promise<VendaParaExcluir | null>;
  temItem(titularUserId: number, vendaId: number): Promise<boolean>;
  temTitulo(titularUserId: number, vendaId: number): Promise<boolean>;
  apagarRascunho(id: number, titularUserId: number): Promise<number>;
};

export type IoExcluirVenda = {
  emTransacao<T>(fn: (tx: TxExcluirVenda) => Promise<T>): Promise<T>;
};

function naoEncontrada(): never {
  throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada." });
}

function comEfeito(): never {
  throw new TRPCError({ code: "BAD_REQUEST", message: MSG_VENDA_EXCLUIR_COM_EFEITO });
}

/**
 * A leitura, a permissão e a exclusão acontecem na mesma transação.
 * Só um rascunho pendente, sem animal e sem título, pode sair.
 */
export async function excluirRascunhoVenda(
  io: IoExcluirVenda,
  executorId: number,
  sessionVersionDaSessao: number | null,
  vendaId: number,
) {
  if (!Number.isInteger(vendaId) || vendaId <= 0) naoEncontrada();
  return io.emTransacao(async (tx) => {
    const peek = await tx.espiarVenda(vendaId);
    if (!peek?.userId) naoEncontrada();

    let titular = peek.userId;
    if (peek.fazendaId == null) {
      const usuario = await tx.usuario(executorId);
      const sessaoOk = sessionVersionDaSessao == null || sessionVersionDaSessao === usuario?.sessionVersion;
      if (
        !usuario
        || !sessaoOk
        || usuario.situacao !== "ativo"
        || usuario.papel !== "principal"
        || usuario.titularUserId !== peek.userId
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_EXCLUIR_VENDAS });
      }
      titular = usuario.titularUserId;
    } else {
      const acesso = await autorizarVendaNaFazenda({
        emTransacao: (fn) => fn(tx),
      }, {
        executorId,
        sessionVersionDaSessao,
        fazendaId: peek.fazendaId,
        permissaoId: PERMISSAO_INATIVAR_VENDAS,
      }, MSG_SEM_PERMISSAO_EXCLUIR_VENDAS);
      if (!acesso.ok) throw erroVendaConsulta(acesso, MSG_SEM_PERMISSAO_EXCLUIR_VENDAS);
      if (peek.userId !== acesso.titularUserId) naoEncontrada();
      titular = acesso.titularUserId;
    }

    const venda = await tx.travarVenda(vendaId, titular);
    if (!venda) naoEncontrada();
    if (venda.status !== "pendente") comEfeito();
    if (await tx.temItem(titular, vendaId)) comEfeito();
    if (await tx.temTitulo(titular, vendaId)) comEfeito();
    const afetadas = await tx.apagarRascunho(vendaId, titular);
    if (afetadas !== 1) comEfeito();
    return { success: true as const };
  });
}
