import { TRPCError } from "@trpc/server";
import {
  autorizarOperacaoPersistida,
  type ConsultaAutorizacaoPersistida,
  type PedidoAutorizacaoPersistida,
} from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";

export const PERMISSAO_CONSULTAR_ESTOQUE = "estoque.visualizar";
export const PERMISSAO_MOVIMENTAR_ESTOQUE = "estoque.criar";
export const PERMISSAO_EDITAR_ESTOQUE = "estoque.editar";
export const PERMISSAO_INATIVAR_ESTOQUE = "estoque.inativar";
export const PERMISSAO_CONFIRMAR_ESTOQUE = "estoque.confirmar";
export const PERMISSAO_ESTORNAR_ESTOQUE = "estoque.estornar";

export const MSG_SEM_PERMISSAO_ESTOQUE = "Sem permissão para consultar o estoque.";
export const MSG_SEM_PERMISSAO_MOVIMENTO_ESTOQUE = "Sem permissão para movimentar o estoque.";
export const MSG_SEM_PERMISSAO_EDITAR_ESTOQUE = "Sem permissão para editar o estoque.";
export const MSG_SEM_PERMISSAO_INATIVAR_ESTOQUE = "Sem permissão para inativar o estoque.";
export const MSG_SEM_PERMISSAO_CONFIRMAR_ESTOQUE = "Sem permissão para confirmar esta operação de estoque.";
export const MSG_SEM_PERMISSAO_ESTORNAR_ESTOQUE = "Sem permissão para estornar o estoque.";
export const MSG_SEM_FAZENDA_ESTOQUE = "Você não tem acesso a esta fazenda.";
export const MSG_EXCLUSAO_FISICA_ESTOQUE =
  "A exclusão do estoque está bloqueada. Apagar produto ou movimento deixaria saldo e histórico sem rastreio. Para corrigir uma quantidade, registre uma movimentação ou um estorno.";

export function recusarEstoqueSemMysql(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "O banco de dados está indisponível. Nenhum saldo foi consultado ou alterado.",
  });
}

export function recusarExclusaoFisicaEstoque(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: MSG_EXCLUSAO_FISICA_ESTOQUE,
  });
}

export type IoEstoque = {
  emTransacao<T>(fn: (tx: ConsultaAutorizacaoPersistida) => Promise<T>): Promise<T>;
};

export type RecusaEstoque = {
  ok: false;
  motivo: MotivoOperacional | "sem_permissao";
  mensagem?: string;
};

export function erroEstoque(resultado: RecusaEstoque, semPermissao = MSG_SEM_PERMISSAO_ESTOQUE): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: semPermissao });
    case "sem_fazenda":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_ESTOQUE });
    default:
      return new TRPCError({ code: "NOT_FOUND", message: resultado.mensagem ?? "Produto não encontrado." });
  }
}

type PedidoBase = Omit<PedidoAutorizacaoPersistida, "permissaoId" | "fazendaId">;

export async function fazendasDaConsultaEstoque(
  io: IoEstoque,
  pedido: PedidoBase & { permissaoId: string },
): Promise<{ ok: true; titularUserId: number; fazendaIds: number[] } | RecusaEstoque> {
  return io.emTransacao(async (tx) => {
    const usuario = await tx.usuario(pedido.executorId);
    if (!usuario || usuario.titularUserId == null || usuario.situacao !== "ativo") {
      return { ok: false, motivo: "sem_identidade", mensagem: "Sessão inválida." };
    }
    if (
      pedido.sessionVersionDaSessao != null
      && pedido.sessionVersionDaSessao !== usuario.sessionVersion
    ) {
      return { ok: false, motivo: "sem_identidade", mensagem: "Sessão inválida." };
    }
    const fazendas = [...await tx.fazendasDoTitular(usuario.titularUserId)].sort((a, b) => a.id - b.id);
    const autorizadas: number[] = [];
    for (const fazenda of fazendas) {
      const decisao = await autorizarOperacaoPersistida(tx, {
        ...pedido,
        fazendaId: fazenda.id,
      });
      if (!decisao.ok) {
        if (decisao.motivo === "sem_identidade" || decisao.motivo === "sem_permissao") {
          return {
            ok: false,
            motivo: decisao.motivo,
            mensagem: decisao.motivo === "sem_permissao" ? MSG_SEM_PERMISSAO_ESTOQUE : "Sessão inválida.",
          };
        }
        continue;
      }
      autorizadas.push(fazenda.id);
    }
    return { ok: true, titularUserId: usuario.titularUserId, fazendaIds: autorizadas };
  });
}

export async function autorizarEstoqueNaFazenda(
  io: IoEstoque,
  pedido: PedidoBase & { fazendaId: number; permissaoId: string },
  semPermissao: string,
): Promise<{ ok: true; titularUserId: number } | RecusaEstoque> {
  return io.emTransacao(async (tx) => {
    const decisao = await autorizarOperacaoPersistida(tx, pedido);
    if (!decisao.ok) {
      if (decisao.motivo === "sem_permissao") {
        return { ok: false, motivo: "sem_permissao", mensagem: semPermissao };
      }
      if (decisao.motivo === "sem_fazenda") {
        return { ok: false, motivo: "sem_fazenda", mensagem: MSG_SEM_FAZENDA_ESTOQUE };
      }
      if (decisao.motivo === "sem_identidade") {
        return { ok: false, motivo: "sem_identidade", mensagem: "Sessão inválida." };
      }
      return { ok: false, motivo: decisao.motivo };
    }
    return { ok: true, titularUserId: decisao.contexto.titularUserId };
  });
}

export async function autorizarMovimentoEstoque(
  io: IoEstoque,
  pedido: PedidoBase & { fazendaId: number },
): Promise<{ ok: true; titularUserId: number } | RecusaEstoque> {
  return autorizarEstoqueNaFazenda(io, {
    ...pedido,
    permissaoId: PERMISSAO_MOVIMENTAR_ESTOQUE,
  }, MSG_SEM_PERMISSAO_MOVIMENTO_ESTOQUE);
}
